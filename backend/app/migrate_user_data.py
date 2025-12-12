"""
数据迁移脚本：将 anonymous 用户的数据迁移到指定的用户ID
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id


async def migrate_user_data(from_user_id: str, to_user_id: str, dry_run: bool = False):
    """
    将数据从一个用户ID迁移到另一个用户ID
    
    Args:
        from_user_id: 源用户ID（通常是 'anonymous'）
        to_user_id: 目标用户ID
        dry_run: 如果为 True，只显示会迁移的数据，不实际执行
    """
    normalized_from = _normalize_user_id(from_user_id)
    normalized_to = _normalize_user_id(to_user_id)
    
    print(f"🔄 数据迁移")
    print(f"源用户ID: {from_user_id} → {normalized_from}")
    print(f"目标用户ID: {to_user_id} → {normalized_to}")
    print(f"模式: {'预览（不实际执行）' if dry_run else '实际执行'}")
    print()
    
    if normalized_from == normalized_to:
        print("❌ 源用户ID和目标用户ID相同，无需迁移")
        return
    
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            # 1. 检查源用户的数据
            source_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active';
            """, normalized_from)
            
            print(f"📊 源用户 '{normalized_from}' 的数据量: {source_count} 条")
            
            if source_count == 0:
                print("⚠️  源用户没有数据，无需迁移")
                return
            
            # 2. 检查目标用户是否已有数据
            target_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $2 AND status = 'active';
            """, normalized_to)
            
            print(f"📊 目标用户 '{normalized_to}' 的现有数据量: {target_count} 条")
            
            # 3. 检查是否有URL冲突（目标用户已有相同URL的数据）
            conflict_count = await conn.fetchval(f"""
                SELECT COUNT(DISTINCT s1.url)
                FROM {ACTIVE_TABLE} s1
                INNER JOIN {ACTIVE_TABLE} s2 ON s1.url = s2.url
                WHERE s1.user_id = $1 
                  AND s2.user_id = $2
                  AND s1.status = 'active'
                  AND s2.status = 'active';
            """, normalized_from, normalized_to)
            
            print(f"⚠️  URL冲突数量: {conflict_count} 条（目标用户已有相同URL的数据）")
            print()
            
            if dry_run:
                print("🔍 预览模式：以下数据将被迁移")
                print("=" * 60)
                
                # 显示一些示例数据
                samples = await conn.fetch(f"""
                    SELECT url, title, 
                           CASE WHEN text_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_text_emb,
                           CASE WHEN image_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image_emb,
                           CASE WHEN image_caption IS NOT NULL AND image_caption != '' THEN 'Yes' ELSE 'No' END as has_caption
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1 AND status = 'active'
                    LIMIT 10;
                """, normalized_from)
                
                for i, row in enumerate(samples, 1):
                    print(f"  {i}. {row['url'][:60]}...")
                    print(f"     Title: {row['title'][:50] if row['title'] else 'N/A'}...")
                    print(f"     Text Emb: {row['has_text_emb']}, Image Emb: {row['has_image_emb']}, Caption: {row['has_caption']}")
                
                if source_count > 10:
                    print(f"     ... 还有 {source_count - 10} 条数据")
                
                print()
                print("💡 要实际执行迁移，请运行:")
                print(f"   python migrate_user_data.py --from {from_user_id} --to {to_user_id}")
                return
            
            # 4. 实际执行迁移
            print("🚀 开始迁移数据...")
            
            # 策略：如果目标用户已有相同URL的数据，跳过（不覆盖）
            if conflict_count > 0:
                print(f"⚠️  检测到 {conflict_count} 个URL冲突，将跳过这些URL（不覆盖目标用户的数据）")
                
                # 只迁移目标用户没有的URL
                result = await conn.execute(f"""
                    UPDATE {ACTIVE_TABLE}
                    SET user_id = $2
                    WHERE user_id = $1 
                      AND status = 'active'
                      AND url NOT IN (
                          SELECT url 
                          FROM {ACTIVE_TABLE}
                          WHERE user_id = $2 AND status = 'active'
                      );
                """, normalized_from, normalized_to)
                
                migrated_count = int(result.split()[-1]) if result else 0
            else:
                # 没有冲突，直接迁移所有数据
                result = await conn.execute(f"""
                    UPDATE {ACTIVE_TABLE}
                    SET user_id = $2
                    WHERE user_id = $1 AND status = 'active';
                """, normalized_from, normalized_to)
                
                migrated_count = int(result.split()[-1]) if result else 0
            
            print(f"✅ 迁移完成！")
            print(f"   迁移了 {migrated_count} 条数据")
            print(f"   跳过了 {conflict_count} 条冲突数据（如果存在）")
            
            # 5. 验证迁移结果
            new_source_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active';
            """, normalized_from)
            
            new_target_count = await conn.fetchval(f"""
                SELECT COUNT(*) 
                FROM {ACTIVE_TABLE}
                WHERE user_id = $2 AND status = 'active';
            """, normalized_to)
            
            print()
            print(f"📊 迁移后的数据统计:")
            print(f"   源用户 '{normalized_from}': {new_source_count} 条（剩余）")
            print(f"   目标用户 '{normalized_to}': {new_target_count} 条（总计）")
            
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="迁移用户数据")
    parser.add_argument("--from", type=str, default="anonymous", help="源用户ID（默认: anonymous）")
    parser.add_argument("--to", type=str, required=True, help="目标用户ID（必需）")
    parser.add_argument("--dry-run", action="store_true", help="预览模式：只显示会迁移的数据，不实际执行")
    args = parser.parse_args()
    
    await migrate_user_data(args.from, args.to, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())






