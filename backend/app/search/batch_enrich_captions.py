"""
批量生成 Caption 脚本
从数据库获取没有 Caption 的数据，批量生成并更新
"""
import asyncio
import argparse
import sys
from typing import List, Dict, Optional
from datetime import datetime
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 导入数据库和搜索模块
import sys
from pathlib import Path

# 添加父目录到路径，以便导入 vector_db
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id, _row_to_dict
from search.caption import enrich_item_with_caption, batch_enrich_items
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
    
    检查条件：
    - image_caption IS NULL OR image_caption = ''（新字段）
    - metadata->>'caption' IS NULL OR metadata->>'caption' = ''（旧字段，向后兼容）
    - image IS NOT NULL AND image != ''（必须有图片）
    
    Args:
        user_id: 用户 ID（如果为 None，获取所有用户）
        max_items: 最多获取数量（如果为 None，获取所有）
    
    Returns:
        数据项列表
    """
    pool = await get_pool()
    
    # 检查新字段是否存在
    async with pool.acquire() as conn:
        has_new_fields = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = '{NAMESPACE}'
                  AND table_name = '{ACTIVE_TABLE_NAME}'
                  AND column_name = 'image_caption'
            );
        """)
    
    # 构建查询条件（同时检查新字段和 metadata）
    # force_all=True 时，忽略是否已有 caption，强制重新生成
    if has_new_fields:
        # 使用新字段查询
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
                where_clause = "WHERE user_id = $1 AND status = 'active' AND image IS NOT NULL AND image != ''"
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
) -> bool:
    """
    更新数据库中的 Caption 和视觉属性
    
    Args:
        user_id: 用户 ID
        url: 项 URL
        caption: 图片描述
        dominant_colors: 主要颜色列表
        style_tags: 风格标签列表
        object_tags: 物体标签列表
        caption_embedding: Caption 的 embedding（可选）
    
    Returns:
        是否更新成功
    """
    pool = await get_pool()
    user_id = _normalize_user_id(user_id)
    
    try:
        async with pool.acquire() as conn:
            # 检查新字段是否存在（如果不存在，降级到 metadata）
            has_new_fields = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                      AND column_name = 'image_caption'
                );
            """)
            
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
                    url
                )
            else:
                # 降级到 metadata（向后兼容）
                existing_metadata = await conn.fetchval(
                    f"SELECT metadata FROM {ACTIVE_TABLE} WHERE user_id = $1 AND url = $2",
                    user_id, url
                )
                
                if existing_metadata:
                    if isinstance(existing_metadata, str):
                        import json
                        metadata = json.loads(existing_metadata)
                    else:
                        metadata = existing_metadata
                else:
                    metadata = {}
                
                # 更新 metadata 中的 caption 相关字段
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
                    metadata_json, user_id, url
                )
            
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
) -> Dict[str, int]:
    """
    批量处理项，生成 Caption 并更新数据库
    
    Args:
        items: 数据项列表
        batch_size: 批量大小（每次处理的项数）
        concurrent: 并发数量
        generate_caption_embedding: 是否生成 Caption embedding
    
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
    
    # 创建 Qwen-VL 客户端
    client = QwenVLClient()
    
    # 分批处理
    for batch_start in range(0, len(items), batch_size):
        batch = items[batch_start:batch_start + batch_size]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(items) + batch_size - 1) // batch_size
        
        print(f"\n[BatchEnrich] Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")
        print(f"  Progress: {batch_start}/{len(items)} items")
        
        # 批量生成 Caption（并发处理）
        enriched_items = await batch_enrich_items(
            batch,
            qwen_client=client,
            use_kmeans_colors=True,
            concurrent=concurrent,
        )
        
        # 更新数据库
        for i, (original_item, enriched_item) in enumerate(zip(batch, enriched_items)):
            item_num = batch_start + i + 1
            
            # 检查是否成功生成 Caption
            if not enriched_item.get("caption"):
                print(f"[BatchEnrich] ⚠️  [{item_num}/{len(items)}] Skipped: No caption generated for {original_item.get('url', 'unknown')[:50]}...")
                stats["skipped"] += 1
                continue
            
            # 生成 Caption embedding（可选）
            caption_embedding = None
            if generate_caption_embedding:
                try:
                    caption_embedding = await embed_text(enriched_item.get("caption", ""))
                    if caption_embedding:
                        print(f"[BatchEnrich] ✓ [{item_num}/{len(items)}] Generated caption embedding ({len(caption_embedding)} dims)")
                except Exception as e:
                    print(f"[BatchEnrich] ⚠️  [{item_num}/{len(items)}] Failed to generate caption embedding: {e}")
            
            # 更新数据库
            success = await update_item_caption(
                user_id=original_item.get("user_id", "anonymous"),
                url=original_item.get("url", ""),
                caption=enriched_item.get("caption", ""),
                dominant_colors=enriched_item.get("dominant_colors", []),
                style_tags=enriched_item.get("style_tags", []),
                object_tags=enriched_item.get("object_tags", []),
                caption_embedding=caption_embedding,
            )
            
            if success:
                print(f"[BatchEnrich] ✅ [{item_num}/{len(items)}] Updated: {original_item.get('url', 'unknown')[:50]}...")
                print(f"  Caption: {enriched_item.get('caption', '')[:60]}...")
                print(f"  Colors: {enriched_item.get('dominant_colors', [])}")
                print(f"  Styles: {enriched_item.get('style_tags', [])}")
                stats["success"] += 1
            else:
                print(f"[BatchEnrich] ❌ [{item_num}/{len(items)}] Failed to update: {original_item.get('url', 'unknown')[:50]}...")
                stats["failed"] += 1
        
        # 批次间延迟（避免 API 限流）
        if batch_start + batch_size < len(items):
            await asyncio.sleep(1.0)
    
    return stats


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="批量生成图片 Caption 并更新数据库",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 处理所有用户的数据（最多 100 项）
  python batch_enrich_captions.py

  # 只处理特定用户的数据
  python batch_enrich_captions.py --user-id user123

  # 自定义批量大小和并发数
  python batch_enrich_captions.py --batch-size 20 --concurrent 10 --max-items 200
        """
    )
    
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="只处理特定用户的数据（默认：处理所有用户）"
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="批量大小（每次处理的项数，默认：10）"
    )
    
    parser.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="最多处理数量（默认：None，处理所有）"
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
        help="忽略已有 Caption，强制为所有有图片的项重新生成 Caption（默认：只补缺失的）"
    )
    
    parser.add_argument(
        "--no-caption-embedding",
        action="store_true",
        help="不生成 Caption embedding（默认：生成）"
    )
    
    args = parser.parse_args()
    
    # 检查 API Key
    api_key = get_api_key()
    if not api_key:
        print("❌ 错误: 未找到 DASHSCOPE_API_KEY 环境变量")
        print("请在 .env 文件中设置 DASHSCOPE_API_KEY")
        sys.exit(1)
    
    print("=" * 60)
    print("批量生成 Caption 脚本")
    print("=" * 60)
    print(f"配置:")
    print(f"  - 用户 ID: {args.user_id or '所有用户'}")
    print(f"  - 批量大小: {args.batch_size}")
    print(f"  - 最多处理: {args.max_items} 项")
    print(f"  - 并发数量: {args.concurrent}")
    print(f"  - 强制重刷所有 Caption: {args.force_all}")
    print(f"  - 生成 Caption Embedding: {not args.no_caption_embedding}")
    print("=" * 60)
    
    try:
        # 获取需要处理的数据
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
        
        # 批量处理
        stats = await process_batch(
            items,
            batch_size=args.batch_size,
            concurrent=args.concurrent,
            generate_caption_embedding=not args.no_caption_embedding,
        )
        
        # 显示统计信息
        print("\n" + "=" * 60)
        print("处理完成 - 统计信息")
        print("=" * 60)
        print(f"  总计: {stats['total']} 项")
        print(f"  成功: {stats['success']} 项")
        print(f"  失败: {stats['failed']} 项")
        print(f"  跳过: {stats['skipped']} 项")
        print(f"  成功率: {stats['success'] / stats['total'] * 100:.1f}%")
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
        # 关闭数据库连接池
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

