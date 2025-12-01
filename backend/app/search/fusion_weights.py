"""
融合权重配置模块
用于调整五路分数的权重，优化搜索结果排序
"""

# 默认权重配置（设计师找图场景，主要靠caption和image）
DEFAULT_FUSION_WEIGHTS = {
    "text_similarity": 0.05,      # 文本向量相似度（最低）
    "image_similarity": 0.45,      # 图像向量相似度（最高，主要靠这个）
    "caption_similarity": 0.35,    # Caption 相似度（提高，主要靠这个）
    "keyword_match": 0.05,         # 关键词匹配（最低）
    "visual_attributes": 0.10,     # 视觉属性匹配（颜色/风格）
}

# 视觉优先权重（更偏向图像和视觉属性）
VISUAL_FOCUSED_WEIGHTS = {
    "text_similarity": 0.03,      # 文本向量相似度（最低）
    "image_similarity": 0.50,      # 图像向量相似度（最高）
    "caption_similarity": 0.37,    # Caption 相似度（提高）
    "keyword_match": 0.03,         # 关键词匹配（最低）
    "visual_attributes": 0.07,     # 视觉属性匹配
}

# 文本优先权重（文档/博客场景）
TEXT_FOCUSED_WEIGHTS = {
    "text_similarity": 0.30,      # 文本向量相似度（提高）
    "image_similarity": 0.20,      # 图像向量相似度（降低）
    "caption_similarity": 0.20,    # Caption 相似度
    "keyword_match": 0.20,         # 关键词匹配（提高）
    "visual_attributes": 0.10,     # 视觉属性匹配（降低）
}

# 平衡权重（所有维度均衡）
BALANCED_WEIGHTS = {
    "text_similarity": 0.20,      # 文本向量相似度
    "image_similarity": 0.20,      # 图像向量相似度
    "caption_similarity": 0.20,    # Caption 相似度
    "keyword_match": 0.20,         # 关键词匹配
    "visual_attributes": 0.20,     # 视觉属性匹配
}


def get_fusion_weights(mode: str = "default") -> dict:
    """
    获取融合权重配置
    
    Args:
        mode: 权重模式
            - "default": 默认权重（设计师找图场景）
            - "visual": 视觉优先（更偏向图像和视觉属性）
            - "text": 文本优先（文档/博客场景）
            - "balanced": 平衡权重（所有维度均衡）
    
    Returns:
        权重配置字典
    """
    weights_map = {
        "default": DEFAULT_FUSION_WEIGHTS,
        "visual": VISUAL_FOCUSED_WEIGHTS,
        "text": TEXT_FOCUSED_WEIGHTS,
        "balanced": BALANCED_WEIGHTS,
    }
    
    return weights_map.get(mode, DEFAULT_FUSION_WEIGHTS)


def validate_weights(weights: dict) -> bool:
    """
    验证权重配置是否有效
    
    Args:
        weights: 权重配置字典
    
    Returns:
        是否有效
    """
    required_keys = ["text_similarity", "image_similarity", "caption_similarity", 
                     "keyword_match", "visual_attributes"]
    
    # 检查是否包含所有必需的键
    if not all(key in weights for key in required_keys):
        return False
    
    # 检查权重是否在 [0, 1] 范围内
    if not all(0 <= weights[key] <= 1 for key in required_keys):
        return False
    
    # 检查权重总和是否接近 1.0（允许小误差）
    total = sum(weights[key] for key in required_keys)
    if abs(total - 1.0) > 0.01:
        print(f"[FusionWeights] Warning: Weights sum to {total:.3f}, expected 1.0")
        return False
    
    return True


# 当前使用的权重（可以通过环境变量或配置文件修改）
import os

# 从环境变量读取权重模式（如果设置了）
WEIGHT_MODE = os.getenv("FUSION_WEIGHT_MODE", "default").lower()

# 获取当前权重配置
FUSION_WEIGHTS = get_fusion_weights(WEIGHT_MODE)

# 验证权重配置
if not validate_weights(FUSION_WEIGHTS):
    print(f"[FusionWeights] Warning: Invalid weights, using default")
    FUSION_WEIGHTS = DEFAULT_FUSION_WEIGHTS

print(f"[FusionWeights] Using weight mode: {WEIGHT_MODE}")
print(f"[FusionWeights] Weights: {FUSION_WEIGHTS}")

