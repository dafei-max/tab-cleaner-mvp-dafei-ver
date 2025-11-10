"""
AI 按标签分类模块
使用现有的 embedding 进行相似度计算，将卡片分类到用户定义的标签中
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
import numpy as np
from .config import MAX_LABELS
from .layout import calculate_cluster_layout
from search.embed import embed_text
from search.fuse import cosine_similarity


async def classify_by_labels(
    labels: List[str],
    items_data: List[Dict[str, Any]],
    exclude_item_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    根据用户定义的标签对卡片进行分类
    
    Args:
        labels: 用户定义的标签列表（最多3个）
        items_data: 所有卡片数据（需要包含 text_embedding 和 image_embedding）
        exclude_item_ids: 要排除的卡片 ID 列表（例如用户自定义聚类中的卡片）
    
    Returns:
        分类结果，包含每个标签对应的聚类
    """
    if not labels or len(labels) == 0:
        raise ValueError("labels are required")
    
    if len(labels) > MAX_LABELS:
        raise ValueError(f"Maximum {MAX_LABELS} labels allowed")
    
    # 过滤掉要排除的卡片
    exclude_set = set(exclude_item_ids or [])
    available_items = [
        item for item in items_data
        if item.get("id") and item.get("id") not in exclude_set
    ]
    
    if not available_items:
        raise ValueError("No available items for classification")
    
    print(f"[AI Classify] Classifying {len(available_items)} items with {len(labels)} labels")
    
    # 为每个标签生成 embedding
    label_embeddings = {}
    for label in labels:
        label_vec = await embed_text(label)
        if label_vec:
            label_embeddings[label] = label_vec
            print(f"[AI Classify] Generated embedding for label '{label}': {len(label_vec)} dims")
        else:
            print(f"[AI Classify] WARNING: Failed to generate embedding for label '{label}'")
    
    if not label_embeddings:
        raise ValueError("Failed to generate embeddings for any label")
    
    # 为每个卡片计算与每个标签的相似度
    # 使用 text_embedding 和 image_embedding 分别计算，然后融合
    item_scores = {}  # {item_id: {label: score}}
    
    for item in available_items:
        item_id = item.get("id")
        if not item_id:
            continue
        
        text_emb = item.get("text_embedding")
        image_emb = item.get("image_embedding")
        
        # 如果既没有 text_embedding 也没有 image_embedding，跳过
        if not text_emb and not image_emb:
            continue
        
        item_scores[item_id] = {}
        
        for label, label_vec in label_embeddings.items():
            text_sim = 0.0
            image_sim = 0.0
            
            # 计算文本相似度
            if text_emb and isinstance(text_emb, list) and len(text_emb) > 0:
                if len(text_emb) == len(label_vec):
                    text_sim = cosine_similarity(label_vec, text_emb)
            
            # 计算图像相似度
            if image_emb and isinstance(image_emb, list) and len(image_emb) > 0:
                if len(image_emb) == len(label_vec):
                    image_sim = cosine_similarity(label_vec, image_emb)
            
            # 融合相似度（默认权重：文本 60%，图像 40%）
            # 如果只有一种 embedding，使用单一相似度
            if text_emb and image_emb:
                final_sim = 0.6 * text_sim + 0.4 * image_sim
            elif text_emb:
                final_sim = text_sim
            elif image_emb:
                final_sim = image_sim
            else:
                final_sim = 0.0
            
            item_scores[item_id][label] = final_sim
    
    # 为每个标签分配卡片（每个卡片只属于最符合的标签）
    label_clusters = {label: [] for label in labels}
    label_clusters["其他"] = []  # 添加"其他"类别
    
    for item_id, scores in item_scores.items():
        # 找到最高分的标签
        best_label = None
        best_score = -1.0
        
        for label, score in scores.items():
            if score > best_score:
                best_score = score
                best_label = label
        
        # 如果最高分太低（阈值可调），归入"其他"
        if best_score < 0.3:  # 相似度阈值
            label_clusters["其他"].append(item_id)
        else:
            label_clusters[best_label].append(item_id)
    
    # 构建聚类结果（先不计算位置，让前端统一处理）
    clusters = []
    items_map = {item.get("id"): item for item in available_items if item.get("id")}
    
    for label, item_ids in label_clusters.items():
        if not item_ids:
            continue  # 跳过空聚类
        
        # 获取对应的卡片数据
        cluster_items = [items_map[item_id] for item_id in item_ids if item_id in items_map]
        
        if not cluster_items:
            continue
        
        # 先不计算位置，返回原始 items（前端会统一计算位置避免重叠）
        cluster = {
            "id": f"cluster-{uuid.uuid4().hex[:8]}",
            "name": label,
            "type": "ai-classify",
            "items": cluster_items,  # 暂时不计算位置，前端统一处理
            "center": {"x": 720, "y": 512},  # 临时位置，前端会重新计算
            "radius": 200,  # 临时半径
            "created_at": datetime.now().isoformat(),
            "item_count": len(cluster_items),
            "label": label,
        }
        
        clusters.append(cluster)
        print(f"[AI Classify] Created cluster '{label}' with {len(cluster_items)} items")
    
    return {
        "clusters": clusters,
        "total_items": len(available_items),
        "classified_items": sum(len(c["items"]) for c in clusters),
    }

