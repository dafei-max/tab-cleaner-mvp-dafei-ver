"""
Caption 生成模块
集成 Qwen-VL 客户端，实现图片 Caption 生成和视觉属性提取
"""
from __future__ import annotations

import asyncio
from typing import Optional, Dict, List, Any
from io import BytesIO
from PIL import Image
import numpy as np
from sklearn.cluster import KMeans

from .qwen_vl_client import QwenVLClient
from .preprocess import download_image, process_image
from .config import BATCH_SIZE


# 颜色名称映射（RGB 到颜色名称）
COLOR_NAMES = {
    # 蓝色系
    (0, 0, 255): "blue",
    (0, 100, 200): "blue",
    (30, 144, 255): "dodgerblue",
    (70, 130, 180): "steelblue",
    (135, 206, 250): "lightskyblue",
    (173, 216, 230): "lightblue",
    
    # 红色系
    (255, 0, 0): "red",
    (220, 20, 60): "crimson",
    (178, 34, 34): "firebrick",
    (255, 99, 71): "tomato",
    (255, 160, 122): "lightsalmon",
    
    # 绿色系
    (0, 255, 0): "green",
    (0, 128, 0): "green",
    (34, 139, 34): "forestgreen",
    (50, 205, 50): "limegreen",
    (144, 238, 144): "lightgreen",
    (152, 251, 152): "palegreen",
    
    # 黄色系
    (255, 255, 0): "yellow",
    (255, 215, 0): "gold",
    (255, 165, 0): "orange",
    (255, 140, 0): "darkorange",
    (255, 218, 185): "peachpuff",
    
    # 黑色/灰色系
    (0, 0, 0): "black",
    (128, 128, 128): "gray",
    (169, 169, 169): "darkgray",
    (192, 192, 192): "silver",
    (211, 211, 211): "lightgray",
    
    # 白色系
    (255, 255, 255): "white",
    (245, 245, 245): "whitesmoke",
    (250, 250, 250): "snow",
    
    # 紫色系
    (128, 0, 128): "purple",
    (138, 43, 226): "blueviolet",
    (147, 112, 219): "mediumpurple",
    (186, 85, 211): "mediumorchid",
    
    # 粉色系
    (255, 192, 203): "pink",
    (255, 20, 147): "deeppink",
    (255, 105, 180): "hotpink",
    (255, 182, 193): "lightpink",
    
    # 棕色系
    (165, 42, 42): "brown",
    (139, 69, 19): "saddlebrown",
    (160, 82, 45): "sienna",
    (210, 180, 140): "tan",
}


def rgb_to_color_name(rgb: tuple) -> str:
    """
    将 RGB 值转换为颜色名称
    
    Args:
        rgb: (R, G, B) 元组，值范围 0-255
    
    Returns:
        颜色名称（英文）
    """
    # 计算与所有已知颜色的欧氏距离
    min_dist = float('inf')
    closest_color = "unknown"
    
    for known_rgb, color_name in COLOR_NAMES.items():
        dist = sum((a - b) ** 2 for a, b in zip(rgb, known_rgb)) ** 0.5
        if dist < min_dist:
            min_dist = dist
            closest_color = color_name
    
    # 如果距离太远，根据 RGB 值推断
    if min_dist > 100:
        r, g, b = rgb
        if r > 200 and g > 200 and b > 200:
            return "white"
        elif r < 50 and g < 50 and b < 50:
            return "black"
        elif r > g and r > b:
            return "red" if r > 150 else "brown"
        elif g > r and g > b:
            return "green" if g > 150 else "olive"
        elif b > r and b > g:
            return "blue" if b > 150 else "navy"
        elif r > 200 and g > 150 and b < 100:
            return "yellow"
        elif r > 200 and g < 150 and b < 100:
            return "orange"
        elif r > 200 and g < 150 and b > 150:
            return "pink"
        else:
            return "gray"
    
    return closest_color


def extract_colors_kmeans(image_data: bytes, n_colors: int = 3) -> List[str]:
    """
    使用 K-Means 提取图片的主要颜色
    
    Args:
        image_data: 图片二进制数据
        n_colors: 提取的颜色数量（默认 3）
    
    Returns:
        颜色名称列表（英文）
    """
    try:
        # 打开图片
        img = Image.open(BytesIO(image_data))
        
        # 转换为 RGB
        if img.mode != "RGB":
            img = img.convert("RGB")
        
        # 缩小图片以加快处理（采样）
        img.thumbnail((200, 200), Image.Resampling.LANCZOS)
        
        # 转换为 numpy 数组
        img_array = np.array(img)
        pixels = img_array.reshape(-1, 3)
        
        # 使用 K-Means 聚类
        kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=10)
        kmeans.fit(pixels)
        
        # 获取聚类中心（主要颜色）
        colors = kmeans.cluster_centers_.astype(int)
        
        # 转换为颜色名称
        color_names = [rgb_to_color_name(tuple(color)) for color in colors]
        
        # 去重并保持顺序
        seen = set()
        unique_colors = []
        for color in color_names:
            if color not in seen:
                seen.add(color)
                unique_colors.append(color)
        
        return unique_colors[:n_colors]
        
    except Exception as e:
        print(f"[Caption] ERROR extracting colors with K-Means: {type(e).__name__}: {str(e)}")
        return []


def extract_style_tags_from_caption(caption: str) -> List[str]:
    """
    从 Caption 中提取风格标签（规则式）
    
    Args:
        caption: 图片描述文本
    
    Returns:
        风格标签列表
    """
    caption_lower = caption.lower()
    style_tags = []
    
    # 风格关键词映射
    style_keywords = {
        "modern": ["modern", "contemporary", "sleek", "sleek design"],
        "minimalist": ["minimalist", "minimal", "simple", "clean", "clean design"],
        "vintage": ["vintage", "retro", "classic", "antique", "old style"],
        "industrial": ["industrial", "loft", "rustic", "raw", "exposed"],
        "scandinavian": ["scandinavian", "nordic", "hygge", "scandi"],
        "japanese": ["japanese", "zen", "muji", "wabi-sabi", "japan style"],
        "luxury": ["luxury", "luxurious", "premium", "high-end", "elegant"],
        "casual": ["casual", "relaxed", "comfortable", "informal"],
        "bohemian": ["bohemian", "boho", "eclectic", "free-spirited"],
        "art-deco": ["art deco", "art-deco", "deco style"],
        "mid-century": ["mid-century", "mid century", "midcentury"],
    }
    
    for style, keywords in style_keywords.items():
        if any(keyword in caption_lower for keyword in keywords):
            style_tags.append(style)
    
    return style_tags


def extract_object_tags_from_caption(caption: str) -> List[str]:
    """
    从 Caption 中提取物体标签（规则式）
    
    Args:
        caption: 图片描述文本
    
    Returns:
        物体标签列表
    """
    caption_lower = caption.lower()
    object_tags = []
    
    # 常见物体关键词
    object_keywords = [
        "chair", "table", "sofa", "bed", "desk", "shelf", "cabinet",
        "lamp", "light", "plant", "tree", "flower", "vase",
        "mirror", "rug", "carpet", "pillow", "curtain", "window",
        "painting", "art", "sculpture", "decoration", "accessory",
        "kitchen", "bathroom", "bedroom", "living room", "dining",
        "wall", "floor", "ceiling", "door", "frame",
    ]
    
    for keyword in object_keywords:
        if keyword in caption_lower:
            object_tags.append(keyword)
    
    return object_tags


async def enrich_item_with_caption(
    item: Dict[str, Any],
    qwen_client: Optional[QwenVLClient] = None,
    use_kmeans_colors: bool = True,
) -> Dict[str, Any]:
    """
    为单个 OpenGraph 项生成 Caption 和视觉属性
    
    Args:
        item: OpenGraph 数据项
        qwen_client: QwenVLClient 实例（如果为 None 则创建新实例）
        use_kmeans_colors: 是否使用 K-Means 提取颜色（更准确）
    
    Returns:
        增强后的项（添加 caption, dominant_colors, style_tags, object_tags 字段）
    """
    if qwen_client is None:
        qwen_client = QwenVLClient()
    
    # 获取图片
    image_url_or_base64 = item.get("image")
    if not image_url_or_base64:
        print(f"[Caption] No image found for item: {item.get('url', 'unknown')}")
        return item
    
    # 下载图片（如果需要）
    image_data = None
    if image_url_or_base64.startswith("http://") or image_url_or_base64.startswith("https://"):
        image_data = await download_image(image_url_or_base64)
        if not image_data:
            print(f"[Caption] Failed to download image: {image_url_or_base64[:60]}...")
            return item
        # 转换为 Base64
        img_b64 = process_image(image_data)
        if not img_b64:
            print(f"[Caption] Failed to process image")
            return item
    elif image_url_or_base64.startswith("data:image"):
        img_b64 = image_url_or_base64
        # 提取 Base64 数据用于 K-Means
        if use_kmeans_colors:
            try:
                import base64
                # 提取 Base64 部分（去掉 data:image/jpeg;base64, 前缀）
                if "," in img_b64:
                    base64_data = img_b64.split(",", 1)[1]
                else:
                    base64_data = img_b64
                image_data = base64.b64decode(base64_data)
            except Exception as e:
                print(f"[Caption] WARNING: Failed to decode Base64 for K-Means: {e}")
                image_data = None
    else:
        print(f"[Caption] Invalid image format: {image_url_or_base64[:60]}...")
        return item
    
    # 调用 Qwen-VL 生成 Caption
    qwen_result = await qwen_client.generate_caption(
        img_b64,
        include_attributes=True,
    )
    
    if not qwen_result:
        print(f"[Caption] Failed to generate caption for item: {item.get('url', 'unknown')}")
        return item
    
    # 提取颜色（优先使用 K-Means，更准确）
    dominant_colors = []
    if use_kmeans_colors and image_data:
        kmeans_colors = extract_colors_kmeans(image_data, n_colors=3)
        if kmeans_colors:
            dominant_colors = kmeans_colors
            print(f"[Caption] K-Means extracted colors: {dominant_colors}")
    
    # 如果 K-Means 失败，使用 Qwen-VL 的结果
    if not dominant_colors:
        dominant_colors = qwen_result.get("dominant_colors", [])
    
    # 合并风格标签（Qwen-VL + 规则式）
    style_tags = qwen_result.get("style_tags", [])
    rule_based_styles = extract_style_tags_from_caption(qwen_result.get("caption", ""))
    # 去重
    all_styles = list(set(style_tags + rule_based_styles))
    
    # 合并物体标签（Qwen-VL + 规则式）
    object_tags = qwen_result.get("object_tags", [])
    rule_based_objects = extract_object_tags_from_caption(qwen_result.get("caption", ""))
    # 去重
    all_objects = list(set(object_tags + rule_based_objects))
    
    # ✅ 生成 Caption 的 text embedding（用于提高搜索准确率）
    caption_embedding = None
    caption_text = qwen_result.get("caption", "")
    if caption_text:
        try:
            from .embed import embed_text
            caption_embedding = await embed_text(caption_text)
            if caption_embedding:
                print(f"[Caption] Generated caption embedding: {len(caption_embedding)} dims")
        except Exception as e:
            print(f"[Caption] WARNING: Failed to generate caption embedding: {e}")
            import traceback
            traceback.print_exc()
    
    # 更新项
    enriched_item = {
        **item,
        "caption": caption_text,
        "image_caption": caption_text,  # 同时保存为 image_caption（数据库字段名）
        "caption_embedding": caption_embedding,  # ✅ 新增：Caption 的 text vector
        "dominant_colors": dominant_colors,
        "style_tags": all_styles,
        "object_tags": all_objects,
    }
    
    print(f"[Caption] Enriched item: {item.get('url', 'unknown')[:50]}...")
    print(f"  - Caption: {caption_text[:50]}...")
    print(f"  - Colors: {dominant_colors}")
    print(f"  - Styles: {all_styles}")
    print(f"  - Objects: {all_objects}")
    print(f"  - Caption Embedding: {'Generated' if caption_embedding else 'Failed'}")
    
    return enriched_item


async def batch_enrich_items(
    items: List[Dict[str, Any]],
    qwen_client: Optional[QwenVLClient] = None,
    use_kmeans_colors: bool = True,
    concurrent: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    批量生成 Caption（支持并发）
    
    Args:
        items: OpenGraph 数据项列表
        qwen_client: QwenVLClient 实例（如果为 None 则创建新实例）
        use_kmeans_colors: 是否使用 K-Means 提取颜色
        concurrent: 并发数量（如果为 None，使用 BATCH_SIZE）
    
    Returns:
        增强后的项列表（与输入顺序对应）
    """
    if not items:
        return []
    
    if qwen_client is None:
        qwen_client = QwenVLClient()
    
    # 使用信号量控制并发数
    concurrent_limit = concurrent or BATCH_SIZE
    semaphore = asyncio.Semaphore(concurrent_limit)
    
    async def process_one(item: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            return await enrich_item_with_caption(item, qwen_client, use_kmeans_colors)
    
    # 并发处理
    tasks = [process_one(item) for item in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 处理异常
    final_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"[Caption] Exception processing item {i}: {type(result).__name__}: {str(result)}")
            final_results.append(items[i])  # 返回原始项
        else:
            final_results.append(result)
    
    return final_results

