"""
清理重复 Caption 脚本

检测并删除（软删除）具有相同 Caption 的重复记录（保留最新的）
"""
import asyncio
import argparse
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, _normalize_user_id

async def cleanup_duplicate_captions(
    user_id: Optional[str] = None,
    dry_run: bool = True,
) -> None:
    """
    清理重复 Caption
    
    Args:
        user_id: 用户ID，如果为 None 则清理所有用户
        dry_run: 是否为试运行（不实际删除）
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    print("\n" + "="*80)
    print("🔍 检查重复 Caption")
    print("="*80)
    print(f"用户ID: {normalized_user if normalized_user else '所有用户'}")
    print(f"模式: {'试运行' if dry_run else '实际执行'}")
    print("="*80)
    
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
        
        if not has_caption_field:
            print("\n⚠️  image_caption 字段不存在，尝试使用 metadata->>'caption'")
            # 使用 metadata 查询
            if normalized_user:
                query = f"""
                    WITH normalized_captions AS (
                        SELECT
                            tab_id,
                            url,
                            title,
                            created_at,
                            LOWER(TRIM(COALESCE(metadata->>'caption', ''))) AS normalized_caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND user_id = $1
                          AND metadata ? 'caption'
                          AND metadata->>'caption' IS NOT NULL
                          AND metadata->>'caption' != ''
                    )
                    SELECT
                        normalized_caption as caption,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(url ORDER BY created_at DESC) as urls,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_captions
                    WHERE normalized_caption != ''
                    GROUP BY normalized_caption
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query, normalized_user)
            else:
                query = f"""
                    WITH normalized_captions AS (
                        SELECT
                            tab_id,
                            url,
                            title,
                            created_at,
                            LOWER(TRIM(COALESCE(metadata->>'caption', ''))) AS normalized_caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND metadata ? 'caption'
                          AND metadata->>'caption' IS NOT NULL
                          AND metadata->>'caption' != ''
                    )
                    SELECT
                        normalized_caption as caption,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(url ORDER BY created_at DESC) as urls,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_captions
                    WHERE normalized_caption != ''
                    GROUP BY normalized_caption
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query)
        else:
            # 使用新字段查询
            if normalized_user:
                query = f"""
                    WITH normalized_captions AS (
                        SELECT
                            tab_id,
                            url,
                            title,
                            created_at,
                            LOWER(TRIM(COALESCE(image_caption, ''))) AS normalized_caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND user_id = $1
                          AND image_caption IS NOT NULL
                          AND image_caption != ''
                    )
                    SELECT
                        normalized_caption as caption,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(url ORDER BY created_at DESC) as urls,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_captions
                    WHERE normalized_caption != ''
                    GROUP BY normalized_caption
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query, normalized_user)
            else:
                query = f"""
                    WITH normalized_captions AS (
                        SELECT
                            tab_id,
                            url,
                            title,
                            created_at,
                            LOWER(TRIM(COALESCE(image_caption, ''))) AS normalized_caption
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND image_caption IS NOT NULL
                          AND image_caption != ''
                    )
                    SELECT
                        normalized_caption as caption,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(url ORDER BY created_at DESC) as urls,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_captions
                    WHERE normalized_caption != ''
                    GROUP BY normalized_caption
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query)
        
        print(f"\n找到 {len(rows)} 组重复的 Caption")
        
        if len(rows) == 0:
            print("✅ 没有重复的 Caption")
            return
        
        total_deleted = 0
        
        # 显示前 20 组重复
        print("\n" + "="*80)
        print("📝 重复 Caption 示例（前20组）")
        print("="*80)
        
        for i, row in enumerate(rows[:20], 1):
            caption = row['caption']
            count = row['count']
            tab_ids_raw = row['tab_ids']  # 原始数组，可能包含 None
            tab_ids = [tid for tid in tab_ids_raw if tid is not None]  # 过滤掉 None
            urls_raw = row['urls']  # 原始 URL 数组
            urls = [url for url in urls_raw if url]  # 过滤掉空 URL
            titles = row.get('titles', [])
            
            # 判断使用 tab_id 还是 url 进行删除
            use_tab_id = len(tab_ids) >= 2
            use_url = not use_tab_id and len(urls) >= 2
            
            if not use_tab_id and not use_url:
                print(f"\n{i}. Caption: {caption[:80]}...")
                if len(tab_ids) == 0 and len(urls) == 0:
                    print(f"   ⚠️  所有记录的 tab_id 和 url 都无效，跳过此组")
                elif len(tab_ids) == 1 and len(urls) <= 1:
                    print(f"   ⚠️  只有 1 条有效记录，无需删除")
                continue
            
            print(f"\n{i}. Caption: {caption[:80]}...")
            if use_tab_id:
                print(f"   重复次数: {count} (有效 tab_id: {len(tab_ids)} 个)")
                print(f"   保留: tab_id={tab_ids[0]} (最新)")
                delete_count = len(tab_ids) - 1
            else:
                print(f"   重复次数: {count} (使用 url 删除，有效 url: {len(urls)} 个)")
                print(f"   保留: url={urls[0][:60]}... (最新)")
                delete_count = len(urls) - 1
            
            if titles and len(titles) > 0:
                print(f"   标题示例: {titles[0][:50] if titles[0] else 'N/A'}")
            print(f"   删除: {delete_count} 个")
            
            if not dry_run:
                if use_tab_id:
                    # 使用 tab_id 删除
                    delete_tab_ids = tab_ids[1:]
                    if delete_tab_ids:
                        if normalized_user:
                            await conn.execute(
                                f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE user_id = $1 AND tab_id = ANY($2::int[])",
                                normalized_user, delete_tab_ids
                            )
                        else:
                            await conn.execute(
                                f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE tab_id = ANY($1::int[])",
                                delete_tab_ids
                            )
                        total_deleted += len(delete_tab_ids)
                        print(f"   ✅ 已删除 {len(delete_tab_ids)} 个重复项（使用 tab_id）")
                else:
                    # 使用 url 删除
                    delete_urls = urls[1:]
                    if delete_urls:
                        if normalized_user:
                            await conn.execute(
                                f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE user_id = $1 AND url = ANY($2::text[])",
                                normalized_user, delete_urls
                            )
                        else:
                            await conn.execute(
                                f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE url = ANY($1::text[])",
                                delete_urls
                            )
                        total_deleted += len(delete_urls)
                        print(f"   ✅ 已删除 {len(delete_urls)} 个重复项（使用 url）")
            else:
                total_deleted += delete_count  # 计数用于统计
        
        if len(rows) > 20:
            print(f"\n... (还有 {len(rows) - 20} 组重复项)")
            # 处理剩余的重复项
            for row in rows[20:]:
                tab_ids_raw = row['tab_ids']
                tab_ids = [tid for tid in tab_ids_raw if tid is not None]
                urls_raw = row['urls']
                urls = [url for url in urls_raw if url]
                
                # 判断使用 tab_id 还是 url 进行删除
                use_tab_id = len(tab_ids) >= 2
                use_url = not use_tab_id and len(urls) >= 2
                
                if not use_tab_id and not use_url:
                    continue
                
                if not dry_run:
                    if use_tab_id:
                        delete_tab_ids = tab_ids[1:]
                        if delete_tab_ids:
                            if normalized_user:
                                await conn.execute(
                                    f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE user_id = $1 AND tab_id = ANY($2::int[])",
                                    normalized_user, delete_tab_ids
                                )
                            else:
                                await conn.execute(
                                    f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE tab_id = ANY($1::int[])",
                                    delete_tab_ids
                                )
                            total_deleted += len(delete_tab_ids)
                    else:
                        delete_urls = urls[1:]
                        if delete_urls:
                            if normalized_user:
                                await conn.execute(
                                    f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE user_id = $1 AND url = ANY($2::text[])",
                                    normalized_user, delete_urls
                                )
                            else:
                                await conn.execute(
                                    f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE url = ANY($1::text[])",
                                    delete_urls
                                )
                            total_deleted += len(delete_urls)
                else:
                    if use_tab_id:
                        total_deleted += len(tab_ids) - 1
                    else:
                        total_deleted += len(urls) - 1
        
        print("\n" + "="*80)
        if not dry_run:
            print(f"✅ 清理完成！总共删除了 {total_deleted} 个重复 Caption 项。")
        else:
            print(f"[DRY RUN] 清理完成！将删除 {total_deleted} 个重复 Caption 项。")
        print("="*80)

async def main():
    parser = argparse.ArgumentParser(description="清理重复 Caption")
    parser.add_argument("--user-id", type=str, default=None, help="用户 ID（默认: 所有用户）")
    parser.add_argument("--execute", action="store_true", help="实际执行删除（默认: 试运行）")
    
    args = parser.parse_args()
    
    if not args.execute:
        print("⚠️  试运行模式（不会实际删除数据）")
        print("   使用 --execute 参数来实际执行删除")
    else:
        print("⚠️  实际执行模式（将删除数据）")
        response = input("确认要继续吗？(yes/no): ")
        if response.lower() != 'yes':
            print("操作已取消。")
            return
    
    await cleanup_duplicate_captions(
        user_id=args.user_id,
        dry_run=not args.execute,
    )
    await close_pool()

if __name__ == "__main__":
    asyncio.run(main())

