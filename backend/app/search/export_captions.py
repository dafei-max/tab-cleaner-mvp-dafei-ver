"""
导出数据库中的 Caption 数据，用于质量对比
"""
import asyncio
import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))


async def export_captions(user_id: str, max_items: int = 100, output_format: str = "json"):
    """
    导出用户的 Caption 数据
    
    Args:
        user_id: 用户 ID
        max_items: 最多导出数量
        output_format: 输出格式 (json, csv)
    """
    from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id, _row_to_dict, close_pool
    
    print("=" * 60)
    print("导出 Caption 数据")
    print("=" * 60)
    
    pool = await get_pool()
    user_id = _normalize_user_id(user_id)
    
    print(f"[Export] 用户 ID: {user_id}")
    print(f"[Export] 最多导出: {max_items} 条")
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT 
                url, title, description, image, site_name,
                image_caption, dominant_colors, style_tags, object_tags,
                created_at, updated_at
            FROM {ACTIVE_TABLE}
            WHERE user_id = $1 
              AND status = 'active'
            ORDER BY created_at DESC
            LIMIT $2
        """, user_id, max_items)
        
        items = [_row_to_dict(row) for row in rows]
    
    print(f"[Export] 获取到 {len(items)} 条数据")
    
    # 统计
    with_caption = sum(1 for item in items if item.get("image_caption"))
    with_colors = sum(1 for item in items if item.get("dominant_colors"))
    with_styles = sum(1 for item in items if item.get("style_tags"))
    with_objects = sum(1 for item in items if item.get("object_tags"))
    
    print(f"\n[Export] 统计:")
    print(f"  - 有 Caption: {with_caption}/{len(items)} ({with_caption/len(items)*100:.1f}%)")
    print(f"  - 有颜色标签: {with_colors}/{len(items)} ({with_colors/len(items)*100:.1f}%)")
    print(f"  - 有风格标签: {with_styles}/{len(items)} ({with_styles/len(items)*100:.1f}%)")
    print(f"  - 有物体标签: {with_objects}/{len(items)} ({with_objects/len(items)*100:.1f}%)")
    
    # 导出
    timestamp = int(time.time())
    
    if output_format == "json":
        output_file = f"captions_export_{user_id}_{timestamp}.json"
        
        # 清理数据（移除过大的 image 字段）
        export_data = []
        for item in items:
            export_item = {
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "site_name": item.get("site_name", ""),
                "image_caption": item.get("image_caption", ""),
                "dominant_colors": item.get("dominant_colors", []),
                "style_tags": item.get("style_tags", []),
                "object_tags": item.get("object_tags", []),
                "created_at": str(item.get("created_at", "")),
                "updated_at": str(item.get("updated_at", "")),
                # 图片 URL（如果是 http），否则标记为 base64
                "image_url": (item.get("image") or "")[:100] if (item.get("image") or "").startswith("http") else "[base64]",
            }
            export_data.append(export_item)
        
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "user_id": user_id,
                "total_items": len(items),
                "with_caption": with_caption,
                "with_colors": with_colors,
                "with_styles": with_styles,
                "with_objects": with_objects,
                "exported_at": timestamp,
                "items": export_data,
            }, f, ensure_ascii=False, indent=2)
        
        print(f"\n[Export] 已导出到: {output_file}")
    
    elif output_format == "csv":
        import csv
        output_file = f"captions_export_{user_id}_{timestamp}.csv"
        
        with open(output_file, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "url", "title", "description", "site_name",
                "image_caption", "dominant_colors", "style_tags", "object_tags"
            ])
            
            for item in items:
                writer.writerow([
                    item.get("url", ""),
                    item.get("title", ""),
                    item.get("description", ""),
                    item.get("site_name", ""),
                    item.get("image_caption", ""),
                    ",".join(item.get("dominant_colors", [])) if item.get("dominant_colors") else "",
                    ",".join(item.get("style_tags", [])) if item.get("style_tags") else "",
                    ",".join(item.get("object_tags", [])) if item.get("object_tags") else "",
                ])
        
        print(f"\n[Export] 已导出到: {output_file}")
    
    await close_pool()
    print("=" * 60)
    
    return items


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="导出 Caption 数据")
    parser.add_argument("--user-id", type=str, required=True, help="用户 ID")
    parser.add_argument("--max-items", type=int, default=100, help="最多导出数量")
    parser.add_argument("--format", type=str, default="json", choices=["json", "csv"], help="输出格式")
    args = parser.parse_args()
    
    asyncio.run(export_captions(args.user_id, args.max_items, args.format))

