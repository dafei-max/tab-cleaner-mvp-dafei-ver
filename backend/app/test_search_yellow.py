"""
测试搜索"黄色"功能
验证颜色搜索和Hex颜色匹配是否正常工作
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


async def test_search_yellow(user_id: str = "device_1764658383255_28u4om0xg"):
    """
    测试搜索"黄色"功能
    
    Args:
        user_id: 用户 ID
    """
    print("=" * 80)
    print("🧪 测试搜索: '黄色'")
    print("=" * 80)
    
    try:
        # 调用漏斗搜索
        results = await search_with_funnel(
            user_id=user_id,
            query_text="黄色",
            filter_mode=FilterMode.BALANCED,
            max_results=20,
            use_caption=True,
        )
        
        print(f"\n📊 搜索结果数量: {len(results)}")
        
        if results:
            print("\n📋 前 10 个结果详情:")
            print("-" * 80)
            for i, item in enumerate(results[:10], 1):
                print(f"\n{i}. {item.get('title', 'N/A')[:60]}")
                print(f"   URL: {item.get('url', 'N/A')[:70]}...")
                print(f"   相似度: {item.get('similarity', 0.0):.4f}")
                print(f"   质量: {item.get('quality', 'N/A')}")
                print(f"   视觉匹配: {item.get('visual_match', False)}")
                
                # 显示颜色信息
                dominant_colors = item.get('dominant_colors', [])
                dominant_colors_hex = item.get('dominant_colors_hex', [])
                if dominant_colors:
                    print(f"   颜色名称: {dominant_colors}")
                if dominant_colors_hex:
                    print(f"   颜色Hex: {dominant_colors_hex}")
                
                # 检查是否包含黄色相关颜色（从 dominant_colors 或 Caption）
                has_yellow = False
                yellow_keywords = ['yellow', 'gold', 'amber', 'lemon', 'golden', '黄色', '金色', '金黄', '柠檬黄']
                
                # 检查 dominant_colors
                if dominant_colors:
                    for color in dominant_colors:
                        if any(kw in str(color).lower() for kw in yellow_keywords):
                            has_yellow = True
                            break
                
                # 如果 dominant_colors 中没有，检查 Caption
                if not has_yellow:
                    caption = (item.get('image_caption') or '').lower()
                    title = (item.get('title') or '').lower()
                    description = (item.get('description') or '').lower()
                    text_content = f"{title} {description} {caption}"
                    if any(kw in text_content for kw in yellow_keywords):
                        has_yellow = True
                        print(f"   ✅ Caption中包含黄色相关词汇")
                
                if has_yellow:
                    print(f"   ✅ 包含黄色相关颜色")
                else:
                    print(f"   ⚠️  未检测到黄色相关颜色")
                
                if item.get('recall_paths'):
                    print(f"   召回路径: {', '.join(item.get('recall_paths', []))}")
        else:
            print("\n❌ 未找到结果")
            print("\n可能的原因:")
            print("  1. 数据库中没有包含黄色的图片")
            print("  2. 颜色提取功能未正常工作")
            print("  3. 搜索匹配逻辑需要调整")
        
        # 统计信息
        if results:
            yellow_count = 0
            yellow_keywords = ['yellow', 'gold', 'amber', 'lemon', 'golden', '黄色', '金色', '金黄', '柠檬黄']
            for item in results:
                dominant_colors = item.get('dominant_colors', []) or []
                has_yellow = False
                
                # 检查 dominant_colors
                for color in dominant_colors:
                    if any(kw in str(color).lower() for kw in yellow_keywords):
                        has_yellow = True
                        break
                
                # 如果 dominant_colors 中没有，检查 Caption
                if not has_yellow:
                    caption = (item.get('image_caption') or '').lower()
                    title = (item.get('title') or '').lower()
                    description = (item.get('description') or '').lower()
                    text_content = f"{title} {description} {caption}"
                    if any(kw in text_content for kw in yellow_keywords):
                        has_yellow = True
                
                if has_yellow:
                    yellow_count += 1
            
            print("\n" + "=" * 80)
            print(f"📈 统计信息:")
            print(f"  总结果数: {len(results)}")
            print(f"  包含黄色相关颜色的结果: {yellow_count}")
            print(f"  黄色匹配率: {yellow_count/len(results)*100:.1f}%")
        
        print("\n" + "=" * 80)
        return results
        
    except Exception as e:
        print(f"\n❌ 搜索失败: {e}")
        import traceback
        traceback.print_exc()
        return []


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="测试搜索'黄色'功能")
    parser.add_argument(
        "--user-id",
        type=str,
        default="device_1764658383255_28u4om0xg",
        help="用户 ID（默认: device_1764658383255_28u4om0xg）"
    )
    
    args = parser.parse_args()
    
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    print("🔧 数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - User ID: {args.user_id}")
    print()
    
    # 测试搜索"黄色"
    await test_search_yellow(user_id=args.user_id)
    
    # 关闭数据库连接池
    from vector_db import close_pool
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

