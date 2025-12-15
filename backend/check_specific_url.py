#!/usr/bin/env python3
"""
检查特定 URL 的 caption 状态
"""
import asyncio
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from app.vector_db import get_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id, _normalize_url_for_storage, get_items_by_urls

async def check_url(user_id: str, url: str):
    """检查特定 URL 的状态"""
    print(f"\n🔍 检查 URL: {url}")
    print(f"📋 User ID: {user_id}")
    
    # 规范化
    normalized_user_id = _normalize_user_id(user_id)
    normalized_url = _normalize_url_for_storage(url)
    
    print(f"\n✅ 规范化后的 URL: {normalized_url}")
    
    # 查询数据库
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 检查是否有记录
        row = await conn.fetchrow(f"""
            SELECT user_id, url, image, image_caption, style_tags, object_tags, dominant_colors, status
            FROM {ACTIVE_TABLE}
            WHERE user_id = $1 AND (url = $2 OR image = $2)
            ORDER BY updated_at DESC
            LIMIT 1;
        """, normalized_user_id, normalized_url)
        
        if row:
            print(f"\n✅ 找到记录:")
            print(f"   URL (存储): {row['url']}")
            print(f"   Image: {row['image']}")
            print(f"   Status: {row['status']}")
            print(f"   Has Caption: {bool(row['image_caption'])}")
            if row['image_caption']:
                print(f"   Caption: {row['image_caption'][:100]}...")
            print(f"   Style Tags: {row['style_tags']}")
            print(f"   Object Tags: {row['object_tags']}")
            print(f"   Dominant Colors: {row['dominant_colors']}")
        else:
            print(f"\n❌ 未找到记录")
            # 尝试查找类似的 URL
            print(f"\n🔍 尝试查找类似的 URL...")
            similar_rows = await conn.fetch(f"""
                SELECT user_id, url, image, image_caption, status
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND (url LIKE $2 OR image LIKE $2)
                LIMIT 5;
            """, normalized_user_id, f"%{normalized_url.split('/')[-1]}%")
            
            if similar_rows:
                print(f"   找到 {len(similar_rows)} 条相似记录:")
                for r in similar_rows:
                    print(f"     - URL: {r['url']}")
                    print(f"       Image: {r['image']}")
                    print(f"       Has Caption: {bool(r['image_caption'])}")
            else:
                print(f"   未找到相似记录")
        
        # 使用 get_items_by_urls 测试
        print(f"\n🔍 使用 get_items_by_urls 测试...")
        results = await get_items_by_urls(normalized_user_id, [url, normalized_url])
        print(f"   返回 {len(results)} 条结果")
        for r in results:
            print(f"     - URL: {r.get('url', 'N/A')}")
            print(f"       Image: {r.get('image', 'N/A')}")
            print(f"       Has Caption: {bool(r.get('image_caption'))}")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-id', required=True, help='User ID')
    parser.add_argument('--url', required=True, help='URL to check')
    args = parser.parse_args()
    
    asyncio.run(check_url(args.user_id, args.url))


