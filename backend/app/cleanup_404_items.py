"""
清理 404 网站脚本

检测并删除（软删除）404 错误、无法访问的网站
"""
import asyncio
import argparse
import aiohttp
from typing import Optional, List, Dict
from dotenv import load_dotenv
load_dotenv()

from vector_db import get_pool, close_pool, ACTIVE_TABLE, _normalize_user_id

async def check_url_status(url: str, session: aiohttp.ClientSession, timeout: int = 5) -> Optional[int]:
    """
    检查 URL 状态码
    
    Returns:
        状态码（如果成功），None（如果失败）
    """
    try:
        async with session.head(url, timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=True) as response:
            return response.status
    except (aiohttp.ClientError, asyncio.TimeoutError, Exception):
        return None

async def cleanup_404_items(
    user_id: Optional[str] = None,
    dry_run: bool = True,
    max_check: Optional[int] = None,
    timeout: int = 5,
) -> None:
    """
    清理 404 网站
    
    Args:
        user_id: 用户ID，如果为 None 则清理所有用户
        dry_run: 是否为试运行（不实际删除）
        max_check: 最多检查数量（用于测试）
        timeout: 请求超时时间（秒）
    """
    pool = await get_pool()
    normalized_user = _normalize_user_id(user_id) if user_id else None
    
    print("\n" + "="*80)
    print("🔍 检查 404 网站")
    print("="*80)
    print(f"用户ID: {normalized_user if normalized_user else '所有用户'}")
    print(f"模式: {'试运行' if dry_run else '实际执行'}")
    if max_check:
        print(f"最多检查: {max_check} 条")
    print("="*80)
    
    # 获取所有活跃记录
    async with pool.acquire() as conn:
        if normalized_user:
            query = f"""
                SELECT tab_id, url, title, status
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND url IS NOT NULL
                  AND url != ''
                ORDER BY created_at DESC
                {'LIMIT $2' if max_check else ''};
            """
            params = (normalized_user, max_check) if max_check else (normalized_user,)
        else:
            query = f"""
                SELECT tab_id, url, title, status
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND url IS NOT NULL
                  AND url != ''
                ORDER BY created_at DESC
                {'LIMIT $1' if max_check else ''};
            """
            params = (max_check,) if max_check else ()
        
        rows = await conn.fetch(query, *params)
    
    print(f"\n找到 {len(rows)} 条记录需要检查")
    
    if not rows:
        print("✅ 没有需要检查的记录")
        return
    
    # 检查 URL 状态
    print("\n开始检查 URL 状态...")
    print("（这可能需要一些时间，请耐心等待）\n")
    
    async with aiohttp.ClientSession() as session:
        checked_count = 0
        error_count = 0
        error_items = []
        
        for row in rows:
            checked_count += 1
            url = row['url']
            tab_id = row['tab_id']
            title = row['title'] or 'N/A'
            
            if checked_count % 10 == 0:
                print(f"  已检查: {checked_count}/{len(rows)}...")
            
            status_code = await check_url_status(url, session, timeout)
            
            if status_code is None:
                # 无法访问（网络错误、超时等）
                error_count += 1
                error_items.append({
                    'tab_id': tab_id,
                    'url': url,
                    'title': title,
                    'reason': '无法访问（网络错误/超时）'
                })
            elif status_code >= 400:
                # HTTP 错误（404, 403, 500 等）
                error_count += 1
                error_items.append({
                    'tab_id': tab_id,
                    'url': url,
                    'title': title,
                    'reason': f'HTTP {status_code}'
                })
            
            # 避免请求过快
            await asyncio.sleep(0.1)
    
    print(f"\n检查完成: {checked_count} 条记录")
    print(f"发现错误: {error_count} 条")
    
    if error_count == 0:
        print("\n✅ 所有 URL 都可以正常访问")
        return
    
    # 显示错误示例
    print("\n" + "="*80)
    print("❌ 错误 URL 示例（前20条）")
    print("="*80)
    for i, item in enumerate(error_items[:20], 1):
        print(f"\n{i}. {item['title'][:50]}...")
        print(f"   URL: {item['url'][:60]}...")
        print(f"   原因: {item['reason']}")
        print(f"   tab_id: {item['tab_id']}")
    
    if len(error_items) > 20:
        print(f"\n... (还有 {len(error_items) - 20} 条)")
    
    # 执行删除
    if not dry_run:
        print("\n" + "="*80)
        print("🗑️  开始删除错误 URL...")
        print("="*80)
        
        tab_ids_to_delete = [item['tab_id'] for item in error_items if item['tab_id'] is not None]
        
        if not tab_ids_to_delete:
            print("⚠️  没有有效的 tab_id 可以删除")
            return
        
        async with pool.acquire() as conn:
            deleted_count = await conn.execute(
                f"UPDATE {ACTIVE_TABLE} SET status = 'deleted' WHERE tab_id = ANY($1::int[])",
                tab_ids_to_delete
            )
        
        print(f"✅ 已软删除 {len(tab_ids_to_delete)} 条错误记录")
    else:
        print("\n" + "="*80)
        print("⚠️  试运行模式（不会实际删除数据）")
        print(f"   将删除 {len(error_items)} 条错误记录")
        print("   使用 --execute 参数来实际执行删除")
        print("="*80)

async def main():
    parser = argparse.ArgumentParser(description="清理 404 网站")
    parser.add_argument("--user-id", type=str, default=None, help="用户 ID（默认: 所有用户）")
    parser.add_argument("--execute", action="store_true", help="实际执行删除（默认: 试运行）")
    parser.add_argument("--max-check", type=int, default=None, help="最多检查数量（用于测试）")
    parser.add_argument("--timeout", type=int, default=5, help="请求超时时间（秒，默认: 5）")
    
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
    
    await cleanup_404_items(
        user_id=args.user_id,
        dry_run=not args.execute,
        max_check=args.max_check,
        timeout=args.timeout,
    )
    await close_pool()

if __name__ == "__main__":
    asyncio.run(main())






