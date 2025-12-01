"""
测试 Qwen-VL 客户端和 Caption 生成模块
"""
import asyncio
import os
from dotenv import load_dotenv
from search.qwen_vl_client import QwenVLClient
from search.caption import enrich_item_with_caption, batch_enrich_items

# 加载环境变量
load_dotenv()


async def test_single_caption():
    """测试单个图片 Caption 生成"""
    print("=" * 60)
    print("测试 1: 单个图片 Caption 生成")
    print("=" * 60)
    
    client = QwenVLClient()
    
    # 使用示例图片 URL（可以替换为实际图片）
    test_image_url = "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800"
    
    result = await client.generate_caption(
        test_image_url,
        include_attributes=True,
    )
    
    if result:
        print("\n✅ Caption 生成成功:")
        print(f"  Caption: {result.get('caption', 'N/A')}")
        print(f"  Colors: {result.get('dominant_colors', [])}")
        print(f"  Styles: {result.get('style_tags', [])}")
        print(f"  Objects: {result.get('object_tags', [])}")
    else:
        print("\n❌ Caption 生成失败")


async def test_enrich_item():
    """测试单个项增强"""
    print("\n" + "=" * 60)
    print("测试 2: 单个项增强（包含 K-Means 颜色提取）")
    print("=" * 60)
    
    test_item = {
        "url": "https://example.com/test",
        "title": "Test Item",
        "image": "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800",
    }
    
    enriched = await enrich_item_with_caption(
        test_item,
        use_kmeans_colors=True,
    )
    
    print("\n✅ 项增强成功:")
    print(f"  URL: {enriched.get('url', 'N/A')}")
    print(f"  Caption: {enriched.get('caption', 'N/A')}")
    print(f"  Colors (K-Means): {enriched.get('dominant_colors', [])}")
    print(f"  Styles: {enriched.get('style_tags', [])}")
    print(f"  Objects: {enriched.get('object_tags', [])}")


async def test_batch_enrich():
    """测试批量增强"""
    print("\n" + "=" * 60)
    print("测试 3: 批量增强（并发处理）")
    print("=" * 60)
    
    test_items = [
        {
            "url": "https://example.com/test1",
            "title": "Test Item 1",
            "image": "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800",
        },
        {
            "url": "https://example.com/test2",
            "title": "Test Item 2",
            "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800",
        },
    ]
    
    enriched_items = await batch_enrich_items(
        test_items,
        use_kmeans_colors=True,
    )
    
    print(f"\n✅ 批量增强完成: {len(enriched_items)} 项")
    for i, item in enumerate(enriched_items, 1):
        print(f"\n  项 {i}:")
        print(f"    Caption: {item.get('caption', 'N/A')[:50]}...")
        print(f"    Colors: {item.get('dominant_colors', [])}")
        print(f"    Styles: {item.get('style_tags', [])}")


async def main():
    """主函数"""
    # 检查 API Key
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        print("❌ 错误: 未找到 DASHSCOPE_API_KEY 环境变量")
        print("请在 .env 文件中设置 DASHSCOPE_API_KEY")
        return
    
    print(f"✅ API Key 已加载 (长度: {len(api_key)})")
    
    try:
        # 运行测试
        await test_single_caption()
        await test_enrich_item()
        await test_batch_enrich()
        
        print("\n" + "=" * 60)
        print("✅ 所有测试完成")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ 测试失败: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

