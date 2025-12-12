"""
诊断搜索返回0结果的问题
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id


async def diagnose_search_issue(user_id: str, query: str = "椅子"):
    """
    诊断搜索问题
    """
    normalized_user_id = _normalize_user_id(user_id)
    
    print(f"🔍 诊断搜索问题")
    print(f"原始用户ID: {user_id}")
    print(f"规范化用户ID: {normalized_user_id}")
    print(f"查询: {query}")
    print()
    
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            # 1. 检查该用户是否有任何数据
            total_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active';
            """, normalized_user_id)
            
            print(f"📊 数据统计:")
            print(f"  用户 '{normalized_user_id}' 的总记录数: {total_count}")
            
            # 2. 检查是否有 embedding
            with_embeddings = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 
                  AND status = 'active'
                  AND (text_embedding IS NOT NULL OR image_embedding IS NOT NULL);
            """, normalized_user_id)
            
            print(f"  有 embedding 的记录数: {with_embeddings}")
            
            # 3. 检查是否有 caption
            with_caption = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 
                  AND status = 'active'
                  AND image_caption IS NOT NULL
                  AND image_caption != '';
            """, normalized_user_id)
            
            print(f"  有 caption 的记录数: {with_caption}")
            
            # 4. 检查是否有 caption_embedding
            with_caption_emb = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 
                  AND status = 'active'
                  AND caption_embedding IS NOT NULL;
            """, normalized_user_id)
            
            print(f"  有 caption_embedding 的记录数: {with_caption_emb}")
            
            # 5. 检查所有用户的数据分布
            all_users = await conn.fetch(f"""
                SELECT user_id, COUNT(*) as count
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                GROUP BY user_id
                ORDER BY count DESC
                LIMIT 10;
            """)
            
            print(f"\n📋 所有用户的数据分布（前10个）:")
            for row in all_users:
                print(f"  {row['user_id']}: {row['count']} 条记录")
            
            # 6. 检查是否有包含查询关键词的 caption
            if with_caption > 0:
                keyword_count = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 
                      AND status = 'active'
                      AND image_caption IS NOT NULL
                      AND image_caption ILIKE $2;
                """, normalized_user_id, f'%{query}%')
                
                print(f"\n🔎 包含 '{query}' 的 caption 数量: {keyword_count}")
            
            # 7. 显示一些示例数据
            if total_count > 0:
                samples = await conn.fetch(f"""
                    SELECT url, title, 
                           CASE WHEN text_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_text_emb,
                           CASE WHEN image_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image_emb,
                           CASE WHEN image_caption IS NOT NULL AND image_caption != '' THEN 'Yes' ELSE 'No' END as has_caption,
                           CASE WHEN caption_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_caption_emb
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active'
                    LIMIT 5;
                """, normalized_user_id)
                
                print(f"\n📝 示例数据（前5条）:")
                for i, row in enumerate(samples, 1):
                    print(f"  {i}. {row['url'][:60]}...")
                    print(f"     Title: {row['title'][:50] if row['title'] else 'N/A'}...")
                    print(f"     Text Emb: {row['has_text_emb']}, Image Emb: {row['has_image_emb']}, Caption: {row['has_caption']}, Caption Emb: {row['has_caption_emb']}")
            
            # 8. 诊断建议
            print(f"\n💡 诊断建议:")
            if total_count == 0:
                print(f"  ⚠️  该用户ID下没有任何数据！")
                print(f"  可能原因:")
                print(f"    1. 数据存储时使用的用户ID不匹配")
                print(f"    2. 数据还没有被存储")
                print(f"  解决方案:")
                print(f"    1. 检查前端是否正确发送了用户ID")
                print(f"    2. 检查 /api/v1/search/embedding 是否成功存储了数据")
                print(f"    3. 如果数据在其他用户ID下（如 'anonymous'），可以:")
                print(f"       - 使用正确的用户ID搜索")
                print(f"       - 或者运行数据迁移脚本")
            elif with_embeddings == 0:
                print(f"  ⚠️  该用户有数据但没有 embedding！")
                print(f"  解决方案:")
                print(f"    1. 检查 /api/v1/search/embedding 是否成功生成了 embedding")
                print(f"    2. 重新调用 /api/v1/search/embedding 生成 embedding")
            elif with_caption == 0:
                print(f"  ⚠️  该用户有数据但没有 caption！")
                print(f"  解决方案:")
                print(f"    1. 等待自动 caption 生成完成")
                print(f"    2. 或者手动运行批量 caption 生成脚本")
            else:
                print(f"  ✅ 数据看起来正常，但搜索返回0结果")
                print(f"  可能原因:")
                print(f"    1. 搜索阈值太高，所有结果都被过滤掉了")
                print(f"    2. 查询 embedding 生成失败")
                print(f"    3. 相似度计算有问题")
                
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="诊断搜索问题")
    parser.add_argument("--user-id", type=str, required=True, help="用户ID")
    parser.add_argument("--query", type=str, default="椅子", help="查询文本")
    args = parser.parse_args()
    
    await diagnose_search_issue(args.user_id, args.query)


if __name__ == "__main__":
    asyncio.run(main())






