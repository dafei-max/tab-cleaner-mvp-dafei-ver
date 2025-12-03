"""
快速检查数据库中的重复图片情况
"""
import asyncio
from dotenv import load_dotenv
load_dotenv()

from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id, close_pool

async def check_duplicates(user_id: str = "anonymous"):
    """检查重复图片统计"""
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id)
    
    async with pool.acquire() as conn:
        # 1. 按 image 统计重复
        image_query = f"""
            SELECT
                image,
                COUNT(*) AS cnt,
                ARRAY_AGG(DISTINCT url ORDER BY url) AS urls,
                ARRAY_AGG(tab_id ORDER BY created_at DESC) AS tab_ids
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND image IS NOT NULL
              AND image != ''
            GROUP BY image
            HAVING COUNT(*) >= 2
            ORDER BY cnt DESC
            LIMIT 50;
        """
        image_rows = await conn.fetch(image_query, normalized_user)
        
        # 2. 按 screenshot_image 统计重复
        screenshot_query = f"""
            SELECT
                screenshot_image,
                COUNT(*) AS cnt,
                ARRAY_AGG(DISTINCT url ORDER BY url) AS urls,
                ARRAY_AGG(tab_id ORDER BY created_at DESC) AS tab_ids
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
              AND user_id = $1
              AND screenshot_image IS NOT NULL
              AND screenshot_image != ''
            GROUP BY screenshot_image
            HAVING COUNT(*) >= 2
            ORDER BY cnt DESC
            LIMIT 50;
        """
        screenshot_rows = await conn.fetch(screenshot_query, normalized_user)
        
        # 3. 统计总数
        total_image_dups = await conn.fetchval(f"""
            SELECT COUNT(DISTINCT image)
            FROM (
                SELECT image, COUNT(*) as cnt
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND image IS NOT NULL
                  AND image != ''
                GROUP BY image
                HAVING COUNT(*) >= 2
            ) AS dup_groups;
        """, normalized_user)
        
        total_screenshot_dups = await conn.fetchval(f"""
            SELECT COUNT(DISTINCT screenshot_image)
            FROM (
                SELECT screenshot_image, COUNT(*) as cnt
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND screenshot_image IS NOT NULL
                  AND screenshot_image != ''
                GROUP BY screenshot_image
                HAVING COUNT(*) >= 2
            ) AS dup_groups;
        """, normalized_user)
        
        total_duplicate_items = await conn.fetchval(f"""
            SELECT SUM(cnt - 1)
            FROM (
                SELECT image, COUNT(*) as cnt
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND image IS NOT NULL
                  AND image != ''
                GROUP BY image
                HAVING COUNT(*) >= 2
                UNION ALL
                SELECT screenshot_image, COUNT(*) as cnt
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND screenshot_image IS NOT NULL
                  AND screenshot_image != ''
                GROUP BY screenshot_image
                HAVING COUNT(*) >= 2
            ) AS all_dups;
        """, normalized_user) or 0
        
        print("\n" + "="*80)
        print("📊 数据库重复图片统计")
        print("="*80)
        print(f"\n用户ID: {normalized_user}")
        print(f"\n按 image 字段重复:")
        print(f"  - 重复图片组数: {total_image_dups}")
        print(f"  - 前 10 组重复最多的图片:")
        for i, row in enumerate(image_rows[:10], 1):
            print(f"    {i}. 重复 {row['cnt']} 次")
            print(f"       Image: {row['image'][:80]}...")
            print(f"       URLs: {len(row['urls'])} 个不同URL")
            if len(row['urls']) > 0:
                print(f"       示例: {row['urls'][0][:60]}...")
        
        print(f"\n按 screenshot_image 字段重复:")
        print(f"  - 重复图片组数: {total_screenshot_dups}")
        print(f"  - 前 10 组重复最多的图片:")
        for i, row in enumerate(screenshot_rows[:10], 1):
            print(f"    {i}. 重复 {row['cnt']} 次")
            print(f"       Screenshot: {row['screenshot_image'][:80]}...")
            print(f"       URLs: {len(row['urls'])} 个不同URL")
            if len(row['urls']) > 0:
                print(f"       示例: {row['urls'][0][:60]}...")
        
        print(f"\n📈 总计:")
        print(f"  - 可删除的重复项数量: {total_duplicate_items}")
        print(f"  - 按 image 重复组数: {total_image_dups}")
        print(f"  - 按 screenshot_image 重复组数: {total_screenshot_dups}")
        print("\n" + "="*80)
        print("💡 提示: 运行以下命令清理重复项:")
        print("   python cleanup_duplicate_images.py --user-id anonymous")
        print("="*80 + "\n")

if __name__ == "__main__":
    async def main():
        await check_duplicates()
        await close_pool()
    
    asyncio.run(main())

