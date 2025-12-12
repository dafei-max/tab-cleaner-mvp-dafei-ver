"""
诊断搜索问题脚本
检查为什么搜索返回0个结果
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, NAMESPACE, _normalize_user_id


async def diagnose_search(user_id: str = None):
    """
    诊断搜索问题
    
    Args:
        user_id: 用户 ID（如果为 None，检查所有用户）
    """
    print("=" * 60)
    print("🔍 诊断搜索问题")
    print("=" * 60)
    
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    try:
        async with pool.acquire() as conn:
            # 1. 检查数据库连接
            print("\n1. 检查数据库连接...")
            test_query = await conn.fetchval("SELECT 1")
            if test_query == 1:
                print("   ✅ 数据库连接正常")
            else:
                print("   ❌ 数据库连接异常")
                return
            
            # 2. 检查表是否存在
            print("\n2. 检查表是否存在...")
            table_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = 'opengraph_items_v2'
                );
            """)
            if table_exists:
                print("   ✅ 表 opengraph_items_v2 存在")
            else:
                print("   ❌ 表 opengraph_items_v2 不存在")
                return
            
            # 3. 检查数据总数
            print("\n3. 检查数据总数...")
            if normalized_user:
                total_count = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active';
                """, normalized_user)
                print(f"   👤 用户 '{normalized_user}' 的数据总数: {total_count}")
            else:
                total_count = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active';
                """)
                print(f"   🌍 所有用户的数据总数: {total_count}")
            
            if total_count == 0:
                print("   ⚠️  数据库中没有数据！")
                print("   💡 提示: 需要先通过 /api/v1/search/embedding 接口存储数据")
                return
            
            # 4. 检查有 embedding 的数据
            print("\n4. 检查有 embedding 的数据...")
            if normalized_user:
                with_text_emb = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 
                      AND status = 'active'
                      AND text_embedding IS NOT NULL;
                """, normalized_user)
                with_image_emb = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 
                      AND status = 'active'
                      AND image_embedding IS NOT NULL;
                """, normalized_user)
            else:
                with_text_emb = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND text_embedding IS NOT NULL;
                """)
                with_image_emb = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND image_embedding IS NOT NULL;
                """)
            
            print(f"   📊 有 text_embedding 的数据: {with_text_emb}")
            print(f"   📊 有 image_embedding 的数据: {with_image_emb}")
            
            if with_text_emb == 0 and with_image_emb == 0:
                print("   ⚠️  没有 embedding 数据！")
                print("   💡 提示: 需要先通过 /api/v1/search/embedding 接口生成 embedding")
                return
            
            # 5. 检查有图片的数据
            print("\n5. 检查有图片的数据...")
            if normalized_user:
                with_image = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 
                      AND status = 'active'
                      AND image IS NOT NULL 
                      AND image != '';
                """, normalized_user)
            else:
                with_image = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND image IS NOT NULL 
                      AND image != '';
                """)
            
            print(f"   🖼️  有图片的数据: {with_image}")
            
            # 6. 检查 Caption 数据
            print("\n6. 检查 Caption 数据...")
            has_caption_field = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = 'opengraph_items_v2'
                      AND column_name = 'image_caption'
                );
            """)
            
            if has_caption_field:
                if normalized_user:
                    with_caption = await conn.fetchval(f"""
                        SELECT COUNT(*) 
                        FROM {ACTIVE_TABLE}
                        WHERE user_id = $1 
                          AND status = 'active'
                          AND image_caption IS NOT NULL 
                          AND image_caption != '';
                    """, normalized_user)
                else:
                    with_caption = await conn.fetchval(f"""
                        SELECT COUNT(*) 
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND image_caption IS NOT NULL 
                          AND image_caption != '';
                    """)
                print(f"   📝 有 Caption 的数据: {with_caption}")
            else:
                print("   ⚠️  Caption 字段不存在（数据库未升级）")
            
            # 7. 显示示例数据
            print("\n7. 示例数据（前 3 条）...")
            if normalized_user:
                samples = await conn.fetch(f"""
                    SELECT url, title, 
                           CASE WHEN text_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_text_emb,
                           CASE WHEN image_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image_emb,
                           CASE WHEN image IS NOT NULL AND image != '' THEN 'Yes' ELSE 'No' END as has_image
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 3;
                """, normalized_user)
            else:
                samples = await conn.fetch(f"""
                    SELECT user_id, url, title,
                           CASE WHEN text_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_text_emb,
                           CASE WHEN image_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image_emb,
                           CASE WHEN image IS NOT NULL AND image != '' THEN 'Yes' ELSE 'No' END as has_image
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 3;
                """)
            
            for i, row in enumerate(samples, 1):
                print(f"   {i}. {row.get('title', 'N/A')[:40]}")
                print(f"      URL: {row.get('url', 'N/A')[:50]}...")
                if normalized_user:
                    print(f"      Text Embedding: {row.get('has_text_emb')}")
                    print(f"      Image Embedding: {row.get('has_image_emb')}")
                    print(f"      Image: {row.get('has_image')}")
                else:
                    print(f"      User: {row.get('user_id')}")
                    print(f"      Text Embedding: {row.get('has_text_emb')}")
                    print(f"      Image Embedding: {row.get('has_image_emb')}")
                    print(f"      Image: {row.get('has_image')}")
            
            print("\n" + "=" * 60)
            print("诊断完成")
            print("=" * 60)
            
    except Exception as e:
        print(f"\n❌ 诊断失败: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="诊断搜索问题")
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="用户 ID（如果为 None，检查所有用户）"
    )
    
    args = parser.parse_args()
    
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    await diagnose_search(args.user_id)
    
    # 关闭数据库连接池
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())






