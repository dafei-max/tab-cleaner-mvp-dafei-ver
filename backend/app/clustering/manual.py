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
    
    # 生成聚类 ID
    cluster_id = f"cluster-{uuid.uuid4().hex[:8]}"
    
    # 先不计算位置，返回原始 items（前端会统一计算位置避免重叠）
    cluster = {
        "id": cluster_id,
        "name": cluster_name,
        "type": "manual",
        "items": cluster_items,  # 暂时不计算位置，前端统一处理
        "center": {"x": center_x, "y": center_y},  # 临时位置，前端会重新计算
        "radius": 200,  # 临时半径
        "created_at": datetime.now().isoformat(),
        "item_count": len(cluster_items),
    }
    
    print(f"[Manual Cluster] Created cluster '{cluster_name}' with {len(cluster_items)} items")
    return cluster

