"""
测试三阶段漏斗搜索系统
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

# 添加当前目录到路径
sys.path.insert(0, str(Path(__file__).parent))

load_dotenv()

from search.funnel_search import search_with_funnel
from search.threshold_filter import FilterMode


async def test_funnel_search():
    """测试三阶段漏斗搜索"""
    print("=" * 60)
    print("测试三阶段漏斗搜索系统")
    print("=" * 60)
    
    # 测试用例
    test_cases = [
        {
            "name": "测试1: 简单文本查询",
            "query": "蓝色",
            "user_id": None,  # 测试所有用户
            "filter_mode": FilterMode.BALANCED,
        },
        {
            "name": "测试2: 复杂查询（颜色+物体）",
            "query": "蓝色椅子",
            "user_id": None,
            "filter_mode": FilterMode.BALANCED,
        },
        {
            "name": "测试3: 严格模式",
            "query": "设计",
            "user_id": None,
            "filter_mode": FilterMode.STRICT,
        },
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'='*60}")
        print(f"{test_case['name']}")
        print(f"{'='*60}")
        print(f"查询: {test_case['query']}")
        print(f"用户ID: {test_case['user_id'] or '所有用户'}")
        print(f"过滤模式: {test_case['filter_mode'].value}")
        print()
        
        try:
            results = await search_with_funnel(
                user_id=test_case["user_id"],
                query_text=test_case["query"],
                filter_mode=test_case["filter_mode"],
                max_results=20,
                use_caption=True,
            )
            
            print(f"✅ 搜索成功！")
            print(f"   返回结果数: {len(results)}")
            
            if results:
                print(f"\n   前 5 个结果:")
                for idx, item in enumerate(results[:5], 1):
                    similarity = item.get("similarity", 0.0)
                    quality = item.get("quality", "unknown")
                    title = item.get("title", "N/A")[:40]
                    url = item.get("url", "")[:50]
                    recall_paths = item.get("recall_paths", [])
                    
                    print(f"   {idx}. {title}")
                    print(f"      相似度: {similarity:.4f}, 质量: {quality}")
                    print(f"      召回路径: {', '.join(recall_paths)}")
                    print(f"      URL: {url}...")
                    print()
            else:
                print("   ⚠️  没有找到结果")
        
        except Exception as e:
            print(f"❌ 测试失败: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
        
        print()
    
    print("=" * 60)
    print("测试完成")
    print("=" * 60)


async def test_threshold_filter():
    """测试动态阈值过滤"""
    print("\n" + "=" * 60)
    print("测试动态阈值过滤")
    print("=" * 60)
    
    # 模拟搜索结果（不同相似度分数）
    mock_results = [
        {"url": f"url_{i}", "title": f"Item {i}", "similarity": 0.9 - i * 0.1}
        for i in range(10)
    ]
    
    from search.threshold_filter import filter_by_threshold, get_filter_stats
    
    for mode in [FilterMode.STRICT, FilterMode.BALANCED, FilterMode.RELAXED]:
        print(f"\n过滤模式: {mode.value}")
        filtered = filter_by_threshold(mock_results, mode=mode, max_results=20)
        stats = get_filter_stats(mock_results, mode=mode)
        
        print(f"  原始结果数: {len(mock_results)}")
        print(f"  过滤后结果数: {len(filtered)}")
        print(f"  统计信息: {stats}")
        
        if filtered:
            print(f"  前 3 个结果:")
            for item in filtered[:3]:
                print(f"    - {item.get('title')}: {item.get('similarity'):.4f} ({item.get('quality')})")


async def main():
    """主测试函数"""
    try:
        # 测试动态阈值过滤
        await test_threshold_filter()
        
        # 测试三阶段漏斗搜索
        await test_funnel_search()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断测试")
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        # 关闭数据库连接池
        try:
            from vector_db import close_pool
            await close_pool()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())

