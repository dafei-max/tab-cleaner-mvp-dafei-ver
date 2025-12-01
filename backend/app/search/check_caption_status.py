"""
检查数据库中 Caption 和标签的完成状态
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE


async def check_caption_status(user_id: str = None):
    """检查数据库中 Caption 的完成状态"""
    pool = await get_pool()
    
    # 检查是否有新字段
    async with pool.acquire() as conn:
        has_new_fields = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = '{NAMESPACE}'
                  AND table_name = '{ACTIVE_TABLE_NAME}'
                  AND column_name = 'image_caption'
            );
        """)
    
    print("=" * 60)
    print("📊 Caption 和标签完成状态检查")
    print("=" * 60)
    
    async with pool.acquire() as conn:
        if has_new_fields:
            # 使用新字段查询
            if user_id:
                from vector_db import _normalize_user_id
                user_id = _normalize_user_id(user_id)
                
                # 总数
                total = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                """, user_id)
                
                # 有 caption 的
                with_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND image_caption IS NOT NULL AND image_caption != ''
                """, user_id)
                
                # 有颜色的
                with_colors = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND dominant_colors IS NOT NULL 
                      AND array_length(dominant_colors, 1) > 0
                """, user_id)
                
                # 有风格标签的
                with_styles = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND style_tags IS NOT NULL 
                      AND array_length(style_tags, 1) > 0
                """, user_id)
                
                # 有物体标签的
                with_objects = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND object_tags IS NOT NULL 
                      AND array_length(object_tags, 1) > 0
                """, user_id)
                
                # 缺少 caption 的
                missing_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND (image_caption IS NULL OR image_caption = '')
                      AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                """, user_id)
                
                print(f"\n👤 用户: {user_id}")
            else:
                # 总数
                total = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                """)
                
                # 有 caption 的
                with_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND image_caption IS NOT NULL AND image_caption != ''
                """)
                
                # 有颜色的
                with_colors = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND dominant_colors IS NOT NULL 
                      AND array_length(dominant_colors, 1) > 0
                """)
                
                # 有风格标签的
                with_styles = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND style_tags IS NOT NULL 
                      AND array_length(style_tags, 1) > 0
                """)
                
                # 有物体标签的
                with_objects = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND object_tags IS NOT NULL 
                      AND array_length(object_tags, 1) > 0
                """)
                
                # 缺少 caption 的
                missing_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND (image_caption IS NULL OR image_caption = '')
                      AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                """)
                
                print(f"\n🌍 全部用户")
        else:
            # 降级到 metadata 查询
            if user_id:
                from vector_db import _normalize_user_id
                user_id = _normalize_user_id(user_id)
                
                total = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                """, user_id)
                
                with_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND metadata ? 'caption' 
                      AND metadata->>'caption' IS NOT NULL 
                      AND metadata->>'caption' != ''
                """, user_id)
                
                missing_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                """, user_id)
                
                print(f"\n👤 用户: {user_id}")
                print(f"⚠️  注意: 数据库尚未升级到新 schema，只能检查 metadata 中的 caption")
            else:
                total = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                """)
                
                with_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND metadata ? 'caption' 
                      AND metadata->>'caption' IS NOT NULL 
                      AND metadata->>'caption' != ''
                """)
                
                missing_caption = await conn.fetchval(f"""
                    SELECT COUNT(*) 
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active' 
                      AND image IS NOT NULL AND image != ''
                      AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                """)
                
                print(f"\n🌍 全部用户")
                print(f"⚠️  注意: 数据库尚未升级到新 schema，只能检查 metadata 中的 caption")
        
        # 显示统计信息
        print(f"\n📈 统计信息:")
        print(f"  • 总图片数: {total}")
        print(f"  • 已有 Caption: {with_caption} ({with_caption/total*100:.1f}%)" if total > 0 else "  • 已有 Caption: 0")
        print(f"  • 缺少 Caption: {missing_caption} ({missing_caption/total*100:.1f}%)" if total > 0 else "  • 缺少 Caption: 0")
        
        if has_new_fields:
            print(f"  • 有颜色标签: {with_colors} ({with_colors/total*100:.1f}%)" if total > 0 else "  • 有颜色标签: 0")
            print(f"  • 有风格标签: {with_styles} ({with_styles/total*100:.1f}%)" if total > 0 else "  • 有风格标签: 0")
            print(f"  • 有物体标签: {with_objects} ({with_objects/total*100:.1f}%)" if total > 0 else "  • 有物体标签: 0")
        
        # 显示缺少 caption 的示例 URL
        if missing_caption > 0:
            print(f"\n📋 缺少 Caption 的示例 (最多显示 10 个):")
            if has_new_fields:
                if user_id:
                    sample_query = f"""
                        SELECT url, title, image_caption
                        FROM {ACTIVE_TABLE}
                        WHERE user_id = $1 AND status = 'active' 
                          AND image IS NOT NULL AND image != ''
                          AND (image_caption IS NULL OR image_caption = '')
                          AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                        ORDER BY created_at DESC
                        LIMIT 10
                    """
                    samples = await conn.fetch(sample_query, user_id)
                else:
                    sample_query = f"""
                        SELECT url, title, image_caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active' 
                          AND image IS NOT NULL AND image != ''
                          AND (image_caption IS NULL OR image_caption = '')
                          AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                        ORDER BY created_at DESC
                        LIMIT 10
                    """
                    samples = await conn.fetch(sample_query)
            else:
                if user_id:
                    sample_query = f"""
                        SELECT url, title, metadata->>'caption' as caption
                        FROM {ACTIVE_TABLE}
                        WHERE user_id = $1 AND status = 'active' 
                          AND image IS NOT NULL AND image != ''
                          AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                        ORDER BY created_at DESC
                        LIMIT 10
                    """
                    samples = await conn.fetch(sample_query, user_id)
                else:
                    sample_query = f"""
                        SELECT url, title, metadata->>'caption' as caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active' 
                          AND image IS NOT NULL AND image != ''
                          AND (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '')
                        ORDER BY created_at DESC
                        LIMIT 10
                    """
                    samples = await conn.fetch(sample_query)
            
            for idx, row in enumerate(samples, 1):
                url = row.get('url', '')[:60]
                title = row.get('title', 'N/A')[:40]
                print(f"  {idx}. {title}")
                print(f"     {url}...")
        
        print("\n" + "=" * 60)
        
        if missing_caption > 0:
            print(f"💡 提示: 运行以下命令来批量生成 Caption:")
            if user_id:
                print(f"     python search/batch_enrich_captions.py --user-id {user_id}")
            else:
                print(f"     python search/batch_enrich_captions.py")
        else:
            print("✅ 所有图片都已生成 Caption！")


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="检查数据库中 Caption 的完成状态")
    parser.add_argument("--user-id", type=str, help="只检查特定用户的数据")
    args = parser.parse_args()
    
    try:
        await check_caption_status(user_id=args.user_id)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

