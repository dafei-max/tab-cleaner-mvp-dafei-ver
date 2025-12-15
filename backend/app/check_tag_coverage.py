"""
检查数据库中标签覆盖情况
"""
import asyncio
from dotenv import load_dotenv
load_dotenv()

from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id, close_pool

async def check_tag_coverage(user_id: str = "anonymous"):
    """检查标签覆盖情况"""
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id)
    
    async with pool.acquire() as conn:
        # 检查字段是否存在
        has_dominant_colors = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'dominant_colors'
            );
        """)
        
        has_object_tags = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'object_tags'
            );
        """)
        
        has_style_tags = await conn.fetchval(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'cleantab'
                  AND table_name = 'opengraph_items_v2'
                  AND column_name = 'style_tags'
            );
        """)
        
        print("\n" + "="*80)
        print("📊 数据库标签字段检查")
        print("="*80)
        print(f"dominant_colors 字段存在: {has_dominant_colors}")
        print(f"object_tags 字段存在: {has_object_tags}")
        print(f"style_tags 字段存在: {has_style_tags}")
        
        if not (has_dominant_colors and has_object_tags and has_style_tags):
            print("\n⚠️  部分标签字段不存在，请先运行升级脚本：")
            print("   python upgrade_schema_caption.py")
            return
        
        # 统计标签覆盖情况
        stats = await conn.fetchrow(f"""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN dominant_colors IS NOT NULL AND array_length(dominant_colors, 1) > 0 THEN 1 END) as has_colors,
                COUNT(CASE WHEN object_tags IS NOT NULL AND array_length(object_tags, 1) > 0 THEN 1 END) as has_objects,
                COUNT(CASE WHEN style_tags IS NOT NULL AND array_length(style_tags, 1) > 0 THEN 1 END) as has_styles,
                COUNT(CASE WHEN 
                    (dominant_colors IS NOT NULL AND array_length(dominant_colors, 1) > 0) OR
                    (object_tags IS NOT NULL AND array_length(object_tags, 1) > 0) OR
                    (style_tags IS NOT NULL AND array_length(style_tags, 1) > 0)
                THEN 1 END) as has_any_tag
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1;
        """, normalized_user)
        
        total = stats['total']
        has_colors = stats['has_colors']
        has_objects = stats['has_objects']
        has_styles = stats['has_styles']
        has_any_tag = stats['has_any_tag']
        
        print("\n" + "="*80)
        print("📈 标签覆盖统计")
        print("="*80)
        print(f"总记录数: {total}")
        print(f"\n有颜色标签: {has_colors} ({has_colors/total*100:.1f}%)" if total > 0 else "有颜色标签: 0")
        print(f"有物体标签: {has_objects} ({has_objects/total*100:.1f}%)" if total > 0 else "有物体标签: 0")
        print(f"有风格标签: {has_styles} ({has_styles/total*100:.1f}%)" if total > 0 else "有风格标签: 0")
        print(f"有任意标签: {has_any_tag} ({has_any_tag/total*100:.1f}%)" if total > 0 else "有任意标签: 0")
        print(f"无标签记录: {total - has_any_tag} ({(total - has_any_tag)/total*100:.1f}%)" if total > 0 else "无标签记录: 0")
        
        # 显示一些标签示例
        if has_any_tag > 0:
            print("\n" + "="*80)
            print("📝 标签示例（前5条）")
            print("="*80)
            examples = await conn.fetch(f"""
                SELECT url, title, dominant_colors, object_tags, style_tags
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND (
                      (dominant_colors IS NOT NULL AND array_length(dominant_colors, 1) > 0) OR
                      (object_tags IS NOT NULL AND array_length(object_tags, 1) > 0) OR
                      (style_tags IS NOT NULL AND array_length(style_tags, 1) > 0)
                  )
                LIMIT 5;
            """, normalized_user)
            
            for i, row in enumerate(examples, 1):
                print(f"\n{i}. {row['title'][:50] if row['title'] else 'N/A'}...")
                print(f"   URL: {row['url'][:60]}...")
                print(f"   颜色: {row['dominant_colors']}")
                print(f"   物体: {row['object_tags']}")
                print(f"   风格: {row['style_tags']}")
        
        print("\n" + "="*80)
        if has_any_tag / total < 0.5 if total > 0 else False:
            print("⚠️  标签覆盖率较低，建议运行批量标注脚本：")
            print("   python search/batch_enrich_captions.py")
        else:
            print("✅ 标签覆盖率良好")
        print("="*80 + "\n")

if __name__ == "__main__":
    async def main():
        await check_tag_coverage()
        await close_pool()
    
    asyncio.run(main())








