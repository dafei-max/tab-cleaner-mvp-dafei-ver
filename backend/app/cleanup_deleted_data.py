"""
定时任务：清理 deleted_at 超过 30 天的数据
可以物理删除或匿名化数据
"""
import asyncio
import sys
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vector_db import get_pool, close_pool, NAMESPACE, ACTIVE_TABLE


async def cleanup_deleted_data(days_threshold: int = 30, anonymize: bool = True):
    """
    清理 deleted_at 超过指定天数的数据
    
    Args:
        days_threshold: 删除阈值（天数）
        anonymize: 如果为 True，匿名化数据；如果为 False，物理删除
    """
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            cutoff_date = datetime.now() - timedelta(days=days_threshold)
            
            # 查找需要清理的记录
            count_query = f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE status = 'deleted' 
                  AND deleted_at < $1;
            """
            
            count = await conn.fetchval(count_query, cutoff_date)
            
            print(f"[Cleanup] Found {count} records to clean up (deleted before {cutoff_date})")
            
            if count == 0:
                print("[Cleanup] ✓ No records to clean up")
                return
            
            if anonymize:
                # 匿名化：清空敏感字段，保留 embedding 用于搜索
                print("[Cleanup] Anonymizing data...")
                result = await conn.execute(f"""
                    UPDATE {ACTIVE_TABLE}
                    SET 
                        user_id = 'anonymous',
                        title = NULL,
                        description = NULL,
                        image = NULL,
                        screenshot_image = NULL,
                        site_name = NULL,
                        tab_id = NULL,
                        tab_title = NULL,
                        metadata = jsonb_build_object('anonymized', true, 'original_deleted_at', deleted_at),
                        updated_at = NOW()
                    WHERE status = 'deleted' 
                      AND deleted_at < $1;
                """, cutoff_date)
                
                print(f"[Cleanup] ✓ Anonymized records: {result}")
            else:
                # 物理删除
                print("[Cleanup] Physically deleting data...")
                result = await conn.execute(f"""
                    DELETE FROM {ACTIVE_TABLE}
                    WHERE status = 'deleted' 
                      AND deleted_at < $1;
                """, cutoff_date)
                
                print(f"[Cleanup] ✓ Deleted records: {result}")
    
    except Exception as e:
        print(f"[Cleanup] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Clean up deleted data")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Days threshold (default: 30)"
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Physically delete instead of anonymizing"
    )
    
    args = parser.parse_args()
    
    asyncio.run(cleanup_deleted_data(
        days_threshold=args.days,
        anonymize=not args.delete
    ))

