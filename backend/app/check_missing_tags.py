"""
检查数据库中缺少 Caption 和标签的记录
"""
import asyncio
from dotenv import load_dotenv
load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, _normalize_user_id

async def check_missing_tags(user_id: str = "anonymous"):
    """检查缺少标签的记录"""
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id)
    
    async with pool.acquire() as conn:
        # 检查字段是否存在
        has_caption_field = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'image_caption'
            );
        """)
        
        has_colors_field = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'dominant_colors'
            );
        """)
        
        has_objects_field = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'object_tags'
            );
        """)
        
        print("\n" + "="*80)
        print("📊 数据库标签字段检查")
        print("="*80)
        print(f"image_caption 字段存在: {has_caption_field}")
        print(f"dominant_colors 字段存在: {has_colors_field}")
        print(f"object_tags 字段存在: {has_objects_field}")
        
        if not (has_caption_field and has_colors_field and has_objects_field):
            print("\n⚠️  部分标签字段不存在，请先运行升级脚本：")
            print("   python upgrade_schema_caption.py")
            return
        
        # 统计缺少标签的记录
        if has_caption_field:
            # 使用新字段查询
            stats = await conn.fetchrow(f"""
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN image_caption IS NULL OR image_caption = '' THEN 1 END) as missing_caption,
                    COUNT(CASE WHEN dominant_colors IS NULL OR array_length(dominant_colors, 1) IS NULL OR array_length(dominant_colors, 1) = 0 THEN 1 END) as missing_colors,
                    COUNT(CASE WHEN object_tags IS NULL OR array_length(object_tags, 1) IS NULL OR array_length(object_tags, 1) = 0 THEN 1 END) as missing_objects,
                    COUNT(CASE WHEN style_tags IS NULL OR array_length(style_tags, 1) IS NULL OR array_length(style_tags, 1) = 0 THEN 1 END) as missing_styles,
                    COUNT(CASE WHEN 
                        (image_caption IS NULL OR image_caption = '') OR
                        (dominant_colors IS NULL OR array_length(dominant_colors, 1) IS NULL OR array_length(dominant_colors, 1) = 0) OR
                        (object_tags IS NULL OR array_length(object_tags, 1) IS NULL OR array_length(object_tags, 1) = 0)
                    THEN 1 END) as missing_any_tag
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND image IS NOT NULL
                  AND image != '';
            """, normalized_user)
        else:
            # 降级到 metadata 查询
            stats = await conn.fetchrow(f"""
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '' THEN 1 END) as missing_caption,
                    COUNT(CASE WHEN NOT (metadata ? 'dominant_colors') OR (metadata->>'dominant_colors')::jsonb = '[]'::jsonb THEN 1 END) as missing_colors,
                    COUNT(CASE WHEN NOT (metadata ? 'object_tags') OR (metadata->>'object_tags')::jsonb = '[]'::jsonb THEN 1 END) as missing_objects,
                    COUNT(CASE WHEN NOT (metadata ? 'style_tags') OR (metadata->>'style_tags')::jsonb = '[]'::jsonb THEN 1 END) as missing_styles,
                    COUNT(CASE WHEN 
                        (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '') OR
                        (NOT (metadata ? 'dominant_colors') OR (metadata->>'dominant_colors')::jsonb = '[]'::jsonb) OR
                        (NOT (metadata ? 'object_tags') OR (metadata->>'object_tags')::jsonb = '[]'::jsonb)
                    THEN 1 END) as missing_any_tag
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND image IS NOT NULL
                  AND image != '';
            """, normalized_user)
        
        total = stats['total']
        missing_caption = stats['missing_caption']
        missing_colors = stats['missing_colors']
        missing_objects = stats['missing_objects']
        missing_styles = stats['missing_styles']
        missing_any_tag = stats['missing_any_tag']
        
        print("\n" + "="*80)
        print("📈 标签缺失统计")
        print("="*80)
        print(f"总记录数（有图片）: {total}")
        print(f"\n缺少 Caption: {missing_caption} ({missing_caption/total*100:.1f}%)" if total > 0 else "缺少 Caption: 0")
        print(f"缺少颜色标签: {missing_colors} ({missing_colors/total*100:.1f}%)" if total > 0 else "缺少颜色标签: 0")
        print(f"缺少物体标签: {missing_objects} ({missing_objects/total*100:.1f}%)" if total > 0 else "缺少物体标签: 0")
        print(f"缺少风格标签: {missing_styles} ({missing_styles/total*100:.1f}%)" if total > 0 else "缺少风格标签: 0")
        print(f"缺少任意标签: {missing_any_tag} ({missing_any_tag/total*100:.1f}%)" if total > 0 else "缺少任意标签: 0")
        print(f"完整标签记录: {total - missing_any_tag} ({(total - missing_any_tag)/total*100:.1f}%)" if total > 0 else "完整标签记录: 0")
        
        # 显示一些缺少标签的示例
        if missing_any_tag > 0:
            print("\n" + "="*80)
            print("📝 缺少标签的示例（前10条）")
            print("="*80)
            if has_caption_field:
                examples = await conn.fetch(f"""
                    SELECT url, title, image_caption, dominant_colors, object_tags, style_tags
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1
                      AND image IS NOT NULL
                      AND image != ''
                      AND (
                          (image_caption IS NULL OR image_caption = '') OR
                          (dominant_colors IS NULL OR array_length(dominant_colors, 1) IS NULL OR array_length(dominant_colors, 1) = 0) OR
                          (object_tags IS NULL OR array_length(object_tags, 1) IS NULL OR array_length(object_tags, 1) = 0)
                      )
                    LIMIT 10;
                """, normalized_user)
            else:
                examples = await conn.fetch(f"""
                    SELECT url, title, metadata
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1
                      AND image IS NOT NULL
                      AND image != ''
                      AND (
                          (NOT (metadata ? 'caption') OR COALESCE(metadata->>'caption', '') = '') OR
                          (NOT (metadata ? 'dominant_colors') OR (metadata->>'dominant_colors')::jsonb = '[]'::jsonb) OR
                          (NOT (metadata ? 'object_tags') OR (metadata->>'object_tags')::jsonb = '[]'::jsonb)
                      )
                    LIMIT 10;
                """, normalized_user)
            
            for i, row in enumerate(examples, 1):
                print(f"\n{i}. {row['title'][:50] if row['title'] else 'N/A'}...")
                print(f"   URL: {row['url'][:60]}...")
                if has_caption_field:
                    print(f"   Caption: {row['image_caption'][:50] if row['image_caption'] else 'NULL'}...")
                    print(f"   颜色: {row['dominant_colors']}")
                    print(f"   物体: {row['object_tags']}")
                    print(f"   风格: {row['style_tags']}")
                else:
                    import json
                    metadata = row['metadata']
                    if isinstance(metadata, str):
                        metadata = json.loads(metadata)
                    print(f"   Caption: {metadata.get('caption', 'NULL')[:50] if metadata.get('caption') else 'NULL'}...")
                    print(f"   颜色: {metadata.get('dominant_colors', [])}")
                    print(f"   物体: {metadata.get('object_tags', [])}")
        
        print("\n" + "="*80)
        if missing_any_tag > 0:
            print("💡 建议运行批量标注脚本补充标签：")
            print(f"   python search/batch_enrich_captions.py --user-id {user_id} --max-items {missing_any_tag}")
        else:
            print("✅ 所有记录都有完整标签")
        print("="*80 + "\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="检查数据库中缺少标签的记录")
    parser.add_argument("--user-id", type=str, default="anonymous", help="用户 ID（默认: anonymous）")
    args = parser.parse_args()
    
    async def main():
        await check_missing_tags(args.user_id)
        await close_pool()
    
    asyncio.run(main())

