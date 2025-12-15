"""
批量生成 Caption Embedding
将所有有 image_caption 但缺少 caption_embedding 的记录补充 embedding
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Dict, Optional

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id, _normalize_url_for_storage
from search.embed import embed_text
from search.config import EMBED_SLEEP_S


async def batch_generate_caption_embeddings(
    user_id: str = "anonymous",
    batch_size: int = 50,
    max_items: Optional[int] = None,
    dry_run: bool = False,
) -> Dict[str, int]:
    """
    批量生成 Caption Embedding
    
    Args:
        user_id: 用户ID
        batch_size: 每批处理数量
        max_items: 最大处理数量（None表示处理所有）
        dry_run: 是否只是预览（不实际更新）
    
    Returns:
        统计信息字典
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id)
    
    stats = {
        "total_with_caption": 0,
        "missing_embedding": 0,
        "processed": 0,
        "success": 0,
        "failed": 0,
    }
    
    try:
        async with pool.acquire() as conn:
            # 检查字段是否存在
            has_caption_field = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                      AND column_name = 'image_caption'
                );
            """)
            
            has_caption_embedding_field = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                      AND column_name = 'caption_embedding'
                );
            """)
            
            if not has_caption_field:
                print("❌ image_caption 字段不存在，请先运行升级脚本：python upgrade_schema_caption.py")
                return stats
            
            if not has_caption_embedding_field:
                print("❌ caption_embedding 字段不存在，请先运行升级脚本：python upgrade_schema_caption.py")
                return stats
            
            # 统计需要处理的记录
            count_result = await conn.fetchrow(f"""
                SELECT 
                    COUNT(*) as total_with_caption,
                    COUNT(CASE WHEN caption_embedding IS NULL THEN 1 END) as missing_embedding
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND image_caption IS NOT NULL
                  AND image_caption != '';
            """, normalized_user)
            
            stats["total_with_caption"] = count_result["total_with_caption"] or 0
            stats["missing_embedding"] = count_result["missing_embedding"] or 0
            
            print("\n" + "=" * 80)
            print("📊 Caption Embedding 生成统计")
            print("=" * 80)
            print(f"总记录数（有 Caption）: {stats['total_with_caption']}")
            print(f"缺少 Embedding: {stats['missing_embedding']}")
            print(f"模式: {'预览模式（dry-run）' if dry_run else '实际更新'}")
            print("=" * 80 + "\n")
            
            if stats["missing_embedding"] == 0:
                print("✅ 所有记录都有 caption_embedding，无需处理")
                return stats
            
            # 分批处理
            offset = 0
            limit = max_items if max_items else stats["missing_embedding"]
            
            while offset < limit:
                # 获取一批需要处理的记录
                rows = await conn.fetch(f"""
                    SELECT url, image_caption
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1
                      AND image_caption IS NOT NULL
                      AND image_caption != ''
                      AND caption_embedding IS NULL
                    ORDER BY updated_at DESC
                    LIMIT $2 OFFSET $3;
                """, normalized_user, batch_size, offset)
                
                if not rows:
                    break
                
                print(f"\n处理批次: {offset + 1}-{offset + len(rows)} / {limit}")
                
                # 并发生成 embedding
                tasks = []
                for row in rows:
                    tasks.append(_generate_and_update_embedding(
                        conn, normalized_user, row["url"], row["image_caption"], dry_run
                    ))
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # 统计结果
                for result in results:
                    stats["processed"] += 1
                    if isinstance(result, Exception):
                        stats["failed"] += 1
                        print(f"  ❌ 错误: {result}")
                    elif result:
                        stats["success"] += 1
                    else:
                        stats["failed"] += 1
                
                offset += len(rows)
                
                # 显示进度
                if stats["processed"] % 10 == 0:
                    print(f"  进度: {stats['processed']}/{limit}, 成功: {stats['success']}, 失败: {stats['failed']}")
                
                # 避免API限流
                await asyncio.sleep(EMBED_SLEEP_S * 2)
            
            print("\n" + "=" * 80)
            print("✅ 处理完成")
            print("=" * 80)
            print(f"总处理: {stats['processed']}")
            print(f"成功: {stats['success']}")
            print(f"失败: {stats['failed']}")
            print("=" * 80 + "\n")
            
            return stats
            
    except Exception as e:
        print(f"\n❌ 批量处理失败: {e}")
        import traceback
        traceback.print_exc()
        return stats


async def _generate_and_update_embedding(
    conn,
    user_id: str,
    url: str,
    caption: str,
    dry_run: bool = False,
) -> bool:
    """
    生成单个 Caption 的 Embedding 并更新数据库
    
    Args:
        conn: 数据库连接
        user_id: 用户ID
        url: 记录URL
        caption: Caption文本
        dry_run: 是否只是预览
    
    Returns:
        成功返回 True，失败返回 False
    """
    try:
        # 生成 embedding
        caption_vec = await embed_text(caption)
        
        if not caption_vec:
            print(f"  ⚠️  生成失败: {url[:50]}...")
            return False
        
        if dry_run:
            print(f"  ✅ [预览] {url[:50]}... (embedding维度: {len(caption_vec)})")
            return True
        
        # 更新数据库
        from vector_db import to_vector_str
        caption_vec_str = to_vector_str(caption_vec)
        
        # ✅ 规范化 URL（与存储时保持一致）
        normalized_url = _normalize_url_for_storage(url)
        
        await conn.execute(f"""
            UPDATE {ACTIVE_TABLE}
            SET caption_embedding = $1::vector(1024),
                updated_at = NOW()
            WHERE user_id = $2 AND url = $3;
        """, caption_vec_str, user_id, normalized_url)  # ✅ 使用规范化后的 URL
        
        print(f"  ✅ 已更新: {url[:50]}...")
        return True
        
    except Exception as e:
        print(f"  ❌ 错误 {url[:50]}...: {e}")
        return False


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="批量生成 Caption Embedding")
    parser.add_argument(
        "--user-id",
        type=str,
        default="anonymous",
        help="用户 ID（默认: anonymous）"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="每批处理数量（默认: 50）"
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="最大处理数量（默认: 处理所有）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="预览模式（不实际更新数据库）"
    )
    
    args = parser.parse_args()
    
    # 检查数据库配置
    import os
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    print("数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - User ID: {args.user_id}")
    print()
    
    await batch_generate_caption_embeddings(
        user_id=args.user_id,
        batch_size=args.batch_size,
        max_items=args.max_items,
        dry_run=args.dry_run,
    )
    
    # 关闭数据库连接池
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())








