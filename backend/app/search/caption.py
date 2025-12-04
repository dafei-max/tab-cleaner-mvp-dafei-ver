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
            # ✅ 改进：区分黄色和黄绿色，避免黄绿色被误识别为黄色
            # 黄色：R高，G中等，B低，且R/G比例 > 1.3（避免黄绿色）
            # 黄绿色：R和G都高，且R/G比例接近1
            if r / max(g, 1) > 1.3:  # R明显大于G，是黄色
                return "yellow"
            else:  # R和G接近，是黄绿色，应该归类为green
                return "green"
        elif r > 200 and g < 150 and b < 100:
            return "orange"
        elif r > 200 and g < 150 and b > 150:
            return "pink"
        else:
            return "gray"
    
    return closest_color


def rgb_to_hex(rgb: tuple) -> str:
    """
    将 RGB 值转换为 Hex 颜色代码
    
    Args:
        rgb: (R, G, B) 元组，值范围 0-255
    
    Returns:
        Hex 颜色代码（如 "#FFD700"）
    """
    r, g, b = rgb
    return f"#{r:02X}{g:02X}{b:02X}"


def hex_to_rgb(hex_color: str) -> tuple:
    """
    将 Hex 颜色代码转换为 RGB 值
    
    Args:
        hex_color: Hex 颜色代码（如 "#FFD700" 或 "FFD700"）
    
    Returns:
        (R, G, B) 元组，值范围 0-255
    """
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return (0, 0, 0)


def color_name_to_hex_range(color_name: str) -> List[str]:
    """
    将颜色名称转换为可能的 Hex 值范围（用于匹配）
    
    Args:
        color_name: 颜色名称（如 "yellow", "red"）
    
    Returns:
        可能的 Hex 值列表
    """
    color_name_lower = color_name.lower()
    hex_colors = []
    
    # 遍历所有已知颜色，找到匹配的颜色名称
    for rgb, name in COLOR_NAMES.items():
        if name.lower() == color_name_lower:
            hex_colors.append(rgb_to_hex(rgb))
    
    # 如果没有找到，根据颜色名称推断
    if not hex_colors:
        if color_name_lower == "yellow":
            hex_colors = ["#FFFF00", "#FFD700", "#FFA500"]
        elif color_name_lower == "red":
            hex_colors = ["#FF0000", "#DC143C", "#B22222"]
        elif color_name_lower == "blue":
            hex_colors = ["#0000FF", "#0064C8", "#1E90FF"]
        elif color_name_lower == "green":
            hex_colors = ["#00FF00", "#008000", "#228B22"]
        elif color_name_lower == "white":
            hex_colors = ["#FFFFFF", "#F5F5F5", "#FAFAFA"]
        elif color_name_lower == "black":
            hex_colors = ["#000000", "#1A1A1A", "#2F2F2F"]
        elif color_name_lower == "gray" or color_name_lower == "grey":
            hex_colors = ["#808080", "#A9A9A9", "#C0C0C0"]
        elif color_name_lower == "purple":
            hex_colors = ["#800080", "#8A2BE2", "#9370DB"]
        elif color_name_lower == "pink":
            hex_colors = ["#FFC0CB", "#FF1493", "#FF69B4"]
        elif color_name_lower == "orange":
            hex_colors = ["#FFA500", "#FF8C00", "#FF7F50"]
        elif color_name_lower == "brown":
            hex_colors = ["#A52A2A", "#8B4513", "#A0522D"]
    
    return hex_colors


def detect_subject_region(img_array: np.ndarray) -> np.ndarray:
    """
    检测图片的主体区域（使用中心加权和简单边缘检测）
    
    Args:
        img_array: 图片的 numpy 数组 (H, W, 3)
    
    Returns:
        主体区域的掩码（权重数组，值越大表示越可能是主体）
    """
    h, w = img_array.shape[:2]
    
    # 创建权重掩码（中心区域权重更高）
    y_center, x_center = h // 2, w // 2
    y_coords, x_coords = np.ogrid[:h, :w]
    
    # 计算每个像素到中心的距离（归一化到 0-1）
    dist_from_center = np.sqrt(
        ((y_coords - y_center) / h) ** 2 + 
        ((x_coords - x_center) / w) ** 2
    )
    
    # 中心区域权重更高（使用高斯分布）
    center_weight = np.exp(-dist_from_center ** 2 / 0.3)
    
    # 简单的边缘检测：使用差分计算梯度
    # 转换为灰度图
    gray = np.mean(img_array, axis=2).astype(np.float32)
    
    # 使用简单的差分算子计算梯度（不依赖 scipy）
    # 水平梯度
    sobel_x = np.zeros_like(gray)
    sobel_x[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    # 垂直梯度
    sobel_y = np.zeros_like(gray)
    sobel_y[1:-1, :] = gray[2:, :] - gray[:-2, :]
    
    # 计算梯度幅值
    gradient_magnitude = np.sqrt(sobel_x ** 2 + sobel_y ** 2)
    
    # 归一化梯度
    if gradient_magnitude.max() > 0:
        gradient_magnitude = gradient_magnitude / gradient_magnitude.max()
    
    # 边缘区域权重降低（梯度大的地方可能是背景边缘）
    edge_weight = 1.0 - (gradient_magnitude * 0.3)  # 降低边缘权重，但不完全排除
    
    # 综合权重：中心权重 + 边缘权重
    combined_weight = center_weight * 0.7 + edge_weight * 0.3
    
    return combined_weight


def extract_colors_kmeans(image_data: bytes, n_colors: int = 3, prioritize_subject: bool = True) -> List[str]:
    """
    使用 K-Means 提取图片的主要颜色，优先提取主体颜色
    
    Args:
        image_data: 图片二进制数据
        n_colors: 提取的颜色数量（默认 3）
        prioritize_subject: 是否优先提取主体区域的颜色（默认 True）
    
    Returns:
        Hex 颜色代码列表（如 ["#FFD700", "#FF6347", "#4169E1"]）
    """
    try:
        # 打开图片
        img = Image.open(BytesIO(image_data))
        
        # 转换为 RGB
        if img.mode != "RGB":
            img = img.convert("RGB")
        
        # 缩小图片以加快处理（采样）
        img.thumbnail((300, 300), Image.Resampling.LANCZOS)  # 稍微增大以提高主体检测精度
        
        # 转换为 numpy 数组
        img_array = np.array(img)
        h, w = img_array.shape[:2]
        pixels = img_array.reshape(-1, 3)
        
        # 如果启用主体检测，使用加权采样
        if prioritize_subject:
            try:
                # 检测主体区域
                subject_mask = detect_subject_region(img_array)
                
                # 将权重展平
                weights = subject_mask.flatten()
                
                # 归一化权重
                weights = weights / weights.sum()
                
                # 使用加权采样（采样更多主体区域的像素）
                n_samples = min(5000, len(pixels))  # 采样数量
                sample_indices = np.random.choice(
                    len(pixels), 
                    size=n_samples, 
                    replace=False, 
                    p=weights
                )
                sampled_pixels = pixels[sample_indices]
                
                # 使用加权 K-Means（给主体区域更高的权重）
                # 由于 sklearn 的 KMeans 不支持样本权重，我们使用采样后的数据
                pixels_for_clustering = sampled_pixels
            except Exception as e:
                print(f"[Caption] WARNING: Subject detection failed, using all pixels: {e}")
                pixels_for_clustering = pixels
        else:
            pixels_for_clustering = pixels
        
        # 使用 K-Means 聚类
        kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=10)
        kmeans.fit(pixels_for_clustering)
        
        # 获取聚类中心（主要颜色）
        colors = kmeans.cluster_centers_.astype(int)
        
        # 确保颜色值在有效范围内
        colors = np.clip(colors, 0, 255)
        
        # 转换为 Hex 颜色代码
        hex_colors = [rgb_to_hex(tuple(color)) for color in colors]
        
        # 计算每个颜色的重要性（基于聚类大小和位置）
        if prioritize_subject:
            try:
                # 计算每个聚类在主体区域的占比
                labels = kmeans.predict(pixels)
                subject_mask_flat = subject_mask.flatten()
                
                color_importance = []
                for i in range(n_colors):
                    cluster_mask = (labels == i)
                    # 计算该聚类在主体区域的占比
                    subject_cluster_ratio = np.sum(subject_mask_flat[cluster_mask]) / (np.sum(cluster_mask) + 1e-6)
                    color_importance.append((subject_cluster_ratio, i))
                
                # 按重要性排序
                color_importance.sort(reverse=True)
                hex_colors = [hex_colors[i] for _, i in color_importance]
            except Exception as e:
                print(f"[Caption] WARNING: Color importance calculation failed: {e}")
        
        # 去重并保持顺序
        seen = set()
        unique_colors = []
        for color in hex_colors:
            if color not in seen:
                seen.add(color)
                unique_colors.append(color)
        
        return unique_colors[:n_colors]
        
    except Exception as e:
        print(f"[Caption] ERROR extracting colors with K-Means: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
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
    
    # 提取颜色（优先使用 K-Means，更准确，返回 Hex 值）
    dominant_colors_hex = []
    dominant_colors = []  # 保持向后兼容，存储颜色名称
    if use_kmeans_colors and image_data:
        kmeans_colors_hex = extract_colors_kmeans(image_data, n_colors=3, prioritize_subject=True)
        if kmeans_colors_hex:
            dominant_colors_hex = kmeans_colors_hex
            # 同时转换为颜色名称（用于文本匹配，保持向后兼容）
            for hex_color in kmeans_colors_hex:
                try:
                    rgb = hex_to_rgb(hex_color)
                    color_name = rgb_to_color_name(rgb)
                    if color_name not in dominant_colors:
                        dominant_colors.append(color_name)
                except Exception as e:
                    print(f"[Caption] WARNING: Failed to convert {hex_color} to color name: {e}")
            print(f"[Caption] K-Means extracted colors (Hex): {dominant_colors_hex}")
            print(f"[Caption] K-Means extracted colors (Names): {dominant_colors}")
    
    # 如果 K-Means 失败，使用 Qwen-VL 的结果
    if not dominant_colors_hex:
        qwen_colors = qwen_result.get("dominant_colors", [])
        # Qwen-VL 返回的是颜色名称，需要转换为 Hex
        for color_name in qwen_colors:
            if color_name not in dominant_colors:
                dominant_colors.append(color_name)
            # 尝试将颜色名称转换为 Hex
            hex_range = color_name_to_hex_range(color_name)
            if hex_range and hex_range[0] not in dominant_colors_hex:
                dominant_colors_hex.append(hex_range[0])  # 使用第一个匹配的 Hex 值
    
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
        "dominant_colors": dominant_colors,  # 颜色名称列表（用于文本匹配，保持向后兼容）
        "dominant_colors_hex": dominant_colors_hex,  # ✅ 新增：Hex 颜色代码列表（更准确）
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

