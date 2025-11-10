"""
AI 自发现聚类模块
使用 K-means 算法对所有卡片进行无监督聚类，然后使用 AI 生成聚类名称
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
import numpy as np
import httpx
from sklearn.cluster import KMeans
from .config import (
    MIN_DISCOVER_CLUSTERS,
    MAX_DISCOVER_CLUSTERS,
    CLUSTER_NAME_MAX_LENGTH,
    CLUSTER_NAME_MIN_LENGTH,
    QWEN_CHAT_ENDPOINT,
    get_api_key,
)
from .layout import calculate_cluster_layout


def _extract_embeddings(items: List[Dict[str, Any]]) -> tuple[List[np.ndarray], List[str]]:
    """
    从卡片数据中提取 embedding 向量
    
    Returns:
        (embeddings, item_ids) - embedding 数组和对应的 item ID 列表
    """
    embeddings = []
    item_ids = []
    
    for item in items:
        item_id = item.get("id")
        if not item_id:
            continue
        
        text_emb = item.get("text_embedding")
        image_emb = item.get("image_embedding")
        
        # 优先使用 text_embedding，如果没有则使用 image_embedding
        # 如果两者都有，融合（简单平均）
        emb = None
        
        if text_emb and isinstance(text_emb, list) and len(text_emb) > 0:
            if image_emb and isinstance(image_emb, list) and len(image_emb) > 0:
                # 两者都有，融合（简单平均）
                if len(text_emb) == len(image_emb):
                    emb = np.array(text_emb) * 0.6 + np.array(image_emb) * 0.4
                else:
                    # 维度不匹配，使用 text_embedding
                    emb = np.array(text_emb)
            else:
                emb = np.array(text_emb)
        elif image_emb and isinstance(image_emb, list) and len(image_emb) > 0:
            emb = np.array(image_emb)
        
        if emb is not None and emb.size > 0:
            embeddings.append(emb)
            item_ids.append(item_id)
    
    return embeddings, item_ids


def _determine_cluster_count(item_count: int) -> int:
    """
    根据卡片数量确定聚类数量（3-5组）
    """
    if item_count <= 3:
        return item_count
    elif item_count <= 10:
        return min(3, item_count)
    elif item_count <= 20:
        return 4
    else:
        return MAX_DISCOVER_CLUSTERS


async def _generate_cluster_name(items: List[Dict[str, Any]]) -> str:
    """
    使用 AI 生成聚类名称（6-8个字）
    
    Args:
        items: 聚类中的卡片数据
    
    Returns:
        聚类名称
    """
    api_key = get_api_key()
    if not api_key:
        return "未命名聚类"
    
    # 提取卡片的标题和描述
    titles = []
    descriptions = []
    for item in items[:10]:  # 最多取前10个
        title = item.get("title") or item.get("tab_title", "")
        desc = item.get("description", "")
        if title:
            titles.append(title)
        if desc:
            descriptions.append(desc[:100])  # 限制长度
    
    # 构建提示词
    content_text = "\n".join(titles[:5])  # 使用前5个标题
    if descriptions:
        content_text += "\n" + "\n".join(descriptions[:3])
    
    prompt = f"""请根据以下网页标题和描述，生成一个简洁的聚类名称（{CLUSTER_NAME_MIN_LENGTH}-{CLUSTER_NAME_MAX_LENGTH}个字），要求：
1. 概括这些网页的共同主题
2. 简洁明了，不超过{CLUSTER_NAME_MAX_LENGTH}个字
3. 只返回名称，不要其他解释

网页内容：
{content_text}

聚类名称："""
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                QWEN_CHAT_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen-turbo",
                    "input": {
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt,
                            }
                        ]
                    },
                    "parameters": {
                        "max_tokens": 20,
                        "temperature": 0.7,
                    }
                },
            )
            
            if response.status_code == 200:
                data = response.json()
                output = data.get("output", {})
                choices = output.get("choices", [])
                if choices and len(choices) > 0:
                    name = choices[0].get("message", {}).get("content", "").strip()
                    # 清理名称（移除可能的引号、标点等）
                    name = name.strip('"').strip("'").strip("。").strip(".")
                    # 限制长度
                    if len(name) > CLUSTER_NAME_MAX_LENGTH:
                        name = name[:CLUSTER_NAME_MAX_LENGTH]
                    if len(name) >= CLUSTER_NAME_MIN_LENGTH:
                        return name
    except Exception as e:
        print(f"[AI Discover] ERROR generating cluster name: {type(e).__name__}: {str(e)}")
    
    # 失败时返回默认名称
    return "未命名聚类"


async def discover_clusters(
    items_data: List[Dict[str, Any]],
    exclude_item_ids: Optional[List[str]] = None,
    n_clusters: Optional[int] = None,
) -> Dict[str, Any]:
    """
    使用 K-means 对所有卡片进行无监督聚类，然后使用 AI 生成聚类名称
    
    Args:
        items_data: 所有卡片数据（需要包含 text_embedding 和 image_embedding）
        exclude_item_ids: 要排除的卡片 ID 列表（例如用户自定义聚类中的卡片）
        n_clusters: 聚类数量（如果不指定，自动确定）
    
    Returns:
        聚类结果，包含每个聚类的信息
    """
    # 过滤掉要排除的卡片
    exclude_set = set(exclude_item_ids or [])
    available_items = [
        item for item in items_data
        if item.get("id") and item.get("id") not in exclude_set
    ]
    
    if not available_items:
        raise ValueError("No available items for clustering")
    
    print(f"[AI Discover] Clustering {len(available_items)} items")
    
    # 提取 embedding
    embeddings, item_ids = _extract_embeddings(available_items)
    
    if len(embeddings) < MIN_DISCOVER_CLUSTERS:
        raise ValueError(f"Need at least {MIN_DISCOVER_CLUSTERS} items with embeddings for clustering")
    
    # 确定聚类数量
    if n_clusters is None:
        n_clusters = _determine_cluster_count(len(embeddings))
    
    n_clusters = max(MIN_DISCOVER_CLUSTERS, min(MAX_DISCOVER_CLUSTERS, n_clusters))
    n_clusters = min(n_clusters, len(embeddings))  # 不能超过数据点数量
    
    print(f"[AI Discover] Using {n_clusters} clusters")
    
    # 转换为 numpy 数组
    embeddings_array = np.array(embeddings)
    
    # 执行 K-means 聚类
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(embeddings_array)
    
    # 按聚类分组
    clusters_dict = {}
    items_map = {item.get("id"): item for item in available_items if item.get("id")}
    
    for idx, item_id in enumerate(item_ids):
        label = int(cluster_labels[idx])
        if label not in clusters_dict:
            clusters_dict[label] = []
        clusters_dict[label].append(item_id)
    
    # 为每个聚类生成名称和布局
    clusters = []
    cluster_positions = [
        (720, 312),   # 第一行
        (1120, 312),
        (1520, 312),
        (720, 712),   # 第二行
        (1120, 712),
    ]
    
    for cluster_idx, (label, item_ids_in_cluster) in enumerate(clusters_dict.items()):
        cluster_items = [items_map[item_id] for item_id in item_ids_in_cluster if item_id in items_map]
        
        if not cluster_items:
            continue
        
        # 生成聚类名称
        cluster_name = await _generate_cluster_name(cluster_items)
        print(f"[AI Discover] Generated cluster name: '{cluster_name}' for {len(cluster_items)} items")
        
        # 先不计算位置，返回原始 items（前端会统一计算位置避免重叠）
        cluster = {
            "id": f"cluster-{uuid.uuid4().hex[:8]}",
            "name": cluster_name,
            "type": "ai-discover",
            "items": cluster_items,  # 暂时不计算位置，前端统一处理
            "center": {"x": 720, "y": 512},  # 临时位置，前端会重新计算
            "radius": 200,  # 临时半径
            "created_at": datetime.now().isoformat(),
            "item_count": len(cluster_items),
        }
        
        clusters.append(cluster)
    
    return {
        "clusters": clusters,
        "total_items": len(available_items),
        "clustered_items": sum(len(c["items"]) for c in clusters),
    }

