"""
圆形布局计算模块
复用前端 radialLayout 的逻辑，在服务端计算聚类布局
"""
from __future__ import annotations
from typing import List, Dict, Any
import math


def calculate_cluster_layout(
    items: List[Dict[str, Any]],
    center_x: float = 720,
    center_y: float = 512,
    image_size: int = 120,
    spacing: int = 150,
) -> List[Dict[str, Any]]:
    """
    计算放射状布局（从圆心开始，一圈一圈向外）
    
    Args:
        items: 要布局的项目数组
        center_x: 画布中心 X 坐标（默认 720）
        center_y: 画布中心 Y 坐标（默认 512）
        image_size: 图片大小（默认 120）
        spacing: 每圈之间的间距（默认 150）
    
    Returns:
        带位置信息的项目数组
    """
    if not items or not isinstance(items, list) or len(items) == 0:
        return []
    
    positioned = []
    current_ring = 0
    current_index_in_ring = 0
    items_in_current_ring = 1  # 第一圈 1 个，第二圈 6 个，第三圈 12 个...
    
    for item in items:
        if not item or not isinstance(item, dict):
            print(f"[Layout] WARNING: Invalid item: {item}")
            continue
        
        if current_index_in_ring >= items_in_current_ring:
            current_ring += 1
            current_index_in_ring = 0
            # 每圈数量：1, 6, 12, 18, 24...
            items_in_current_ring = 1 if current_ring == 0 else current_ring * 6
        
        angle_step = (2 * math.pi) / items_in_current_ring
        angle = current_index_in_ring * angle_step
        radius = current_ring * spacing + (spacing / 2 if current_ring > 0 else 0)
        
        x = center_x + math.cos(angle) * radius - image_size / 2
        y = center_y + math.sin(angle) * radius - image_size / 2
        
        positioned.append({
            **item,
            "x": round(x),
            "y": round(y),
            "width": image_size,
            "height": image_size,
        })
        
        current_index_in_ring += 1
    
    return positioned


def calculate_multiple_clusters_layout(
    clusters: List[Dict[str, Any]],
    canvas_width: int = 1440,
    canvas_height: int = 1024,
    cluster_spacing: int = 400,
) -> List[Dict[str, Any]]:
    """
    计算多个聚类的布局位置，避免重叠
    
    Args:
        clusters: 聚类列表，每个聚类包含 items 和 center 信息
        canvas_width: 画布宽度
        canvas_height: 画布高度
        cluster_spacing: 聚类之间的最小间距
    
    Returns:
        更新了 center 位置的聚类列表
    """
    if not clusters:
        return []
    
    # 简单的网格布局：从左到右，从上到下
    cols = int(math.ceil(math.sqrt(len(clusters))))
    rows = int(math.ceil(len(clusters) / cols))
    
    cluster_width = cluster_spacing
    cluster_height = cluster_spacing
    
    start_x = cluster_width // 2
    start_y = cluster_height // 2
    
    positioned_clusters = []
    for idx, cluster in enumerate(clusters):
        col = idx % cols
        row = idx // cols
        
        center_x = start_x + col * cluster_width
        center_y = start_y + row * cluster_height
        
        # 确保不超出画布
        center_x = min(center_x, canvas_width - cluster_width // 2)
        center_y = min(center_y, canvas_height - cluster_height // 2)
        
        # 计算该聚类内 items 的布局
        items = cluster.get("items", [])
        if items:
            positioned_items = calculate_cluster_layout(
                items,
                center_x=center_x,
                center_y=center_y,
            )
            cluster["items"] = positioned_items
        
        cluster["center"] = {"x": center_x, "y": center_y}
        positioned_clusters.append(cluster)
    
    return positioned_clusters

