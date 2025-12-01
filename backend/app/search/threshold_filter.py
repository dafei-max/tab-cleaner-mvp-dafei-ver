"""
动态阈值过滤模块
根据搜索结果的质量动态调整返回数量（1-20 个）
"""
from typing import List, Dict, Literal, Optional
from enum import Enum


class FilterMode(str, Enum):
    """过滤模式"""
    STRICT = "strict"      # 严格模式：只返回高质量结果
    BALANCED = "balanced"   # 平衡模式：返回高质量和中等质量结果
    RELAXED = "relaxed"    # 宽松模式：返回所有质量的结果


# 质量阈值配置
QUALITY_THRESHOLDS = {
    FilterMode.STRICT: {
        "high": 0.75,      # 高质量阈值
        "medium": 0.65,   # 中等质量阈值
        "low": 0.55,      # 低质量阈值
        "max_results": 10, # 最大返回数量
    },
    FilterMode.BALANCED: {
        "high": 0.30,      # 进一步降低阈值：确保有结果返回
        "medium": 0.20,   # 进一步降低阈值：允许更多中等质量结果
        "low": 0.15,      # 进一步降低阈值：允许低质量但相关的结果
        "max_results": 20, # 增加最大返回数量
    },
    FilterMode.RELAXED: {
        "high": 0.45,
        "medium": 0.30,
        "low": 0.20,
        "max_results": 30, # 增加最大返回数量
    },
}


def classify_quality(score: float, mode: FilterMode = FilterMode.BALANCED) -> str:
    """
    根据分数和质量阈值分类结果质量
    
    Args:
        score: 融合后的相似度分数 (0-1)
        mode: 过滤模式
    
    Returns:
        质量等级: "high" | "medium" | "low"
    """
    thresholds = QUALITY_THRESHOLDS[mode]
    
    if score >= thresholds["high"]:
        return "high"
    elif score >= thresholds["medium"]:
        return "medium"
    else:
        return "low"


def filter_by_threshold(
    results: List[Dict],
    mode: FilterMode = FilterMode.BALANCED,
    max_results: Optional[int] = None,  # 改为可选，None表示不限制数量
) -> List[Dict]:
    """
    根据动态阈值过滤搜索结果（不限制数量，只根据质量过滤）
    
    策略：
    - 高质量 (>high_threshold): 全部返回
    - 中等质量 (medium_threshold-high_threshold): 全部返回
    - 低质量 (<medium_threshold): 丢弃
    
    Args:
        results: 排序后的搜索结果列表（每个结果包含 'similarity' 字段）
        mode: 过滤模式
        max_results: 最大返回数量（可选，如果为None则不限制，只根据质量阈值过滤）
    
    Returns:
        过滤后的结果列表（根据质量阈值动态返回，不限制数量）
    """
    if not results:
        return []
    
    thresholds = QUALITY_THRESHOLDS[mode]
    
    # 按质量分类
    high_quality = []
    medium_quality = []
    low_quality = []
    
    for item in results:
        score = item.get("similarity", 0.0)
        quality = classify_quality(score, mode)
        
        # 添加质量标签
        item["quality"] = quality
        
        if quality == "high":
            high_quality.append(item)
        elif quality == "medium":
            medium_quality.append(item)
        else:
            low_quality.append(item)
    
    # 策略：返回所有高质量和中等质量的结果，丢弃低质量
    filtered = []
    
    # 1. 添加所有高质量结果
    filtered.extend(high_quality)
    
    # 2. 添加所有中等质量结果
    filtered.extend(medium_quality)
    
    # 3. 低质量结果直接丢弃
    
    # 如果设置了max_results，则限制数量（但优先保留高质量结果）
    if max_results is not None and len(filtered) > max_results:
        # 优先保留高质量结果，然后补充中等质量结果
        filtered = high_quality[:max_results] if len(high_quality) >= max_results else (
            high_quality + medium_quality[:max_results - len(high_quality)]
        )
    
    # 确保至少返回 1 个结果（如果有的话）
    if not filtered and results:
        # 如果没有高质量或中等质量结果，至少返回最好的一个
        filtered = [results[0]]
        filtered[0]["quality"] = classify_quality(
            filtered[0].get("similarity", 0.0), mode
        )
    
    return filtered


def get_filter_stats(results: List[Dict], mode: FilterMode = FilterMode.BALANCED) -> Dict:
    """
    获取过滤统计信息
    
    Args:
        results: 原始搜索结果列表
        mode: 过滤模式
    
    Returns:
        统计信息字典
    """
    if not results:
        return {
            "total": 0,
            "high_quality": 0,
            "medium_quality": 0,
            "low_quality": 0,
            "filtered_count": 0,
        }
    
    thresholds = QUALITY_THRESHOLDS[mode]
    
    high_count = 0
    medium_count = 0
    low_count = 0
    
    for item in results:
        score = item.get("similarity", 0.0)
        quality = classify_quality(score, mode)
        
        if quality == "high":
            high_count += 1
        elif quality == "medium":
            medium_count += 1
        else:
            low_count += 1
    
    filtered = filter_by_threshold(results, mode)
    
    return {
        "total": len(results),
        "high_quality": high_count,
        "medium_quality": medium_count,
        "low_quality": low_count,
        "filtered_count": len(filtered),
        "mode": mode.value,
        "thresholds": thresholds,
    }

