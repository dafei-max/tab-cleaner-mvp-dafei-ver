"""
聚类结果保存模块
将聚类结果保存到本地文件，方便查看和调试
"""
from __future__ import annotations
from typing import Dict, Any, List
import json
from pathlib import Path
from datetime import datetime
from .config import RESULTS_DIR


def save_clustering_result(
    result: Dict[str, Any],
    result_type: str = "unknown",
) -> str:
    """
    保存聚类结果到本地文件
    
    Args:
        result: 聚类结果字典
        result_type: 结果类型（"manual", "ai-classify", "ai-discover"）
    
    Returns:
        保存的文件路径
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"clustering_{result_type}_{timestamp}.json"
    filepath = RESULTS_DIR / filename
    
    # 准备保存的数据
    save_data = {
        "type": result_type,
        "timestamp": timestamp,
        "result": result,
    }
    
    # 保存到文件
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    
    print(f"[Clustering Storage] Saved result to: {filepath}")
    return str(filepath)


def save_multiple_clusters(
    clusters: List[Dict[str, Any]],
    result_type: str = "unknown",
) -> str:
    """
    保存多个聚类到本地文件
    
    Args:
        clusters: 聚类列表
        result_type: 结果类型
    
    Returns:
        保存的文件路径
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"clusters_{result_type}_{timestamp}.json"
    filepath = RESULTS_DIR / filename
    
    save_data = {
        "type": result_type,
        "timestamp": timestamp,
        "cluster_count": len(clusters),
        "clusters": clusters,
    }
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    
    print(f"[Clustering Storage] Saved {len(clusters)} clusters to: {filepath}")
    return str(filepath)

