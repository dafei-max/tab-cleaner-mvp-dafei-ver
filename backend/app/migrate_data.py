"""
数据迁移脚本：从旧表迁移到新表（支持软删除）
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vector_db import get_pool, close_pool, NAMESPACE, LEGACY_TABLE, ACTIVE_TABLE


async def migrate_data():
    """从旧表迁移数据到新表"""
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            # 检查旧表是否存在
            legacy_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = '{NAMESPACE}' 
                    AND table_name = 'opengraph_items'
                );
            """)
            
            if not legacy_exists:
                print(f"[Migrate] ✓ No legacy table found, skipping migration")
                return
            
            # 检查新表是否存在
            active_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = '{NAMESPACE}' 
                    AND table_name = 'opengraph_items_v2'
                );
            """)
            
            if not active_exists:
                print(f"[Migrate] ✗ Target table {ACTIVE_TABLE} does not exist. Please run init_schema() first.")
                return
            
            # 统计旧表数据
            legacy_count = await conn.fetchval(f"""
                SELECT COUNT(*) FROM {LEGACY_TABLE};
            """)
            
            print(f"[Migrate] Found {legacy_count} items in legacy table")
            
            if legacy_count == 0:
                print(f"[Migrate] ✓ No data to migrate")
                return
            
            # 检查是否已经迁移过
            migrated_count = await conn.fetchval(f"""
                SELECT COUNT(*) FROM {ACTIVE_TABLE}
                WHERE user_id = 'anonymous';
            """)
            
            if migrated_count > 0:
                print(f"[Migrate] ⚠ Found {migrated_count} items already in new table")
                confirm = input("Continue migration anyway? (y/n): ").strip().lower()
                if confirm != 'y':
                    print("[Migrate] Migration cancelled")
                    return
            
            # 批量迁移（每次 100 条）
            batch_size = 100
            total_migrated = 0
            total_failed = 0
            
            offset = 0
            while True:
                rows = await conn.fetch(f"""
                    SELECT url, title, description, image, screenshot_image, site_name,
                           tab_id, tab_title, text_embedding, image_embedding, metadata,
                           created_at, updated_at
                    FROM {LEGACY_TABLE}
                    ORDER BY created_at
                    LIMIT $1 OFFSET $2;
                """, batch_size, offset)
                
                if not rows:
                    break
                
                print(f"[Migrate] Processing batch: {offset+1} to {offset+len(rows)}...")
                
                for row in rows:
                    try:
                        # 迁移到新表，user_id 统一设为 'anonymous'（历史数据归属于匿名账号）
                        await conn.execute(f"""
                            INSERT INTO {ACTIVE_TABLE} (
                                user_id, url, title, description, image, screenshot_image, site_name,
                                tab_id, tab_title, text_embedding, image_embedding, metadata,
                                status, created_at, updated_at
                            ) VALUES (
                                'anonymous', $1, $2, $3, $4, $5, $6, $7, $8, 
                                $9::vector(1024), $10::vector(1024), $11::jsonb,
                                'active', $12, $13
                            )
                            ON CONFLICT (user_id, url) DO NOTHING;
                        """, 
                            row['url'],
                            row.get('title'),
                            row.get('description'),
                            row.get('image'),
                            row.get('screenshot_image'),
                            row.get('site_name'),
                            row.get('tab_id'),
                            row.get('tab_title'),
                            row.get('text_embedding'),
                            row.get('image_embedding'),
                            row.get('metadata'),
                            row.get('created_at'),
                            row.get('updated_at')
                        )
                        total_migrated += 1
                    except Exception as e:
                        print(f"[Migrate] ✗ Failed to migrate {row.get('url', 'unknown')[:50]}...: {e}")
                        total_failed += 1
                
                offset += len(rows)
                
                if len(rows) < batch_size:
                    break
            
            print(f"\n[Migrate] Migration completed:")
            print(f"  - Migrated: {total_migrated}")
            print(f"  - Failed: {total_failed}")
            print(f"  - Total: {total_migrated + total_failed}")
    
    except Exception as e:
        print(f"[Migrate] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(migrate_data())

