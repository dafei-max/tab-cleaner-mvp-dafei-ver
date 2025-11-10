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
    cluster_spacing: int = 500,  # 增加间距，确保不重叠
) -> List[Dict[str, Any]]:
    """
    计算多个聚类的布局位置，避免重叠
    使用螺旋布局算法，从中心向外扩散
    
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
    
    # 计算每个聚类的半径（基于其 items 数量）
    cluster_radii = []
    for cluster in clusters:
        items = cluster.get("items", [])
        item_count = len(items)
        # 估算聚类半径：基于圆形排列的最大半径
        # 假设每圈6个，计算需要多少圈
        if item_count <= 1:
            radius = 100
        else:
            rings = math.ceil((item_count - 1) / 6) + 1
            radius = rings * 150 + 100  # 每圈150间距，加上边距
        cluster_radii.append(radius)
    
    # 使用螺旋布局：从画布中心开始，按螺旋向外排列
    center_x = canvas_width / 2
    center_y = canvas_height / 2
    
    positioned_clusters = []
    used_positions = []  # 记录已使用的位置，用于碰撞检测
    
    for idx, cluster in enumerate(clusters):
        items = cluster.get("items", [])
        cluster_radius = cluster_radii[idx]
        
        # 螺旋参数
        angle_step = math.pi / 3  # 每60度一个位置
        spiral_radius = cluster_spacing
        
        # 尝试找到不重叠的位置
        best_position = None
        best_distance = float('inf')
        
        # 如果这是第一个聚类，放在中心
        if idx == 0:
            center_x_pos = center_x
            center_y_pos = center_y
        else:
            # 从中心开始螺旋搜索
            for ring in range(1, 10):  # 最多10圈
                for angle_idx in range(ring * 6):  # 每圈6个位置
                    angle = angle_idx * angle_step
                    # 螺旋半径随圈数增加
                    spiral_r = ring * cluster_spacing
                    test_x = center_x + math.cos(angle) * spiral_r
                    test_y = center_y + math.sin(angle) * spiral_r
                    
                    # 检查是否与已有聚类重叠
                    overlaps = False
                    for used_pos in used_positions:
                        used_x, used_y, used_r = used_pos
                        distance = math.sqrt((test_x - used_x) ** 2 + (test_y - used_y) ** 2)
                        if distance < (cluster_radius + used_r + 50):  # 50px 安全边距
                            overlaps = True
                            break
                    
                    # 检查是否超出画布
                    if (test_x - cluster_radius < 0 or test_x + cluster_radius > canvas_width or
                        test_y - cluster_radius < 0 or test_y + cluster_radius > canvas_height):
                        continue
                    
                    if not overlaps:
                        # 选择距离中心最近的位置（优先）
                        distance_from_center = math.sqrt((test_x - center_x) ** 2 + (test_y - center_y) ** 2)
                        if distance_from_center < best_distance:
                            best_distance = distance_from_center
                            best_position = (test_x, test_y)
                
                if best_position:
                    break
            
            if best_position:
                center_x_pos, center_y_pos = best_position
            else:
                # 如果找不到合适位置，使用简单的网格布局作为后备
                cols = int(math.ceil(math.sqrt(len(clusters))))
                col = idx % cols
                row = idx // cols
                center_x_pos = 200 + col * cluster_spacing
                center_y_pos = 200 + row * cluster_spacing
        
        # 计算该聚类内 items 的圆形布局
        if items:
            positioned_items = calculate_cluster_layout(
                items,
                center_x=center_x_pos,
                center_y=center_y_pos,
            )
            cluster["items"] = positioned_items
        
        cluster["center"] = {"x": center_x_pos, "y": center_y_pos}
        positioned_clusters.append(cluster)
        
        # 记录已使用的位置
        used_positions.append((center_x_pos, center_y_pos, cluster_radius))
    
    return positioned_clusters

