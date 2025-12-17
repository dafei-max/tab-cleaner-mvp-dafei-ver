#!/usr/bin/env python3
"""
诊断数据库查询问题
检查为什么 batch-captions API 返回 0 条结果
"""
import asyncio
import sys
from pathlib import Path

# 添加项目路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from dotenv import load_dotenv
load_dotenv()


async def diagnose_db_query(user_id: str, test_urls: list):
    """
    诊断数据库查询问题
    
    Args:
        user_id: 用户 ID
        test_urls: 测试的 URL 列表
    """
    from app.vector_db import (
        get_pool, 
        _normalize_user_id, 
        _normalize_url_for_storage,
        ACTIVE_TABLE, 
        get_items_by_urls
    )
    
    print("=" * 80)
    print("🔍 数据库查询诊断")
    print("=" * 80)
    
    normalized_user_id = _normalize_user_id(user_id)
    print(f"\n原始 user_id: {user_id}")
    print(f"规范化 user_id: {normalized_user_id}")
    
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            # 1. 检查数据库中有多少条该用户的记录
            print(f"\n📊 Step 1: 检查用户数据")
            print("-" * 80)
            
            total_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active'
            """, normalized_user_id)
            
            print(f"✓ 用户总记录数: {total_count}")
            
            if total_count == 0:
                print("\n❌ 问题：数据库中没有该用户的记录！")
                print(f"   可能原因:")
                print(f"   1. user_id 不匹配")
                print(f"   2. 数据还没有保存到数据库")
                print(f"   3. 数据的 status 不是 'active'")
                
                # 检查是否有其他 user_id
                other_users = await conn.fetch(f"""
                    SELECT DISTINCT user_id, COUNT(*) as count
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                    GROUP BY user_id
                    ORDER BY count DESC
                    LIMIT 5
                """)
                
                if other_users:
                    print(f"\n   数据库中的用户 ID（前5个）:")
                    for row in other_users:
                        print(f"   - {row['user_id']}: {row['count']} 条记录")
                
                return
            
            # 2. 检查是否有图片
            with_image_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active'
                  AND image IS NOT NULL AND image != ''
            """, normalized_user_id)
            
            print(f"✓ 有图片的记录: {with_image_count}")
            
            # 3. 检查测试 URL 是否在数据库中（包括规范化检查）
            print(f"\n📋 Step 2: 检查测试 URL（包括规范化）")
            print("-" * 80)
            print(f"测试 URL 数量: {len(test_urls)}")
            
            for i, url in enumerate(test_urls[:5], 1):  # 只显示前5个
                print(f"\n  [{i}] 原始 URL: {url[:70]}...")
                
                # ✅ 规范化 URL（与存储时保持一致）
                normalized_url = _normalize_url_for_storage(url)
                print(f"      规范化 URL: {normalized_url[:70]}...")
                
                # 检查原始 URL 是否存在
                exists_original = await conn.fetchrow(f"""
                    SELECT user_id, url, title, image, image_caption,
                           style_tags, object_tags, metadata, status
                    FROM {ACTIVE_TABLE}
                    WHERE url = $1
                """, url)
                
                # 检查规范化 URL 是否存在
                exists_normalized = await conn.fetchrow(f"""
                    SELECT user_id, url, title, image, image_caption,
                           style_tags, object_tags, metadata, status
                    FROM {ACTIVE_TABLE}
                    WHERE url = $1
                """, normalized_url)
                
                if not exists_original and not exists_normalized:
                    print(f"      ❌ 数据库中不存在此 URL（原始和规范化都不存在）")
                    
                    # 模糊匹配（检查是否有相似的 URL）
                    similar = await conn.fetch(f"""
                        SELECT url, user_id, status
                        FROM {ACTIVE_TABLE}
                        WHERE url LIKE $1
                        LIMIT 3
                    """, f"%{url[:50]}%")
                    
                    if similar:
                        print(f"      💡 找到相似 URL:")
                        for sim in similar:
                            print(f"         - {sim['url'][:80]}...")
                            print(f"           user_id: {sim['user_id']}, status: {sim['status']}")
                else:
                    found = exists_normalized if exists_normalized else exists_original
                    print(f"      ✅ 数据库中存在")
                    print(f"         user_id: {found['user_id']}")
                    print(f"         status: {found['status']}")
                    print(f"         title: {found['title'][:40] if found['title'] else 'N/A'}...")
                    print(f"         has_image: {bool(found['image'])}")
                    print(f"         has_caption: {bool(found['image_caption'])}")
                    
                    if found['user_id'] != normalized_user_id:
                        print(f"         ⚠️  警告：user_id 不匹配！")
                        print(f"            期望: {normalized_user_id}")
                        print(f"            实际: {found['user_id']}")
                    
                    if found['status'] != 'active':
                        print(f"         ⚠️  警告：status 不是 'active'！")
                        print(f"            实际: {found['status']}")
            
            # 4. 测试批量查询函数
            print(f"\n🔧 Step 3: 测试 get_items_by_urls 函数")
            print("-" * 80)
            
            print(f"输入 URL 数量: {len(test_urls)}")
            print(f"输入 user_id: {normalized_user_id}")
            
            results = await get_items_by_urls(normalized_user_id, test_urls)
            
            print(f"✓ 返回结果数: {len(results)}")
            
            if len(results) == 0:
                print(f"\n❌ 问题：get_items_by_urls 返回 0 条结果")
                print(f"   可能原因:")
                print(f"   1. user_id 不匹配（期望: {normalized_user_id}）")
                print(f"   2. URLs 不在数据库中（或规范化后不匹配）")
                print(f"   3. status 不是 'active'")
                
                # 详细检查：手动执行查询
                print(f"\n   🔍 手动执行查询测试:")
                normalized_test_urls = [_normalize_url_for_storage(url) for url in test_urls if url]
                
                if normalized_test_urls:
                    placeholders = ','.join([f'${i+1}' for i in range(len(normalized_test_urls))])
                    manual_results = await conn.fetch(f"""
                        SELECT user_id, url, title, image_caption, status
                        FROM {ACTIVE_TABLE}
                        WHERE user_id = ${len(normalized_test_urls)+1} 
                          AND url IN ({placeholders}) 
                          AND status = 'active'
                    """, *normalized_test_urls, normalized_user_id)
                    
                    print(f"      手动查询结果数: {len(manual_results)}")
                    
                    if len(manual_results) > 0:
                        print(f"      ✅ 手动查询成功，说明问题可能在 get_items_by_urls 函数中")
                        for row in manual_results[:3]:
                            print(f"         - {row['url'][:60]}...")
                    else:
                        print(f"      ❌ 手动查询也返回 0 条，说明数据确实不存在或不匹配")
                        
                        # 检查每个 URL
                        for url in normalized_test_urls[:3]:
                            check = await conn.fetchrow(f"""
                                SELECT user_id, url, status
                                FROM {ACTIVE_TABLE}
                                WHERE url = $1
                            """, url)
                            if check:
                                print(f"         URL {url[:50]}... 存在，但:")
                                print(f"           - user_id 匹配: {check['user_id'] == normalized_user_id}")
                                print(f"           - status 是 active: {check['status'] == 'active'}")
            else:
                print(f"\n✅ 成功返回 {len(results)} 条结果")
                
                # 显示示例结果
                for i, item in enumerate(results[:3], 1):
                    print(f"\n  [{i}] URL: {item.get('url', 'N/A')[:60]}...")
                    print(f"      image_caption: {item.get('image_caption', 'N/A')[:50] if item.get('image_caption') else '❌ 无'}...")
                    print(f"      style_tags: {item.get('style_tags', [])}")
                    print(f"      object_tags: {item.get('object_tags', [])}")
            
            # 5. 显示一些示例数据
            print(f"\n📝 Step 4: 数据库示例数据")
            print("-" * 80)
            
            samples = await conn.fetch(f"""
                SELECT url, title, image_caption, style_tags, object_tags, status
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active'
                  AND image IS NOT NULL AND image != ''
                ORDER BY updated_at DESC
                LIMIT 5
            """, normalized_user_id)
            
            if samples:
                print(f"最近的 {len(samples)} 条记录:")
                for i, row in enumerate(samples, 1):
                    print(f"\n  [{i}] {row['url'][:60]}...")
                    print(f"      title: {row['title'][:40] if row['title'] else 'N/A'}...")
                    print(f"      caption: {row['image_caption'][:50] if row['image_caption'] else '❌ 无'}...")
                    print(f"      tags: {(row['style_tags'] or []) + (row['object_tags'] or [])}")
                    print(f"      status: {row['status']}")
            else:
                print("❌ 没有找到示例数据")
            
            # 6. 检查 URL 规范化问题
            print(f"\n🔍 Step 5: URL 规范化检查")
            print("-" * 80)
            
            # 从数据库中获取一些实际的 URL（包括 url 和 image 字段）
            db_items = await conn.fetch(f"""
                SELECT url, image, title
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active'
                LIMIT 5
            """, normalized_user_id)
            
            if db_items:
                print(f"数据库中的实际数据（前5个）:")
                for i, row in enumerate(db_items, 1):
                    db_url = row['url']
                    db_image = row['image']
                    normalized_db_url = _normalize_url_for_storage(db_url)
                    print(f"\n  [{i}] 数据库 url 字段: {db_url[:70]}...")
                    print(f"       数据库 image 字段: {db_image[:70] if db_image else 'N/A'}...")
                    print(f"       title: {row['title'][:40] if row['title'] else 'N/A'}...")
                    print(f"       url 规范化后: {normalized_db_url[:70]}...")
                    print(f"       url 是否一致: {db_url == normalized_db_url}")
                    
                    # 检查 url 和 image 是否相同
                    if db_image:
                        normalized_db_image = _normalize_url_for_storage(db_image)
                        print(f"       image 规范化后: {normalized_db_image[:70]}...")
                        print(f"       url == image: {normalized_db_url == normalized_db_image}")
            
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        from app.vector_db import close_pool
        await close_pool()


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="诊断数据库查询问题")
    parser.add_argument("--user-id", type=str, required=True, help="用户 ID")
    parser.add_argument("--urls", type=str, nargs="+", help="测试的 URL 列表")
    
    args = parser.parse_args()
    
    # 如果没有提供 URL，使用示例 URL
    test_urls = args.urls or [
        "https://example.com/test",
    ]
    
    await diagnose_db_query(args.user_id, test_urls)


if __name__ == "__main__":
    asyncio.run(main())



