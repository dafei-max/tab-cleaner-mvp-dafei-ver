#!/usr/bin/env python3
"""
检查 Pinterest URL 在数据库中的存储情况
"""
import asyncio
import sys
from pathlib import Path

parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from dotenv import load_dotenv
load_dotenv()


async def check_pinterest_url():
    from app.vector_db import get_pool, ACTIVE_TABLE, _normalize_url_for_storage
    
    pool = await get_pool()
    pinterest_url = "https://uk.pinterest.com/pin/7107311903188836/"
    normalized_url = _normalize_url_for_storage(pinterest_url)
    
    print("=" * 80)
    print("🔍 检查 Pinterest URL 存储情况")
    print("=" * 80)
    print(f"\n原始 URL: {pinterest_url}")
    print(f"规范化 URL: {normalized_url}")
    
    async with pool.acquire() as conn:
        # 查询所有匹配的记录（不限制 user_id）
        all_records = await conn.fetch(f"""
            SELECT user_id, url, title, image, image_caption, style_tags, object_tags
            FROM {ACTIVE_TABLE}
            WHERE url = $1 AND status = 'active'
        """, normalized_url)
        
        print(f"\n📊 找到 {len(all_records)} 条记录（所有用户）:")
        for i, row in enumerate(all_records, 1):
            print(f"\n  [{i}] user_id: {row['user_id']}")
            print(f"      url: {row['url'][:70]}...")
            print(f"      title: {row['title'][:50] if row['title'] else 'N/A'}...")
            print(f"      image: {row['image'][:70] if row['image'] else 'N/A'}...")
            print(f"      has_caption: {bool(row['image_caption'])}")
            print(f"      style_tags: {row['style_tags'] or []}")
            print(f"      object_tags: {row['object_tags'] or []}")
        
        # 检查是否有图片 URL 也存储了
        if all_records:
            image_url = all_records[0]['image']
            if image_url and image_url.startswith('http'):
                print(f"\n🔍 检查图片 URL 是否也存储为 url 字段:")
                image_records = await conn.fetch(f"""
                    SELECT user_id, url, title, image_caption
                    FROM {ACTIVE_TABLE}
                    WHERE url = $1 AND status = 'active'
                """, _normalize_url_for_storage(image_url))
                
                print(f"   找到 {len(image_records)} 条记录（图片 URL 作为 url 字段）:")
                for i, row in enumerate(image_records, 1):
                    print(f"     [{i}] user_id: {row['user_id']}, url: {row['url'][:70]}...")
    
    from app.vector_db import close_pool
    await close_pool()


if __name__ == "__main__":
    asyncio.run(check_pinterest_url())
