"""
批量生成 Caption 脚本（修复版）
从数据库获取没有 Caption 的数据，批量生成并更新
✅ 新增：更新后发送 WebSocket 通知，让前端实时收到 caption
"""
import asyncio
import argparse
import sys
import time
from typing import List, Dict, Optional
from datetime import datetime
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 导入数据库和搜索模块
from pathlib import Path

# 添加父目录到路径，以便导入 vector_db
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from vector_db import (
    get_pool,
    close_pool,
    ACTIVE_TABLE,
    ACTIVE_TABLE_NAME,
    NAMESPACE,
    _normalize_user_id,
    _row_to_dict,
    _normalize_url_for_storage,
)
from search.caption import batch_enrich_items
from search.qwen_vl_client import QwenVLClient
from search.embed import embed_text
from search.config import get_api_key


def to_vector_str(vec: Optional[List[float]]) -> Optional[str]:
    """将向量列表转换为数据库格式"""
    if not vec:
        return None
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


async def get_items_without_caption(
    user_id: Optional[str] = None,
    max_items: Optional[int] = None,
    force_all: bool = False,
) -> List[Dict]:
    """
    从数据库获取需要补充 Caption 的数据
    """
    pool = await get_pool()

    # 检查新字段是否存在
    async with pool.acquire() as conn:
        has_new_fields = await conn.fetchval(
            f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = '{NAMESPACE}'
                  AND table_name = '{ACTIVE_TABLE_NAME}'
                  AND column_name = 'image_caption'
            );
        """
        )

    # 构建查询条件
    if has_new_fields:
        if user_id:
            user_id = _normalize_user_id(user_id)
            if force_all:
                where_clause = """WHERE user_id = $1 
                    AND status = 'active' 
                    AND image IS NOT NULL AND image != ''"""
            else:
                where_clause = """WHERE user_id = $1 
                    AND status = 'active' 
                    AND (image_caption IS NULL OR image_caption = '')
                    AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                    AND image IS NOT NULL AND image != ''"""
            if max_items is not None:
                params = (user_id, max_items)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata,
                        image_caption, caption_embedding, dominant_colors, style_tags, object_tags
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT $2
                """
            else:
                params = (user_id,)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata,
                        image_caption, caption_embedding, dominant_colors, style_tags, object_tags
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                """
        else:
            if force_all:
                where_clause = """WHERE status = 'active' 
                    AND image IS NOT NULL AND image != ''"""
            else:
                where_clause = """WHERE status = 'active' 
                    AND (image_caption IS NULL OR image_caption = '')
                    AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                    AND image IS NOT NULL AND image != ''"""
            if max_items is not None:
                params = (max_items,)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata,
                        image_caption, caption_embedding, dominant_colors, style_tags, object_tags
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT $1
                """
            else:
                params = ()
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata,
                        image_caption, caption_embedding, dominant_colors, style_tags, object_tags
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                """
    else:
        # 降级到 metadata 查询（向后兼容）
        if user_id:
            user_id = _normalize_user_id(user_id)
            if force_all:
                where_clause = (
                    "WHERE user_id = $1 AND status = 'active' AND image IS NOT NULL AND image != ''"
                )
            else:
                where_clause = "WHERE user_id = $1 AND status = 'active' AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '') AND image IS NOT NULL AND image != ''"
            if max_items is not None:
                params = (user_id, max_items)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT $2
                """
            else:
                params = (user_id,)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                """
        else:
            if force_all:
                where_clause = "WHERE status = 'active' AND image IS NOT NULL AND image != ''"
            else:
                where_clause = "WHERE status = 'active' AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '') AND image IS NOT NULL AND image != ''"
            if max_items is not None:
                params = (max_items,)
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT $1
                """
            else:
                params = ()
                query = f"""
                    SELECT 
                        user_id, url, title, description, image, site_name,
                        tab_id, tab_title, metadata
                    FROM {ACTIVE_TABLE}
                    {where_clause}
                    ORDER BY created_at DESC
                """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        items = [_row_to_dict(row) for row in rows]

    print(f"[BatchEnrich] Found {len(items)} items without caption")
    return items


async def update_item_caption(
    user_id: str,
    url: str,
    caption: str,
    dominant_colors: List[str],
    style_tags: List[str],
    object_tags: List[str],
    caption_embedding: Optional[List[float]] = None,
    send_websocket: bool = True,  # ✅ 新增：是否发送 WebSocket 通知
) -> bool:
    """
    更新数据库中的 Caption 和视觉属性
    ✅ 新增：更新后发送 WebSocket 通知
    """
    pool = await get_pool()
    user_id = _normalize_user_id(user_id)
    normalized_url = _normalize_url_for_storage(url)

    try:
        async with pool.acquire() as conn:
            # 检查新字段是否存在
            has_new_fields = await conn.fetchval(
                f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                      AND column_name = 'image_caption'
                );
            """
            )

            if has_new_fields:
                # 使用新字段更新
                caption_vec = to_vector_str(caption_embedding)

                await conn.execute(
                    f"""
                    UPDATE {ACTIVE_TABLE}
                    SET image_caption = $1,
                        caption_embedding = $2::vector(1024),
                        dominant_colors = $3,
                        style_tags = $4,
                        object_tags = $5,
                        updated_at = NOW()
                    WHERE user_id = $6 AND url = $7
                    """,
                    caption,
                    caption_vec,
                    dominant_colors if dominant_colors else None,
                    style_tags if style_tags else None,
                    object_tags if object_tags else None,
                    user_id,
                    normalized_url,
                )
            else:
                # 降级到 metadata
                existing_metadata = await conn.fetchval(
                    f"SELECT metadata FROM {ACTIVE_TABLE} WHERE user_id = $1 AND url = $2",
                    user_id,
                    normalized_url,
                )

                if existing_metadata:
                    if isinstance(existing_metadata, str):
                        import json

                        metadata = json.loads(existing_metadata)
                    else:
                        metadata = existing_metadata
                else:
                    metadata = {}

                metadata["caption"] = caption
                metadata["dominant_colors"] = dominant_colors
                metadata["style_tags"] = style_tags
                metadata["object_tags"] = object_tags
                metadata["caption_generated_at"] = datetime.now().isoformat()

                import json

                metadata_json = json.dumps(metadata)

                await conn.execute(
                    f"""
                    UPDATE {ACTIVE_TABLE}
                    SET metadata = $1::jsonb,
                        updated_at = NOW()
                    WHERE user_id = $2 AND url = $3
                    """,
                    metadata_json,
                    user_id,
                    normalized_url,
                )

            # ✅ 新增：发送 WebSocket 通知
            if send_websocket:
                try:
                    from app.main import broadcast_caption_updates

                    caption_item = {
                        "url": normalized_url,
                        "image_caption": caption,
                        "dominant_colors": dominant_colors or [],
                        "style_tags": style_tags or [],
                        "object_tags": object_tags or [],
                    }

                    await broadcast_caption_updates([caption_item], user_id)
                    print(f"[BatchEnrich] 📡 WebSocket notification sent for {url[:50]}...")
                except ImportError:
                    # 如果不是在 FastAPI 上下文中运行，跳过 WebSocket
                    print(f"[BatchEnrich] ⚠️ WebSocket not available (not in FastAPI context)")
                except Exception as ws_error:
                    print(f"[BatchEnrich] ⚠️ WebSocket notification failed: {ws_error}")

            return True

    except Exception as e:
        print(f"[BatchEnrich] ERROR updating caption for {url[:50]}...: {e}")
        import traceback

        traceback.print_exc()
        return False


async def process_batch(
    items: List[Dict],
    batch_size: int = 10,
    concurrent: int = 5,
    generate_caption_embedding: bool = True,
    use_kmeans_colors: bool = False,
    send_websocket: bool = True,  # ✅ 新增
) -> Dict:
    """
    批量处理 Caption 生成
    """
    stats = {
        "total": len(items),
        "success": 0,
        "failed": 0,
        "skipped": 0,
    }

    if not items:
        return stats

    client = QwenVLClient()

    for batch_start in range(0, len(items), batch_size):
        batch = items[batch_start : batch_start + batch_size]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(items) + batch_size - 1) // batch_size

        print(f"\n[BatchEnrich] Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")
        print(f"  Progress: {batch_start}/{len(items)} items")

        enriched_items = await batch_enrich_items(
            batch,
            qwen_client=client,
            use_kmeans_colors=use_kmeans_colors,
            concurrent=concurrent,
        )

        for i, (original_item, enriched_item) in enumerate(zip(batch, enriched_items)):
            item_num = batch_start + i + 1

            if not enriched_item.get("caption"):
                print(
                    f"[BatchEnrich] ⚠️  [{item_num}/{len(items)}] Skipped: No caption generated for {original_item.get('url', 'unknown')[:50]}..."
                )
                stats["skipped"] += 1
                continue

            caption_embedding = None
            if generate_caption_embedding:
                try:
                    caption_embedding = await embed_text(enriched_item.get("caption", ""))
                    if caption_embedding:
                        print(
                            f"[BatchEnrich] ✓ [{item_num}/{len(items)}] Generated caption embedding ({len(caption_embedding)} dims)"
                        )
                except Exception as e:
                    print(
                        f"[BatchEnrich] ⚠️  [{item_num}/{len(items)}] Failed to generate caption embedding: {e}"
                    )

            success = await update_item_caption(
                user_id=original_item.get("user_id", "anonymous"),
                url=original_item.get("url", ""),
                caption=enriched_item.get("caption", ""),
                dominant_colors=enriched_item.get("dominant_colors", []),
                style_tags=enriched_item.get("style_tags", []),
                object_tags=enriched_item.get("object_tags", []),
                caption_embedding=caption_embedding,
                send_websocket=send_websocket,  # ✅ 新增
            )

            if success:
                print(
                    f"[BatchEnrich] ✅ [{item_num}/{len(items)}] Updated: {original_item.get('url', 'unknown')[:50]}..."
                )
                print(f"  Caption: {enriched_item.get('caption', '')[:60]}...")
                print(f"  Colors: {enriched_item.get('dominant_colors', [])}")
                print(f"  Styles: {enriched_item.get('style_tags', [])}")
                stats["success"] += 1
            else:
                print(
                    f"[BatchEnrich] ❌ [{item_num}/{len(items)}] Failed to update: {original_item.get('url', 'unknown')[:50]}..."
                )
                stats["failed"] += 1

        if batch_start + batch_size < len(items):
            await asyncio.sleep(0.1)

    return stats


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="批量生成图片 Caption 并更新数据库（支持 WebSocket 通知）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 处理所有用户的数据（最多 100 项）
  python batch_enrich_captions.py

  # 只处理特定用户的数据
  python batch_enrich_captions.py --user-id user123

  # 不发送 WebSocket 通知（静默模式）
  python batch_enrich_captions.py --no-websocket
        """,
    )

    parser.add_argument("--user-id", type=str, default=None, help="只处理特定用户的数据")
    parser.add_argument("--batch-size", type=int, default=10, help="批量大小")
    parser.add_argument("--max-items", type=int, default=None, help="最多处理数量")
    parser.add_argument("--concurrent", type=int, default=5, help="并发数量")
    parser.add_argument("--force-all", action="store_true", help="强制重新生成所有 Caption")
    parser.add_argument("--no-caption-embedding", action="store_true", help="不生成 Caption embedding")
    parser.add_argument("--no-websocket", action="store_true", help="不发送 WebSocket 通知")  # ✅ 新增
    parser.add_argument("--skip-kmeans", action="store_true", help="跳过 K-Means 提色")

    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("❌ 错误: 未找到 DASHSCOPE_API_KEY 环境变量")
        sys.exit(1)

    print("=" * 60)
    print("批量生成 Caption 脚本（支持 WebSocket 通知）")
    print("=" * 60)
    print("配置:")
    print(f"  - 用户 ID: {args.user_id or '所有用户'}")
    print(f"  - 批量大小: {args.batch_size}")
    print(f"  - 最多处理: {args.max_items} 项")
    print(f"  - 并发数量: {args.concurrent}")
    print(f"  - 强制重刷所有 Caption: {args.force_all}")
    print(f"  - 生成 Caption Embedding: {not args.no_caption_embedding}")
    print(f"  - 发送 WebSocket 通知: {not args.no_websocket}")  # ✅ 新增
    print("=" * 60)

    try:
        print("\n[BatchEnrich] 正在从数据库获取数据...")
        items = await get_items_without_caption(
            user_id=args.user_id,
            max_items=args.max_items,
            force_all=args.force_all,
        )

        if not items:
            print("\n✅ 没有需要处理的数据")
            return

        print(f"\n[BatchEnrich] 找到 {len(items)} 项需要处理")

        start_time = time.perf_counter()

        stats = await process_batch(
            items,
            batch_size=args.batch_size,
            concurrent=args.concurrent,
            generate_caption_embedding=not args.no_caption_embedding,
            use_kmeans_colors=False,
            send_websocket=not args.no_websocket,  # ✅ 新增
        )

        end_time = time.perf_counter()
        elapsed = end_time - start_time

        print("\n" + "=" * 60)
        print("处理完成 - 统计信息")
        print("=" * 60)
        print(f"  总计: {stats['total']} 项")
        print(f"  成功: {stats['success']} 项")
        print(f"  失败: {stats['failed']} 项")
        print(f"  跳过: {stats['skipped']} 项")
        print(f"  成功率: {stats['success'] / stats['total'] * 100:.1f}%")
        print(f"  ⏱️  总耗时: {elapsed:.2f} 秒")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {str(e)}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
