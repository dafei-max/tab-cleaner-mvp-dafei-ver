"""
诊断用户搜索问题
检查指定用户ID的数据情况
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id


async def diagnose_user_search(user_id: str):
    """诊断用户搜索问题"""
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id)
    
    print("\n" + "=" * 80)
    print(f"🔍 诊断用户搜索问题")
    print("=" * 80)
    print(f"原始用户ID: {user_id}")
    print(f"标准化后: {normalized_user}")
    print("=" * 80 + "\n")
    
    async with pool.acquire() as conn:
        # 1. 检查该用户的总记录数
        total_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1;
        """, normalized_user)
        
        print(f"📊 数据统计")
        print(f"  总记录数（active）: {total_count}")
        
        # 2. 检查有embedding的记录数
        text_embedding_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND text_embedding IS NOT NULL;
        """, normalized_user)
        
        image_embedding_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND image_embedding IS NOT NULL;
        """, normalized_user)
        
        caption_embedding_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND caption_embedding IS NOT NULL;
        """, normalized_user)
        
        print(f"  有 text_embedding: {text_embedding_count}")
        print(f"  有 image_embedding: {image_embedding_count}")
        print(f"  有 caption_embedding: {caption_embedding_count}")
        
        # 3. 检查是否有Caption
        caption_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND image_caption IS NOT NULL
              AND image_caption != '';
        """, normalized_user)
        
        print(f"  有 image_caption: {caption_count}")
        
        # 4. 检查所有用户ID（看看是否有数据在anonymous下）
        all_user_ids = await conn.fetch(f"""
            SELECT user_id, COUNT(*) as count
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
            GROUP BY user_id
            ORDER BY count DESC
            LIMIT 10;
        """)
        
        print(f"\n📋 所有用户ID的数据分布（前10个）:")
        for row in all_user_ids:
            marker = " 👈 当前用户" if row['user_id'] == normalized_user else ""
            print(f"  {row['user_id']}: {row['count']} 条记录{marker}")
        
        # 5. 检查是否有"梯子"相关的内容（在所有用户中）
        ladder_keyword_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND (
                  title ILIKE '%梯子%'
                  OR description ILIKE '%梯子%'
                  OR image_caption ILIKE '%梯子%'
              );
        """)
        
        print(f"\n🔎 关键词搜索测试")
        print(f"  包含'梯子'的记录（所有用户）: {ladder_keyword_count}")
        
        # 6. 检查该用户是否有任何数据
        if total_count == 0:
            print(f"\n⚠️  问题诊断:")
            print(f"  该用户ID下没有任何数据！")
            print(f"\n💡 解决方案:")
            print(f"  1. 检查前端是否正确发送了数据到 /api/v1/search/embedding")
            print(f"  2. 检查数据存储时使用的用户ID是否匹配")
            print(f"  3. 如果数据在 'anonymous' 下，可以:")
            print(f"     - 使用 'anonymous' 作为用户ID搜索")
            print(f"     - 或者运行数据迁移脚本将 anonymous 数据迁移到该用户ID")
        else:
            print(f"\n✅ 该用户有数据，但搜索'梯子'没有结果")
            print(f"  可能原因:")
            print(f"  1. 数据库中确实没有'梯子'相关内容")
            print(f"  2. Embedding相似度太低，被阈值过滤掉了")
            print(f"  3. Caption中没有'梯子'关键词")
        
        # 7. 显示一些示例数据
        if total_count > 0:
            print(f"\n📝 示例数据（前5条）:")
            samples = await conn.fetch(f"""
                SELECT url, title, 
                       CASE WHEN text_embedding IS NOT NULL THEN '✓' ELSE '✗' END as has_text_emb,
                       CASE WHEN image_embedding IS NOT NULL THEN '✓' ELSE '✗' END as has_image_emb,
                       CASE WHEN caption_embedding IS NOT NULL THEN '✓' ELSE '✗' END as has_caption_emb,
                       CASE WHEN image_caption IS NOT NULL AND image_caption != '' THEN '✓' ELSE '✗' END as has_caption
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                ORDER BY updated_at DESC
                LIMIT 5;
            """, normalized_user)
            
            for i, row in enumerate(samples, 1):
                print(f"  {i}. {row['title'][:50] if row['title'] else 'N/A'}...")
                print(f"     URL: {row['url'][:60]}...")
                print(f"     Embeddings: text={row['has_text_emb']}, image={row['has_image_emb']}, caption={row['has_caption_emb']}")
                print(f"     Caption: {row['has_caption']}")
        
        print("\n" + "=" * 80 + "\n")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="诊断用户搜索问题")
    parser.add_argument(
        "--user-id",
        type=str,
        default="device_1764658383255_28u4om0xg",
        help="用户ID（默认: device_1764658383255_28u4om0xg）"
    )
    
    args = parser.parse_args()
    
    await diagnose_user_search(args.user_id)
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

