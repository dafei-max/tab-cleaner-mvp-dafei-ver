"""
用户自定义聚类模块
"""
from __future__ import annotations
from typing import List, Dict, Any
import uuid
from datetime import datetime
from .layout import calculate_cluster_layout


def create_manual_cluster(
    item_ids: List[str],
    cluster_name: str,
    items_data: List[Dict[str, Any]],
    center_x: float = 720,
    center_y: float = 512,
) -> Dict[str, Any]:
    """
    创建用户自定义聚类
    
    Args:
        item_ids: 选中的卡片 ID 列表
        cluster_name: 聚类名称
        items_data: 所有卡片数据（用于查找对应的卡片信息）
        center_x: 聚类中心 X 坐标
        center_y: 聚类中心 Y 坐标
    
    Returns:
        聚类对象，包含 id, name, type, items, center, radius 等信息
    """
    if not item_ids or not cluster_name:
        raise ValueError("item_ids and cluster_name are required")
    
    # 从 items_data 中提取对应的卡片
    items_map = {item.get("id"): item for item in items_data if item.get("id")}
    cluster_items = []
    
    for item_id in item_ids:
        if item_id in items_map:
            cluster_items.append(items_map[item_id])
    
    if not cluster_items:
        raise ValueError("No valid items found for cluster")
    
    # 计算圆形布局
    positioned_items = calculate_cluster_layout(
        cluster_items,
        center_x=center_x,
        center_y=center_y,
    )
    
    # 生成聚类 ID
    cluster_id = f"cluster-{uuid.uuid4().hex[:8]}"
    
    # 计算聚类半径（基于最外层 item 的距离）
    max_radius = 0
    for item in positioned_items:
        dx = item.get("x", center_x) - center_x
        dy = item.get("y", center_y) - center_y
        radius = (dx ** 2 + dy ** 2) ** 0.5
        max_radius = max(max_radius, radius)
    
    cluster = {
        "id": cluster_id,
        "name": cluster_name,
        "type": "manual",
        "items": positioned_items,
        "center": {"x": center_x, "y": center_y},
        "radius": max_radius + 60,  # 加上一些边距
        "created_at": datetime.now().isoformat(),
        "item_count": len(positioned_items),
    }
    
    print(f"[Manual Cluster] Created cluster '{cluster_name}' with {len(positioned_items)} items")
    return cluster

