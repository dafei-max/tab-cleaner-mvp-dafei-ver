"""
测试 AI 意图增强功能
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from search.ai_intent_enhance import hybrid_intent_detection, validate_search_results_with_ai


async def test_ai_intent_enhancement():
    """测试 AI 意图增强"""
    print("=" * 80)
    print("🧪 测试 AI 意图增强功能")
    print("=" * 80)
    
    test_queries = [
        "绿色植物",
        "简约设计",
        "蓝色椅子",
        "现代风格",
        "红色背景",
    ]
    
    for query in test_queries:
        print(f"\n{'=' * 80}")
        print(f"📝 测试查询: {query}")
        print(f"{'=' * 80}")
        
        try:
            result = await hybrid_intent_detection(
                query,
                use_ai=True,
                ai_timeout=5.0,  # 5秒超时
                cache={}
            )
            
            print(f"\n✅ 结果:")
            print(f"  原始查询: {result['original_query']}")
            print(f"  增强查询: {result['enhanced_query']}")
            print(f"  查询类型: {result['query_type']}")
            print(f"  AI增强: {result.get('ai_enhanced', False)}")
            print(f"  规则式: {result.get('rule_based', False)}")
            
            # 显示思维链（如果有）
            thinking_chain = result.get('thinking_chain', {})
            if thinking_chain:
                print(f"\n  思维链:")
                print(f"    用户意图: {thinking_chain.get('user_intent', 'N/A')}")
                print(f"    使用场景: {thinking_chain.get('use_case', 'N/A')}")
                print(f"    隐含需求: {thinking_chain.get('implicit_needs', 'N/A')}")
            
            # 显示相关词条（新格式）
            related_keywords = result.get('related_keywords', [])
            if related_keywords:
                print(f"\n  相关词条 ({len(related_keywords)}个):")
                for i, kw in enumerate(related_keywords, 1):
                    print(f"    {i}. {kw}")
            
            extracted = result.get('extracted_info', {})
            print(f"\n  提取信息:")
            print(f"    颜色: {extracted.get('colors', [])}")
            print(f"    物体: {extracted.get('objects', [])}")
            print(f"    风格: {extracted.get('styles', [])}")
            print(f"    概念: {extracted.get('concepts', [])}")
            
            suggestions = result.get('search_suggestions', {})
            print(f"\n  搜索建议:")
            print(f"    优先网站: {suggestions.get('prioritize_sites', [])}")
            print(f"    过滤类型: {suggestions.get('filter_types', [])}")
            print(f"    相似度阈值: {suggestions.get('similarity_threshold', 0.3)}")
            
        except Exception as e:
            print(f"\n❌ 错误: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n{'=' * 80}")
    print("✅ 测试完成")
    print("=" * 80)


async def test_result_validation():
    """测试搜索结果验证"""
    print("\n" + "=" * 80)
    print("🧪 测试搜索结果验证功能")
    print("=" * 80)
    
    # 模拟搜索结果
    mock_results = [
        {
            "title": "绿色植物室内设计",
            "url": "https://pinterest.com/pin/123",
            "similarity": 0.85,
            "site_name": "Pinterest",
            "description": "美丽的绿色植物室内装饰",
            "dominant_colors": ["green"],
            "object_tags": ["plant", "tree"],
            "style_tags": ["modern"],
        },
        {
            "title": "React API 文档",
            "url": "https://react.dev/docs",
            "similarity": 0.65,
            "site_name": "React",
            "description": "React 官方文档",
            "dominant_colors": [],
            "object_tags": [],
            "style_tags": [],
        },
        {
            "title": "红色背景设计",
            "url": "https://behance.net/project/456",
            "similarity": 0.70,
            "site_name": "Behance",
            "description": "红色背景的创意设计",
            "dominant_colors": ["red"],
            "object_tags": ["background"],
            "style_tags": ["creative"],
        },
    ]
    
    query = "绿色植物"
    
    print(f"\n查询: {query}")
    print(f"结果数量: {len(mock_results)}")
    
    try:
        validation = await validate_search_results_with_ai(
            query,
            mock_results,
            top_n=3
        )
        
        print(f"\n✅ 验证结果:")
        print(f"  AI验证: {validation.get('ai_validated', False)}")
        print(f"  相关结果索引: {validation.get('relevant_indices', [])}")
        print(f"  过滤结果索引: {validation.get('filter_out_indices', [])}")
        print(f"  提升优先级索引: {validation.get('boost_indices', [])}")
        
        # 显示验证后的结果
        print(f"\n  验证后的结果:")
        for idx in validation.get('relevant_indices', []):
            if 0 <= idx < len(mock_results):
                item = mock_results[idx]
                print(f"    ✅ [{idx}] {item['title']} (相似度: {item['similarity']:.3f})")
        
        for idx in validation.get('filter_out_indices', []):
            if 0 <= idx < len(mock_results):
                item = mock_results[idx]
                print(f"    ❌ [{idx}] {item['title']} (被过滤)")
        
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"\n{'=' * 80}")
    print("✅ 测试完成")
    print("=" * 80)


async def main():
    """主函数"""
    await test_ai_intent_enhancement()
    await test_result_validation()


if __name__ == "__main__":
    asyncio.run(main())

