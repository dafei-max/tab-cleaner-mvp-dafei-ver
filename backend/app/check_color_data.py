"""
检查数据库中的颜色数据
查看实际存储的颜色信息
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

from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id


async def check_color_data(user_id: str = "device_1764658383255_28u4om0xg"):
    """
    检查数据库中的颜色数据
    
    Args:
        user_id: 用户 ID
    """
    print("=" * 80)
    print(f"🔍 检查用户 '{user_id}' 的颜色数据")
    print("=" * 80)
    
    try:
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        async with pool.acquire() as conn:
            # 先检查字段是否存在
            has_hex_field = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'cleantab'
                      AND table_name = 'opengraph_items_v2'
                      AND column_name = 'dominant_colors_hex'
                );
            """)
            
            # 根据字段是否存在构建查询
            if has_hex_field:
                query = f"""
                    SELECT 
                        url,
                        title,
                        dominant_colors,
                        dominant_colors_hex,
                        image_caption
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1
                      AND status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 20
                """
            else:
                query = f"""
                    SELECT 
                        url,
                        title,
                        dominant_colors,
                        NULL::TEXT[] as dominant_colors_hex,
                        image_caption
                    FROM {ACTIVE_TABLE}
                    WHERE user_id = $1
                      AND status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 20
                """
            
            rows = await conn.fetch(query, normalized_user)
            
            print(f"\n📊 找到 {len(rows)} 条记录\n")
            
            yellow_count = 0
            has_hex_count = 0
            
            for i, row in enumerate(rows, 1):
                url = row['url']
                title = row['title'] or 'N/A'
                dominant_colors = row['dominant_colors'] or []
                dominant_colors_hex = row['dominant_colors_hex'] or []
                caption = row['image_caption'] or ''
                
                print(f"{i}. {title[:60]}")
                print(f"   URL: {url[:70]}...")
                
                # 显示颜色名称
                if dominant_colors:
                    print(f"   颜色名称: {dominant_colors}")
                    # 检查是否包含黄色
                    yellow_keywords = ['yellow', 'gold', 'amber', 'lemon', 'golden']
                    has_yellow = any(
                        any(kw in str(color).lower() for kw in yellow_keywords)
                        for color in dominant_colors
                    )
                    if has_yellow:
                        print(f"   ✅ 包含黄色相关颜色")
                        yellow_count += 1
                else:
                    print(f"   颜色名称: 无")
                
                # 显示Hex颜色
                if dominant_colors_hex:
                    print(f"   颜色Hex: {dominant_colors_hex}")
                    has_hex_count += 1
                else:
                    print(f"   颜色Hex: 无")
                
                # 显示Caption（如果包含黄色相关词汇）
                if caption:
                    caption_lower = caption.lower()
                    yellow_in_caption = any(
                        kw in caption_lower 
                        for kw in ['yellow', 'gold', 'amber', 'lemon', 'golden', '黄色']
                    )
                    if yellow_in_caption:
                        print(f"   📝 Caption包含黄色: {caption[:80]}...")
                
                print()
            
            print("=" * 80)
            print(f"📈 统计信息:")
            print(f"  总记录数: {len(rows)}")
            print(f"  包含黄色相关颜色的记录: {yellow_count}")
            print(f"  有Hex颜色数据的记录: {has_hex_count}")
            print(f"  黄色占比: {yellow_count/len(rows)*100:.1f}%")
            print("=" * 80)
            
    except Exception as e:
        print(f"\n❌ 查询失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        from vector_db import close_pool
        await close_pool()


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="检查数据库中的颜色数据")
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
    
    await check_color_data(user_id=args.user_id)


if __name__ == "__main__":
    asyncio.run(main())

