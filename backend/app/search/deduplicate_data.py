"""
检查并删除数据库中完全重复的数据
重复的定义：相同的 user_id 和 url
保留最早创建的记录，删除其他重复项
"""
import asyncio
import sys
from pathlib import Path
from typing import List, Dict
from dotenv import load_dotenv

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id


async def find_duplicates(dry_run: bool = True) -> List[Dict]:
    """
    查找重复的数据
    
    Args:
        dry_run: 如果为 True，只查找不删除
    
    Returns:
        重复数据列表
    """
    pool = await get_pool()
    
    print("=" * 60)
    print("🔍 检查数据库中的重复数据")
    print("=" * 60)
    
    async with pool.acquire() as conn:
        # 查找重复的 (user_id, url) 组合
        query = f"""
            SELECT 
                user_id,
                url,
                COUNT(*) as duplicate_count,
                MIN(created_at) as first_created,
                MAX(created_at) as last_created,
                array_agg(ctid ORDER BY created_at) as all_ctids,
                array_agg(created_at ORDER BY created_at) as all_created_at
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
            GROUP BY user_id, url
            HAVING COUNT(*) > 1
            ORDER BY duplicate_count DESC, user_id, url
        """
        
        duplicates = await conn.fetch(query)
        
        if not duplicates:
            print("\n✅ 没有发现重复数据！")
            return []
        
        print(f"\n📊 发现 {len(duplicates)} 组重复数据：\n")
        
        total_duplicates = 0
        duplicate_details = []
        
        for row in duplicates:
            user_id = row['user_id']
            url = row['url']
            count = row['duplicate_count']
            first_created = row['first_created']
            last_created = row['last_created']
            all_ctids = row['all_ctids']
            all_created_at = row['all_created_at']
            
            # 保留最早创建的，删除其他的
            to_keep = all_ctids[0]  # 第一个（最早创建的）
            to_delete = all_ctids[1:]  # 其余的
            
            total_duplicates += len(to_delete)
            
            print(f"  🔴 重复组: user_id={user_id}, url={url[:60]}...")
            print(f"     重复数量: {count}")
            print(f"     最早创建: {first_created}")
            print(f"     最晚创建: {last_created}")
            print(f"     保留: {to_keep} (最早)")
            print(f"     删除: {len(to_delete)} 条记录")
            print()
            
            duplicate_details.append({
                'user_id': user_id,
                'url': url,
                'to_keep': to_keep,
                'to_delete': to_delete,
                'count': count
            })
        
        print(f"\n📈 统计:")
        print(f"  • 重复组数: {len(duplicates)}")
        print(f"  • 需要删除的记录数: {total_duplicates}")
        print(f"  • 将保留的记录数: {len(duplicates)}")
        
        if dry_run:
            print(f"\n⚠️  这是预览模式（dry-run），不会实际删除数据")
            print(f"   运行时添加 --delete 参数来实际执行删除操作")
        else:
            print(f"\n🗑️  开始删除重复数据...")
            deleted_count = 0
            
            for detail in duplicate_details:
                # 使用 ctid 删除（更精确）
                for ctid in detail['to_delete']:
                    try:
                        # 使用 ctid 删除
                        delete_query = f"""
                            DELETE FROM {ACTIVE_TABLE}
                            WHERE ctid = $1
                        """
                        result = await conn.execute(delete_query, ctid)
                        if result == "DELETE 1":
                            deleted_count += 1
                    except Exception as e:
                        print(f"  ❌ 删除失败 (ctid={ctid}): {e}")
            
            print(f"\n✅ 删除完成！共删除 {deleted_count} 条重复记录")
        
        return duplicate_details


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="检查并删除数据库中的重复数据")
    parser.add_argument("--delete", action="store_true", help="实际执行删除操作（默认只是预览）")
    parser.add_argument("--user-id", type=str, help="只检查特定用户的数据")
    args = parser.parse_args()
    
    try:
        await find_duplicates(dry_run=not args.delete)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

