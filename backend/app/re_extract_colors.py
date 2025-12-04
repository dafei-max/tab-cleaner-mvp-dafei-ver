"""
重新提取颜色脚本
使用新的 Hex 提取和主体检测功能，重新处理现有图片的颜色
"""
import asyncio
import argparse
import sys
from typing import List, Dict, Optional
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id
from search.caption import enrich_item_with_caption, extract_colors_kmeans
from search.qwen_vl_client import QwenVLClient
from search.preprocess import download_image
import base64


async def check_hex_field_exists(conn) -> bool:
    """检查 dominant_colors_hex 字段是否存在"""
    return await conn.fetchval(f"""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = '{NAMESPACE}'
              AND table_name = '{ACTIVE_TABLE_NAME}'
              AND column_name = 'dominant_colors_hex'
        );
    """)


async def add_hex_field(conn):
    """添加 dominant_colors_hex 字段"""
    try:
        # PostgreSQL 不支持 IF NOT EXISTS，需要先检查
        exists = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = '{NAMESPACE}'
                  AND table_name = '{ACTIVE_TABLE_NAME}'
                  AND column_name = 'dominant_colors_hex'
            );
        """)
        
        if not exists:
            await conn.execute(f"""
                ALTER TABLE {ACTIVE_TABLE}
                ADD COLUMN dominant_colors_hex TEXT[];
            """)
            print("[ReExtract] ✅ Added dominant_colors_hex field")
        else:
            print("[ReExtract] ✅ dominant_colors_hex field already exists")
    except Exception as e:
        print(f"[ReExtract] ❌ Failed to add field: {e}")
        raise


async def get_items_to_reprocess(
    user_id: Optional[str] = None,
    max_items: Optional[int] = None,
    force_all: bool = False,
) -> List[Dict]:
    """
    从数据库获取需要重新提取颜色的数据
    
    Args:
        user_id: 用户 ID（如果为 None，获取所有用户）
        max_items: 最多获取数量（如果为 None，获取所有）
        force_all: 是否强制重新处理所有记录
    
    Returns:
        数据项列表
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    async with pool.acquire() as conn:
        # 检查字段是否存在
        has_hex_field = await check_hex_field_exists(conn)
        if not has_hex_field:
            await add_hex_field(conn)
            has_hex_field = True  # 重新检查，确保字段已创建
        
        # 构建查询条件
        if force_all:
            where_clause = """WHERE status = 'active' 
                AND image IS NOT NULL AND image != ''"""
            params = []
        else:
            # 根据字段是否存在使用不同的查询条件
            if has_hex_field:
                where_clause = """WHERE status = 'active' 
                    AND image IS NOT NULL AND image != ''
                    AND (dominant_colors_hex IS NULL OR array_length(dominant_colors_hex, 1) IS NULL)"""
            else:
                # 如果字段不存在，处理所有记录
                where_clause = """WHERE status = 'active' 
                    AND image IS NOT NULL AND image != ''"""
            params = []
        
        if normalized_user:
            where_clause += " AND user_id = $" + str(len(params) + 1)
            params.append(normalized_user)
        
        if max_items is not None:
            where_clause += f" ORDER BY created_at DESC LIMIT ${len(params) + 1}"
            params.append(max_items)
        else:
            where_clause += " ORDER BY created_at DESC"
        
        # 根据字段是否存在选择不同的 SELECT 语句
        if has_hex_field:
            query = f"""
                SELECT 
                    user_id, url, title, description, image, site_name,
                    tab_id, tab_title, metadata,
                    image_caption, dominant_colors, dominant_colors_hex
                FROM {ACTIVE_TABLE}
                {where_clause}
            """
        else:
            query = f"""
                SELECT 
                    user_id, url, title, description, image, site_name,
                    tab_id, tab_title, metadata,
                    image_caption, dominant_colors, NULL::TEXT[] as dominant_colors_hex
                FROM {ACTIVE_TABLE}
                {where_clause}
            """
        
        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]


async def re_extract_colors_for_item(item: Dict) -> Optional[Dict]:
    """
    为单个项重新提取颜色
    
    Args:
        item: 数据项
    
    Returns:
        包含新颜色信息的字典，如果失败返回 None
    """
    image_url = item.get("image", "")
    if not image_url:
        return None
    
    try:
        # 下载图片
        if image_url.startswith("http://") or image_url.startswith("https://"):
            image_data = await download_image(image_url)
            if not image_data:
                print(f"[ReExtract] ⚠️  Failed to download image: {image_url[:50]}...")
                return None
        elif image_url.startswith("data:image"):
            # Base64 图片
            try:
                if "," in image_url:
                    base64_data = image_url.split(",", 1)[1]
                else:
                    base64_data = image_url
                image_data = base64.b64decode(base64_data)
            except Exception as e:
                print(f"[ReExtract] ⚠️  Failed to decode Base64: {e}")
                return None
        else:
            print(f"[ReExtract] ⚠️  Invalid image format: {image_url[:50]}...")
            return None
        
        # 使用新的 Hex 提取和主体检测功能
        hex_colors = extract_colors_kmeans(image_data, n_colors=3, prioritize_subject=True)
        
        if not hex_colors:
            print(f"[ReExtract] ⚠️  No colors extracted for: {item.get('url', 'unknown')[:50]}...")
            return None
        
        # 将 Hex 颜色转换为颜色名称（用于向后兼容）
        from search.caption import hex_to_rgb, rgb_to_color_name
        color_names = []
        for hex_color in hex_colors:
            try:
                rgb = hex_to_rgb(hex_color)
                color_name = rgb_to_color_name(rgb)
                if color_name not in color_names:
                    color_names.append(color_name)
            except Exception as e:
                print(f"[ReExtract] ⚠️  Failed to convert {hex_color} to color name: {e}")
        
        return {
            "dominant_colors": color_names,
            "dominant_colors_hex": hex_colors,
        }
        
    except Exception as e:
        print(f"[ReExtract] ❌ Error processing {item.get('url', 'unknown')[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return None


async def update_item_colors(
    user_id: str,
    url: str,
    dominant_colors: List[str],
    dominant_colors_hex: List[str],
) -> bool:
    """
    更新数据库中的颜色信息
    
    Args:
        user_id: 用户 ID
        url: URL
        dominant_colors: 颜色名称列表
        dominant_colors_hex: Hex 颜色代码列表
    
    Returns:
        是否成功
    """
    try:
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        
        async with pool.acquire() as conn:
            # 检查字段是否存在，如果不存在则创建
            has_hex_field = await check_hex_field_exists(conn)
            if not has_hex_field:
                await add_hex_field(conn)
                has_hex_field = True  # 重新检查，确保字段已创建
            
            # 更新颜色信息
            if has_hex_field:
                query = f"""
                    UPDATE {ACTIVE_TABLE}
                    SET 
                        dominant_colors = $1,
                        dominant_colors_hex = $2,
                        updated_at = NOW()
                    WHERE user_id = $3 AND url = $4 AND status = 'active'
                """
                await conn.execute(query, dominant_colors, dominant_colors_hex, normalized_user, url)
            else:
                # 如果没有 hex 字段，只更新颜色名称
                query = f"""
                    UPDATE {ACTIVE_TABLE}
                    SET 
                        dominant_colors = $1,
                        updated_at = NOW()
                    WHERE user_id = $2 AND url = $3 AND status = 'active'
                """
                await conn.execute(query, dominant_colors, normalized_user, url)
            
            return True
            
    except Exception as e:
        print(f"[ReExtract] ❌ Failed to update colors: {e}")
        import traceback
        traceback.print_exc()
        return False


async def process_batch(
    items: List[Dict],
    batch_size: int = 10,
    concurrent: int = 5,
) -> Dict[str, int]:
    """
    批量处理项，重新提取颜色并更新数据库
    
    Args:
        items: 数据项列表
        batch_size: 批量大小
        concurrent: 并发数量
    
    Returns:
        统计信息字典
    """
    stats = {
        "total": len(items),
        "success": 0,
        "failed": 0,
        "skipped": 0,
    }
    
    if not items:
        return stats
    
    # 使用信号量控制并发数
    semaphore = asyncio.Semaphore(concurrent)
    
    async def process_one(item: Dict, index: int) -> None:
        async with semaphore:
            item_num = index + 1
            url = item.get("url", "unknown")
            
            print(f"[ReExtract] [{item_num}/{len(items)}] Processing: {url[:60]}...")
            
            # 重新提取颜色
            color_info = await re_extract_colors_for_item(item)
            
            if not color_info:
                print(f"[ReExtract] ⚠️  [{item_num}/{len(items)}] Skipped: No colors extracted")
                stats["skipped"] += 1
                return
            
            # 更新数据库
            success = await update_item_colors(
                user_id=item.get("user_id", "anonymous"),
                url=url,
                dominant_colors=color_info["dominant_colors"],
                dominant_colors_hex=color_info["dominant_colors_hex"],
            )
            
            if success:
                print(f"[ReExtract] ✅ [{item_num}/{len(items)}] Updated colors: {color_info['dominant_colors']} / {color_info['dominant_colors_hex']}")
                stats["success"] += 1
            else:
                print(f"[ReExtract] ❌ [{item_num}/{len(items)}] Failed to update")
                stats["failed"] += 1
    
    # 分批处理
    for batch_start in range(0, len(items), batch_size):
        batch = items[batch_start:batch_start + batch_size]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(items) + batch_size - 1) // batch_size
        
        print(f"\n[ReExtract] Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")
        print(f"  Progress: {batch_start}/{len(items)} items")
        
        # 并发处理
        tasks = [
            process_one(item, batch_start + i)
            for i, item in enumerate(batch)
        ]
        await asyncio.gather(*tasks)
        
        # 短暂延迟，避免 API 限流
        if batch_start + batch_size < len(items):
            await asyncio.sleep(1)
    
    return stats


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="重新提取图片颜色（使用新的 Hex 提取和主体检测）")
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="用户 ID（默认：处理所有用户）"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="批量大小（默认：10）"
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="最多处理数量（默认：处理所有）"
    )
    parser.add_argument(
        "--concurrent",
        type=int,
        default=5,
        help="并发数量（默认：5）"
    )
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="强制重新处理所有记录（即使已有颜色数据）"
    )
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("🎨 重新提取颜色脚本")
    print("=" * 80)
    print(f"  功能: 使用新的 Hex 提取和主体检测功能重新处理图片颜色")
    print(f"  用户 ID: {args.user_id or '所有用户'}")
    print(f"  批量大小: {args.batch_size}")
    print(f"  最多处理: {args.max_items or '全部'}")
    print(f"  并发数量: {args.concurrent}")
    print(f"  强制重刷: {args.force_all}")
    print("=" * 80)
    
    try:
        # 获取需要处理的数据
        print("\n[ReExtract] 正在从数据库获取数据...")
        items = await get_items_to_reprocess(
            user_id=args.user_id,
            max_items=args.max_items,
            force_all=args.force_all,
        )
        
        if not items:
            print("\n✅ 没有需要处理的数据")
            return
        
        print(f"\n[ReExtract] 找到 {len(items)} 项需要处理")
        
        # 批量处理
        stats = await process_batch(
            items,
            batch_size=args.batch_size,
            concurrent=args.concurrent,
        )
        
        # 显示统计信息
        print("\n" + "=" * 80)
        print("处理完成 - 统计信息")
        print("=" * 80)
        print(f"  总计: {stats['total']} 项")
        print(f"  成功: {stats['success']} 项")
        print(f"  失败: {stats['failed']} 项")
        print(f"  跳过: {stats['skipped']} 项")
        if stats['total'] > 0:
            print(f"  成功率: {stats['success'] / stats['total'] * 100:.1f}%")
        print("=" * 80)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        # 关闭数据库连接池
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

