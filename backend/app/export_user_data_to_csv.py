#!/usr/bin/env python3
"""
导出指定用户在阿里云 AnalyticDB PostgreSQL 中的数据为 CSV 文件

用法:
    python export_user_data_to_csv.py --user-id <user_id> [--output <output_file.csv>]

示例:
    python export_user_data_to_csv.py --user-id device_1764658383255_28u4om0xg
    python export_user_data_to_csv.py --user-id anonymous --output my_data.csv
"""
import asyncio
import csv
import json
import os
import sys
import argparse
from datetime import datetime
from typing import List, Dict, Any

# 添加当前目录到路径，以便导入 vector_db
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vector_db import (
    get_pool,
    close_pool,
    _normalize_user_id,
    ACTIVE_TABLE,
    NAMESPACE,
    ACTIVE_TABLE_NAME,
)


def format_vector(vec: Any, max_dims: int = 10) -> str:
    """
    格式化向量字段为字符串
    如果向量太长，只显示前几个维度
    """
    if vec is None:
        return ""
    if isinstance(vec, list):
        if len(vec) > max_dims:
            return f"[{','.join(str(round(x, 4)) for x in vec[:max_dims])}...] ({len(vec)} dims)"
        return f"[{','.join(str(round(x, 4)) for x in vec)}]"
    return str(vec)


def format_array(arr: Any) -> str:
    """格式化数组字段为字符串"""
    if arr is None:
        return ""
    if isinstance(arr, list):
        return ",".join(str(x) for x in arr)
    return str(arr)


def format_json(obj: Any) -> str:
    """格式化 JSON 字段为字符串"""
    if obj is None:
        return ""
    if isinstance(obj, str):
        try:
            # 如果已经是 JSON 字符串，尝试格式化
            parsed = json.loads(obj)
            return json.dumps(parsed, ensure_ascii=False, indent=None)
        except:
            return obj
    return json.dumps(obj, ensure_ascii=False, indent=None)


async def export_user_data_to_csv(
    user_id: str,
    output_file: str = None,
    include_embeddings: bool = False,
) -> str:
    """
    导出指定用户的数据为 CSV 文件

    Args:
        user_id: 用户 ID
        output_file: 输出文件路径（如果为 None，自动生成）
        include_embeddings: 是否包含 embedding 向量（默认 False，因为向量很大）

    Returns:
        输出文件路径
    """
    normalized_user = _normalize_user_id(user_id)
    
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_user_id = normalized_user.replace("/", "_").replace("\\", "_")[:50]
        output_file = f"user_data_{safe_user_id}_{timestamp}.csv"
    
    print(f"[Export] 开始导出用户数据: {normalized_user}")
    print(f"[Export] 输出文件: {output_file}")
    
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        # 查询用户的所有数据
        # 注意：即使不导出完整向量，也查询这些字段以检查是否存在
        query = f"""
            SELECT 
                user_id,
                url,
                title,
                description,
                image,
                screenshot_image,
                site_name,
                tab_id,
                tab_title,
                text_embedding,
                image_embedding,
                caption_embedding,
                metadata,
                image_caption,
                dominant_colors,
                style_tags,
                object_tags,
                status,
                deleted_at,
                created_at,
                updated_at
            FROM {ACTIVE_TABLE}
            WHERE user_id = $1
            ORDER BY created_at DESC
        """
        
        print(f"[Export] 执行查询...")
        rows = await conn.fetch(query, normalized_user)
        
        total_count = len(rows)
        print(f"[Export] 找到 {total_count} 条记录")
        
        if total_count == 0:
            print(f"[Export] ⚠️  用户 {normalized_user} 没有数据")
            return output_file
        
        # 准备 CSV 列名
        # 注意：无论是否包含完整向量，都导出 embedding 字段（显示维度信息或部分向量）
        fieldnames = [
            "user_id",
            "url",
            "title",
            "description",
            "image",
            "screenshot_image",
            "site_name",
            "tab_id",
            "tab_title",
            "text_embedding",
            "image_embedding",
            "caption_embedding",
            "metadata",
            "image_caption",
            "dominant_colors",
            "style_tags",
            "object_tags",
            "status",
            "deleted_at",
            "created_at",
            "updated_at",
        ]
        
        # 写入 CSV（添加 UTF-8 BOM 以解决 Excel 中文乱码问题）
        with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            
            for idx, row in enumerate(rows, 1):
                item = dict(row)
                
                # 处理向量字段
                text_emb = item.get("text_embedding")
                image_emb = item.get("image_embedding")
                caption_emb = item.get("caption_embedding")
                
                if include_embeddings:
                    # 导出完整向量（前10个维度 + 总维度信息）
                    item["text_embedding"] = format_vector(text_emb, max_dims=10)
                    item["image_embedding"] = format_vector(image_emb, max_dims=10)
                    item["caption_embedding"] = format_vector(caption_emb, max_dims=10)
                else:
                    # 只显示维度信息，不导出向量内容
                    item["text_embedding"] = f"vector({len(text_emb)})" if text_emb else ""
                    item["image_embedding"] = f"vector({len(image_emb)})" if image_emb else ""
                    item["caption_embedding"] = f"vector({len(caption_emb)})" if caption_emb else ""
                
                # 处理数组字段
                item["dominant_colors"] = format_array(item.get("dominant_colors"))
                item["style_tags"] = format_array(item.get("style_tags"))
                item["object_tags"] = format_array(item.get("object_tags"))
                
                # 处理 JSON 字段
                item["metadata"] = format_json(item.get("metadata"))
                
                # 处理时间字段
                for time_field in ["deleted_at", "created_at", "updated_at"]:
                    if item.get(time_field):
                        if isinstance(item[time_field], datetime):
                            item[time_field] = item[time_field].isoformat()
                
                # 确保所有字段都有值（即使是 None）
                for field in fieldnames:
                    if field not in item:
                        item[field] = ""
                    elif item[field] is None:
                        item[field] = ""
                
                writer.writerow(item)
                
                if idx % 100 == 0:
                    print(f"[Export] 已处理 {idx}/{total_count} 条记录...")
        
        print(f"[Export] ✅ 导出完成！")
        print(f"[Export] 文件: {os.path.abspath(output_file)}")
        print(f"[Export] 总记录数: {total_count}")
        
        # 显示统计信息
        stats = {
            "有标题": sum(1 for r in rows if r.get("title")),
            "有描述": sum(1 for r in rows if r.get("description")),
            "有图片": sum(1 for r in rows if r.get("image")),
            "有截图": sum(1 for r in rows if r.get("screenshot_image")),
            "有 Caption": sum(1 for r in rows if r.get("image_caption")),
            "有颜色标签": sum(1 for r in rows if r.get("dominant_colors")),
            "有风格标签": sum(1 for r in rows if r.get("style_tags")),
            "有物体标签": sum(1 for r in rows if r.get("object_tags")),
            "有 Text Embedding": sum(1 for r in rows if r.get("text_embedding")),
            "有 Image Embedding": sum(1 for r in rows if r.get("image_embedding")),
            "有 Caption Embedding": sum(1 for r in rows if r.get("caption_embedding")),
        }
        
        print(f"\n[Export] 数据统计:")
        for key, value in stats.items():
            print(f"  {key}: {value}/{total_count} ({value/total_count*100:.1f}%)")
        
        return output_file


async def list_all_users() -> List[str]:
    """列出数据库中所有有数据的用户 ID"""
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        query = f"""
            SELECT DISTINCT user_id, COUNT(*) as count
            FROM {ACTIVE_TABLE}
            WHERE status = 'active'
            GROUP BY user_id
            ORDER BY count DESC
        """
        rows = await conn.fetch(query)
        
        users = []
        for row in rows:
            users.append((row["user_id"], row["count"]))
        
        return users


async def main():
    parser = argparse.ArgumentParser(
        description="导出指定用户在阿里云 AnalyticDB PostgreSQL 中的数据为 CSV 文件"
    )
    parser.add_argument(
        "--user-id",
        type=str,
        required=True,
        help="用户 ID（例如: device_1764658383255_28u4om0xg 或 anonymous）",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="输出 CSV 文件路径（默认: user_data_{user_id}_{timestamp}.csv）",
    )
    parser.add_argument(
        "--include-embeddings",
        action="store_true",
        help="包含完整的 embedding 向量（默认: False，只显示维度信息）",
    )
    parser.add_argument(
        "--list-users",
        action="store_true",
        help="列出数据库中所有有数据的用户 ID",
    )
    
    args = parser.parse_args()
    
    try:
        if args.list_users:
            print("[Export] 查询所有用户...")
            users = await list_all_users()
            if not users:
                print("[Export] 数据库中没有数据")
            else:
                print(f"\n[Export] 找到 {len(users)} 个用户:\n")
                print(f"{'用户 ID':<50} {'记录数':<10}")
                print("-" * 60)
                for user_id, count in users:
                    print(f"{user_id:<50} {count:<10}")
            return
        
        output_file = await export_user_data_to_csv(
            user_id=args.user_id,
            output_file=args.output,
            include_embeddings=args.include_embeddings,
        )
        
        print(f"\n✅ 导出成功！文件保存在: {os.path.abspath(output_file)}")
        
    except Exception as e:
        print(f"[Export] ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

