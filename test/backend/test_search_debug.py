"""
测试搜索并查看详细的相似度分数
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

from search.funnel_search import search_with_funnel
from search.config import MIN_SIMILARITY_THRESHOLD, IMAGE_EMBEDDING_THRESHOLD
from search.threshold_filter import FilterMode


async def test_search(user_id: str, query: str = "椅子"):
    """
    测试搜索并显示详细的相似度分数
    """
    print(f"🔍 测试搜索")
    print(f"用户ID: {user_id}")
    print(f"查询: {query}")
    print(f"阈值配置:")
    print(f"  MIN_SIMILARITY_THRESHOLD: {MIN_SIMILARITY_THRESHOLD}")
    print(f"  IMAGE_EMBEDDING_THRESHOLD: {IMAGE_EMBEDDING_THRESHOLD}")
    print()
    
    try:
        # 执行搜索
        results = await search_with_funnel(
            user_id=user_id,
            query_text=query,
            filter_mode=FilterMode.BALANCED,
            max_results=20,
            use_caption=True,
        )
        
        print(f"\n📊 搜索结果:")
        print(f"  总结果数: {len(results)}")
        
        if len(results) == 0:
            print(f"\n⚠️  没有结果！")
            print(f"  可能原因:")
            print(f"    1. 所有结果的相似度都低于阈值 {MIN_SIMILARITY_THRESHOLD}")
            print(f"    2. 查询 embedding 生成失败")
            print(f"    3. 数据没有匹配的 embedding")
        else:
            print(f"\n📋 结果详情（前10个）:")
            for i, item in enumerate(results[:10], 1):
                similarity = item.get("similarity", 0.0)
                url = item.get("url", "N/A")
                title = item.get("title", "N/A")
                recall_paths = item.get("recall_paths", [])
                
                print(f"  {i}. {url[:60]}...")
                print(f"     相似度: {similarity:.4f} (阈值: {MIN_SIMILARITY_THRESHOLD})")
                print(f"     标题: {title[:50] if title else 'N/A'}...")
                print(f"     召回路径: {recall_paths}")
                
                # 显示各种相似度分数
                if "text_embedding_similarity" in item:
                    print(f"     文本相似度: {item['text_embedding_similarity']:.4f}")
                if "image_embedding_similarity" in item:
                    print(f"     图像相似度: {item['image_embedding_similarity']:.4f}")
                if "caption_embedding_similarity" in item:
                    print(f"     Caption相似度: {item['caption_embedding_similarity']:.4f}")
                if "caption_rank" in item:
                    print(f"     Caption Rank: {item['caption_rank']:.4f}")
                print()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="测试搜索并查看详细分数")
    parser.add_argument("--user-id", type=str, required=True, help="用户ID")
    parser.add_argument("--query", type=str, default="椅子", help="查询文本")
    args = parser.parse_args()
    
    await test_search(args.user_id, args.query)


if __name__ == "__main__":
    asyncio.run(main())

