"""
清理数据库中的重复项和文档类内容
1. 删除重复的 URL（保留最新的）
2. 标记或删除文档类内容（周会、工作台等）
"""
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from vector_db import get_pool, close_pool, ACTIVE_TABLE, NAMESPACE, _normalize_user_id
from search.preprocess import is_doc_like


async def cleanup_duplicates(user_id: Optional[str] = None, dry_run: bool = True):
    """
    清理重复的 URL（保留最新的）
    
    Args:
        user_id: 用户ID，如果为 None 则清理所有用户
        dry_run: 是否为试运行（不实际删除）
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    try:
        async with pool.acquire() as conn:
            # ✅ 改进：查找重复的 URL（标准化URL，移除查询参数和锚点）
            # 使用 PostgreSQL 的 regexp_replace 来标准化 URL
            if normalized_user:
                query = f"""
                    WITH normalized_urls AS (
                        SELECT 
                            tab_id,
                            url,
                            title,
                            tab_title,
                            created_at,
                            -- 标准化 URL：移除查询参数、锚点、尾随斜杠
                            LOWER(
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        REGEXP_REPLACE(url, '\\?.*$', ''),  -- 移除查询参数
                                        '#.*$', ''                           -- 移除锚点
                                    ),
                                    '/$', ''                                 -- 移除尾随斜杠
                                )
                            ) AS normalized_url
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND user_id = $1
                          AND url IS NOT NULL
                          AND url != ''
                    )
                    SELECT 
                        normalized_url as url,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_urls
                    GROUP BY normalized_url
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query, normalized_user)
            else:
                query = f"""
                    WITH normalized_urls AS (
                        SELECT 
                            tab_id,
                            url,
                            title,
                            tab_title,
                            created_at,
                            -- 标准化 URL：移除查询参数、锚点、尾随斜杠
                            LOWER(
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        REGEXP_REPLACE(url, '\\?.*$', ''),  -- 移除查询参数
                                        '#.*$', ''                           -- 移除锚点
                                    ),
                                    '/$', ''                                 -- 移除尾随斜杠
                                )
                            ) AS normalized_url
                        FROM {ACTIVE_TABLE}
                        WHERE status = 'active'
                          AND url IS NOT NULL
                          AND url != ''
                    )
                    SELECT 
                        normalized_url as url,
                        COUNT(*) as count,
                        ARRAY_AGG(tab_id ORDER BY created_at DESC) as tab_ids,
                        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates,
                        ARRAY_AGG(title ORDER BY created_at DESC) as titles
                    FROM normalized_urls
                    GROUP BY normalized_url
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC;
                """
                rows = await conn.fetch(query)
            
            print(f"\n找到 {len(rows)} 个重复的 URL")
            
            total_deleted = 0
            for row in rows:
                url = row['url']
                count = row['count']
                tab_ids = [tid for tid in row['tab_ids'] if tid is not None]  # 过滤掉 None
                created_dates = row['created_dates']
                titles = row.get('titles', [])
                
                # 计算需要删除的数量（保留最新的1个，删除其他的）
                delete_count = count - 1
                
                print(f"\n标准化URL: {url[:60]}...")
                print(f"  重复次数: {count}")
                if tab_ids:
                    keep_tab_id = tab_ids[0]  # 最新的
                    print(f"  保留: {keep_tab_id} (最新，有 tab_id)")
                else:
                    print(f"  保留: 最新的1条记录 (所有记录的 tab_id 都是 NULL，将通过 URL 删除)")
                if titles and len(titles) > 0:
                    print(f"  标题示例: {titles[0][:50] if titles[0] else 'N/A'}")
                print(f"  删除: {delete_count} 个")
                
                if not dry_run:
                    # 软删除（标记为 deleted）
                    # 方法1：如果有 tab_id，通过 tab_id 删除
                    if tab_ids and len(tab_ids) > 1:
                        delete_tab_ids = tab_ids[1:]  # 除了最新的，其他都删除
                        for tab_id in delete_tab_ids:
                            if tab_id is not None:
                                if normalized_user:
                                    await conn.execute(
                                        f"UPDATE {ACTIVE_TABLE} SET status = 'deleted', deleted_at = NOW() WHERE tab_id = $1 AND user_id = $2 AND status = 'active'",
                                        tab_id, normalized_user
                                    )
                                else:
                                    await conn.execute(
                                        f"UPDATE {ACTIVE_TABLE} SET status = 'deleted', deleted_at = NOW() WHERE tab_id = $1 AND status = 'active'",
                                        tab_id
                                    )
                    
                    # 方法2：如果 tab_id 为 NULL 或需要补充删除，通过标准化 URL 删除（保留最新的1条）
                    # 使用子查询找到需要删除的记录（除了 created_at 最新的那条）
                    if normalized_user:
                        delete_query = f"""
                            UPDATE {ACTIVE_TABLE}
                            SET status = 'deleted', deleted_at = NOW()
                            WHERE user_id = $1
                              AND status = 'active'
                              AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(url, '\\?.*$', ''), '#.*$', ''), '/$', '')) = $2
                              AND created_at < (
                                  SELECT MAX(created_at) FROM {ACTIVE_TABLE}
                                  WHERE user_id = $1
                                    AND status = 'active'
                                    AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(url, '\\?.*$', ''), '#.*$', ''), '/$', '')) = $2
                              );
                        """
                        result = await conn.execute(delete_query, normalized_user, url)
                    else:
                        delete_query = f"""
                            UPDATE {ACTIVE_TABLE}
                            SET status = 'deleted', deleted_at = NOW()
                            WHERE status = 'active'
                              AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(url, '\\?.*$', ''), '#.*$', ''), '/$', '')) = $1
                              AND created_at < (
                                  SELECT MAX(created_at) FROM {ACTIVE_TABLE}
                                  WHERE status = 'active'
                                    AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(url, '\\?.*$', ''), '#.*$', ''), '/$', '')) = $1
                              );
                        """
                        result = await conn.execute(delete_query, url)
                    
                    # 解析删除结果
                    if result.startswith("UPDATE "):
                        actual_deleted = int(result.split()[1])
                        total_deleted += actual_deleted
                        print(f"  ✅ 已删除 {actual_deleted} 个重复项")
                    else:
                        total_deleted += delete_count
                        print(f"  ✅ 已删除 {delete_count} 个重复项")
                else:
                    print(f"  [DRY RUN] 将删除 {delete_count} 个重复项")
            
            if not dry_run:
                print(f"\n✅ 总共删除了 {total_deleted} 个重复项")
            else:
                print(f"\n[DRY RUN] 将删除 {total_deleted} 个重复项")
                
    except Exception as e:
        print(f"❌ 清理重复项失败: {e}")
        import traceback
        traceback.print_exc()


async def cleanup_doc_items(user_id: Optional[str] = None, dry_run: bool = True):
    """
    清理文档类内容（周会、工作台等）
    
    Args:
        user_id: 用户ID，如果为 None 则清理所有用户
        dry_run: 是否为试运行（不实际删除）
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    try:
        async with pool.acquire() as conn:
            # 获取所有活跃项
            if normalized_user:
                query = f"""
                    SELECT tab_id, url, title, tab_title, description, site_name, metadata
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1;
                """
                rows = await conn.fetch(query, normalized_user)
            else:
                query = f"""
                    SELECT tab_id, url, title, tab_title, description, site_name, metadata
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active';
                """
                rows = await conn.fetch(query)
            
            print(f"\n检查 {len(rows)} 个活跃项...")
            
            doc_items = []
            for row in rows:
                item = dict(row)
                if is_doc_like(item):
                    doc_items.append(item)
            
            print(f"\n找到 {len(doc_items)} 个文档类内容")
            
            if doc_items:
                print("\n文档类内容示例（前10个）:")
                for i, item in enumerate(doc_items[:10], 1):
                    title = item.get('title') or item.get('tab_title', 'N/A')[:50]
                    url = item.get('url', 'N/A')[:60]
                    print(f"  {i}. {title}")
                    print(f"     URL: {url}...")
            
            if not dry_run and doc_items:
                # 软删除文档类内容
                tab_ids = [item['tab_id'] for item in doc_items]
                
                # 批量更新
                for tab_id in tab_ids:
                    await conn.execute(
                        f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE tab_id = $1",
                        tab_id
                    )
                
                print(f"\n✅ 已删除 {len(doc_items)} 个文档类内容")
            elif doc_items:
                print(f"\n[DRY RUN] 将删除 {len(doc_items)} 个文档类内容")
            else:
                print("\n✅ 没有找到文档类内容")
                
    except Exception as e:
        print(f"❌ 清理文档类内容失败: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="清理数据库中的重复项和文档类内容")
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="用户 ID（默认: 所有用户）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="试运行模式（不实际删除，默认开启）"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际执行删除（关闭 dry-run）"
    )
    parser.add_argument(
        "--clean-duplicates",
        action="store_true",
        help="清理重复项"
    )
    parser.add_argument(
        "--clean-docs",
        action="store_true",
        help="清理文档类内容"
    )
    
    args = parser.parse_args()
    
    dry_run = not args.execute
    
    if dry_run:
        print("⚠️  试运行模式（不会实际删除数据）")
        print("   使用 --execute 参数来实际执行删除\n")
    else:
        print("⚠️  实际执行模式（将删除数据）\n")
        response = input("确认要继续吗？(yes/no): ")
        if response.lower() != 'yes':
            print("已取消")
            return
    
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        return
    
    print("数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - User ID: {args.user_id or '所有用户'}")
    print()
    
    try:
        # 清理重复项
        if args.clean_duplicates or (not args.clean_duplicates and not args.clean_docs):
            print("=" * 80)
            print("1. 清理重复项")
            print("=" * 80)
            await cleanup_duplicates(user_id=args.user_id, dry_run=dry_run)
        
        # 清理文档类内容
        if args.clean_docs or (not args.clean_duplicates and not args.clean_docs):
            print("\n" + "=" * 80)
            print("2. 清理文档类内容")
            print("=" * 80)
            await cleanup_doc_items(user_id=args.user_id, dry_run=dry_run)
        
        print("\n" + "=" * 80)
        print("✅ 清理完成")
        print("=" * 80)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
    except Exception as e:
        print(f"\n❌ 清理过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


if __name__ == "__main__":
    from typing import Optional
    asyncio.run(main())

