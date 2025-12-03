"""
按图片去重的清理脚本

场景：
- 不同 URL / tab_id，但使用了同一张 OG 图（image 或 screenshot_image）
- 这些重复图片会在粗召回阶段被多次命中，占用召回配额和排序资源

策略：
- 以 (user_id, image) 或 (user_id, screenshot_image) 为维度分组
- 对于每一组：
  - 按 created_at 降序排列
  - 保留最新的一条记录
  - 其余全部软删除（status='deleted'，不物理删除）

用法：

1. 先 dry-run 看要删哪些：

   python cleanup_duplicate_images.py --user-id anonymous

2. 确认无误后实际执行：

   python cleanup_duplicate_images.py --user-id anonymous --execute
"""

import asyncio
import os
from typing import Optional, Dict, List, Tuple

from dotenv import load_dotenv

load_dotenv()

from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id  # type: ignore


async def find_duplicate_images(
    user_id: Optional[str] = None,
    min_count: int = 2,
) -> Tuple[List[Dict], List[Dict]]:
    """
    查找按 image / screenshot_image 维度的重复记录。

    Returns:
        (image_duplicates, screenshot_duplicates)
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None

    async with pool.acquire() as conn:
        params = []
        user_clause = ""
        if normalized_user:
            user_clause = "AND user_id = $1"
            params.append(normalized_user)

        # 计算 HAVING 子句中 COUNT(*) 的占位符位置
        # 如果有 user_id，占位符应为 $2，否则为 $1
        count_placeholder = f"${len(params) + 1}"

        # 按 image 分组
        image_query = f"""
            SELECT
                user_id,
                image,
                COUNT(*) AS cnt,
                ARRAY_AGG(tab_id ORDER BY created_at DESC) AS tab_ids,
                ARRAY_AGG(url ORDER BY created_at DESC) AS urls,
                ARRAY_AGG(created_at ORDER BY created_at DESC) AS created_at_list
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND image IS NOT NULL
              AND image != ''
              {user_clause}
            GROUP BY user_id, image
            HAVING COUNT(*) >= {count_placeholder}
            ORDER BY cnt DESC;
        """
        image_rows = await conn.fetch(image_query, *params, min_count)

        # 按 screenshot_image 分组
        screenshot_query = f"""
            SELECT
                user_id,
                screenshot_image,
                COUNT(*) AS cnt,
                ARRAY_AGG(tab_id ORDER BY created_at DESC) AS tab_ids,
                ARRAY_AGG(url ORDER BY created_at DESC) AS urls,
                ARRAY_AGG(created_at ORDER BY created_at DESC) AS created_at_list
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND screenshot_image IS NOT NULL
              AND screenshot_image != ''
              {user_clause}
            GROUP BY user_id, screenshot_image
            HAVING COUNT(*) >= {count_placeholder}
            ORDER BY cnt DESC;
        """
        screenshot_rows = await conn.fetch(screenshot_query, *params, min_count)

        def row_to_dict(row) -> Dict:
            return {
                "user_id": row["user_id"],
                # image 或 screenshot_image 字段名在外层区分
                "cnt": int(row["cnt"]),
                "tab_ids": list(row["tab_ids"]),
                "urls": list(row["urls"]),
                "created_at_list": [str(ts) for ts in row["created_at_list"]],
            }

        image_duplicates = []
        for r in image_rows:
            d = row_to_dict(r)
            d["image"] = r["image"]
            image_duplicates.append(d)

        screenshot_duplicates = []
        for r in screenshot_rows:
            d = row_to_dict(r)
            d["screenshot_image"] = r["screenshot_image"]
            screenshot_duplicates.append(d)

        return image_duplicates, screenshot_duplicates


async def cleanup_duplicate_images(
    user_id: Optional[str] = None,
    execute: bool = False,
    min_count: int = 2,
) -> None:
    """
    按图片去重：
    - 对每个 (user_id, image) / (user_id, screenshot_image) 分组
    - 保留最新的一条 tab_id，其余全部 status='deleted'
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None

    image_dups, screenshot_dups = await find_duplicate_images(user_id=user_id, min_count=min_count)

    print("\n================================================================================")
    print("1. 按 image 去重")
    print("================================================================================")
    print(f"找到 {len(image_dups)} 组 image 重复")

    total_delete_by_image = 0
    for group in image_dups[:20]:  # 只预览前 20 组，避免日志太长
        print("\n----------------------------------------")
        print(f"Image: {group['image'][:100]}...")
        print(f"重复次数: {group['cnt']}")
        print("URLs 示例:")
        for url in group["urls"][:3]:
            print(f"  - {url}")

    print("\n================================================================================")
    print("2. 按 screenshot_image 去重")
    print("================================================================================")
    print(f"找到 {len(screenshot_dups)} 组 screenshot_image 重复")

    total_delete_by_screenshot = 0
    for group in screenshot_dups[:20]:
        print("\n----------------------------------------")
        print(f"Screenshot: {group['screenshot_image'][:100]}...")
        print(f"重复次数: {group['cnt']}")
        print("URLs 示例:")
        for url in group["urls"][:3]:
            print(f"  - {url}")

    if not execute:
        print("\n⚠️  当前为 DRY RUN 模式（不会实际删除数据）")
        print("    使用 --execute 参数来实际执行删除")
        return

    # 需要执行删除时，再真正跑 UPDATE
    async with pool.acquire() as conn:
        # 提示确认（避免误删）
        try:
            response = input("\n❗将根据 image / screenshot_image 删除重复项（软删除），确认继续吗？(yes/no): ")
        except EOFError:
            print("输入被中断，取消操作。")
            return

        if response.strip().lower() not in ("yes", "y"):
            print("已取消删除操作。")
            return

        # 1. 按 image 删除
        for group in image_dups:
            tab_ids: List[int] = group["tab_ids"]
            if not tab_ids or len(tab_ids) < 2:
                continue
            # 保留最新的 tab_id（数组第一位），删除其余
            keep = tab_ids[0]
            delete_ids = tab_ids[1:]
            total_delete_by_image += len(delete_ids)

            print(f"\n[Image] 保留 tab_id={keep}，删除 {len(delete_ids)} 条重复记录")
            await conn.execute(
                f"""
                UPDATE {ACTIVE_TABLE}
                SET status = 'deleted'
                WHERE status = 'active'
                  AND tab_id = ANY($1::int[])
                  {"AND user_id = $2" if normalized_user else ""}
                """,
                delete_ids,
                *( [normalized_user] if normalized_user else [] ),
            )

        # 2. 按 screenshot_image 删除
        for group in screenshot_dups:
            tab_ids = group["tab_ids"]
            if not tab_ids or len(tab_ids) < 2:
                continue
            keep = tab_ids[0]
            delete_ids = tab_ids[1:]
            total_delete_by_screenshot += len(delete_ids)

            print(f"\n[Screenshot] 保留 tab_id={keep}，删除 {len(delete_ids)} 条重复记录")
            await conn.execute(
                f"""
                UPDATE {ACTIVE_TABLE}
                SET status = 'deleted'
                WHERE status = 'active'
                  AND tab_id = ANY($1::int[])
                  {"AND user_id = $2" if normalized_user else ""}
                """,
                delete_ids,
                *( [normalized_user] if normalized_user else [] ),
            )

    print("\n================================================================================")
    print("✅ 去重完成（按图片）")
    print(f"  按 image 删除: {total_delete_by_image} 条")
    print(f"  按 screenshot_image 删除: {total_delete_by_screenshot} 条")
    print("================================================================================")


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="按图片去重（image / screenshot_image）")
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="用户 ID（默认: 所有用户）",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际执行删除（默认只做 dry run 预览）",
    )
    parser.add_argument(
        "--min-count",
        type=int,
        default=2,
        help="至少多少条才视为重复（默认: 2）",
    )

    args = parser.parse_args()

    await cleanup_duplicate_images(
        user_id=args.user_id,
        execute=args.execute,
        min_count=args.min_count,
    )


if __name__ == "__main__":
    asyncio.run(main())


