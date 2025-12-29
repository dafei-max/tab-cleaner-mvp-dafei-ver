"""
测试搜索功能脚本
用于验证三阶段漏斗搜索是否正常工作
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from search.funnel_search import search_with_funnel
from search.threshold_filter import FilterMode


async def test_search(query: str, user_id: str = "anonymous"):
    """
    测试搜索功能
    
    Args:
        query: 查询文本
        user_id: 用户 ID
    """
    print("=" * 60)
    print(f"测试搜索: '{query}'")
    print("=" * 60)
    
    try:
        # 调用漏斗搜索
        results = await search_with_funnel(
            user_id=user_id,
            query_text=query,
            filter_mode=FilterMode.BALANCED,
            max_results=20,
            use_caption=True,
        )
        
        print(f"\n搜索结果数量: {len(results)}")
        
        if results:
            print("\n前 5 个结果:")
            for i, item in enumerate(results[:5], 1):
                print(f"\n{i}. {item.get('title', 'N/A')[:50]}")
                print(f"   URL: {item.get('url', 'N/A')[:60]}...")
                print(f"   相似度: {item.get('similarity', 0.0):.4f}")
                print(f"   质量: {item.get('quality', 'N/A')}")
                print(f"   视觉匹配: {item.get('visual_match', False)}")
                if item.get('recall_paths'):
                    print(f"   召回路径: {', '.join(item.get('recall_paths', []))}")
        else:
            print("\n未找到结果")
        
        print("\n" + "=" * 60)
        return results
        
    except Exception as e:
        print(f"\n❌ 搜索失败: {e}")
        import traceback
        traceback.print_exc()
        return []


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="测试搜索功能")
    parser.add_argument(
        "--user-id",
        type=str,
        default="anonymous",
        help="用户 ID（默认: anonymous）"
    )
    
    args = parser.parse_args()
    
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    print("数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - User ID: {args.user_id}")
    print()
    
    # 测试用例
    test_queries = [
        "蓝色设计",
        "modern furniture",
        "minimalist",
        "chair",
        "红色",
    ]
    
    for query in test_queries:
        await test_search(query, user_id=args.user_id)
        print("\n" + "-" * 60 + "\n")
        await asyncio.sleep(1)  # 避免 API 限流
    
    # 关闭数据库连接池
    from vector_db import close_pool
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

