"""
查询增强模块：在生成 embedding 前优化查询文本，提高检索准确度
"""
from typing import Optional


# 视觉查询关键词（用于识别用户是否在找图片/设计类内容）
VISUAL_KEYWORDS = [
    "图", "图片", "图像", "照片", "photo", "image", "picture", "pic",
    "设计", "design", "visual", "视觉", "好看", "beautiful", "pretty",
    "颜色", "color", "colour", "配色", "风格", "style", "风格",
    "插画", "illustration", "drawing", "绘画", "画",
    "海报", "poster", "banner", "封面", "cover",
    "UI", "UX", "界面", "界面设计", "网页设计", "web design",
    "图标", "icon", "logo", "标志",
]

# 技术文档查询关键词（用于识别用户是否在找技术文档/教程）
TECH_KEYWORDS = [
    "怎么", "如何", "how", "how to", "tutorial", "教程", "指南", "guide",
    "文档", "documentation", "docs", "api", "API", "reference",
    "代码", "code", "编程", "programming", "开发", "development",
    "github", "GitHub", "stackoverflow", "Stack Overflow",
    "问题", "problem", "issue", "bug", "错误", "error",
    "实现", "implement", "implementation", "例子", "example",
]

# 中英文同义词映射（简单版本，可以根据需要扩展）
SYNONYM_MAP = {
    "椅子": ["chair", "seat", "seating", "furniture"],
    "设计": ["design", "creative", "visual"],
    "图片": ["image", "photo", "picture", "pic"],
    "教程": ["tutorial", "guide", "how to"],
    "文档": ["documentation", "docs", "reference"],
    "代码": ["code", "programming", "implementation"],
    "问题": ["problem", "issue", "bug", "error"],
    "实现": ["implement", "implementation", "build"],
    "例子": ["example", "demo", "sample"],
    "好看": ["beautiful", "pretty", "nice", "good looking"],
    "颜色": ["color", "colour", "palette"],
    "风格": ["style", "theme", "aesthetic"],
}


def detect_query_type(query: str, default_to_visual: bool = True) -> str:
    """
    识别查询类型
    
    Args:
        query: 用户查询文本
        default_to_visual: 是否默认偏向视觉查询（设计师找图场景，默认 True）
    
    Returns:
        "visual": 视觉查询（找图片/设计）
        "tech": 技术文档查询（找教程/文档）
        "general": 通用查询（如果 default_to_visual=True，会偏向 visual）
    """
    query_lower = query.lower()
    
    # 检查视觉关键词
    visual_count = sum(1 for kw in VISUAL_KEYWORDS if kw.lower() in query_lower)
    if visual_count > 0:
        return "visual"
    
    # 检查技术关键词（需要明确的技术词汇才识别为 tech）
    tech_count = sum(1 for kw in TECH_KEYWORDS if kw.lower() in query_lower)
    if tech_count >= 2:  # 需要至少2个技术关键词才识别为 tech
        return "tech"
    
    # 对于设计师找图场景，默认偏向视觉查询
    if default_to_visual:
        return "visual"
    
    return "general"


def expand_with_synonyms(query: str) -> str:
    """
    使用同义词扩展查询
    
    Args:
        query: 原始查询
    
    Returns:
        扩展后的查询（添加英文同义词）
    """
    enhanced_words = set(query.split())  # 使用 set 避免重复
    
    # 检查每个同义词映射
    for chinese_word, english_synonyms in SYNONYM_MAP.items():
        if chinese_word in query:
            # 添加英文同义词（只添加不在查询中的词）
            for synonym in english_synonyms[:2]:  # 只添加前2个
                if synonym.lower() not in query.lower():
                    enhanced_words.add(synonym)
    
    return " ".join(enhanced_words).strip()


def enhance_query(query: str, enable_synonym_expansion: bool = True) -> str:
    """
    增强查询文本，提高 embedding 质量和检索准确度
    
    增强策略：
    1. 识别查询类型（视觉/技术/通用）
    2. 根据类型添加相关关键词
    3. 可选：添加英文同义词（支持中英文混合内容）
    
    Args:
        query: 原始查询文本
        enable_synonym_expansion: 是否启用同义词扩展（默认 True）
    
    Returns:
        增强后的查询文本
    """
    if not query or not query.strip():
        return query
    
    query = query.strip()
    query_type = detect_query_type(query)
    
    # 根据查询类型添加相关词（使用 set 避免重复）
    enhanced_words = set(query.split())
    
    if query_type == "visual":
        # 视觉查询：添加视觉相关词
        visual_words = ["image", "visual", "design", "photo"]
        enhanced_words.update(visual_words)
    elif query_type == "tech":
        # 技术查询：添加技术相关词
        tech_words = ["tutorial", "guide", "documentation", "how", "to"]
        enhanced_words.update(tech_words)
    else:
        # 通用查询：添加通用检索词
        enhanced_words.add("content")
    
    # 可选：添加同义词扩展（支持中英文混合）
    if enable_synonym_expansion:
        # 对原始查询进行同义词扩展
        synonym_expanded = expand_with_synonyms(query)
        enhanced_words.update(synonym_expanded.split())
    
    # 清理并返回
    enhanced = " ".join(sorted(enhanced_words))  # 排序保证一致性
    
    print(f"[Query Enhance] Original: '{query}' → Enhanced: '{enhanced}' (type: {query_type})")
    
    return enhanced


def enhance_query_simple(query: str) -> str:
    """
    简化版查询增强（只添加基本相关词，不进行复杂处理）
    
    适用于：
    - 快速实现
    - 避免过度扩展
    - 保持查询原始意图
    
    Args:
        query: 原始查询文本
    
    Returns:
        增强后的查询文本
    """
    if not query or not query.strip():
        return query
    
    query = query.strip()
    query_type = detect_query_type(query)
    
    # 根据类型添加少量关键词
    if query_type == "visual":
        enhanced = f"{query} visual design"
    elif query_type == "tech":
        enhanced = f"{query} tutorial guide"
    else:
        enhanced = query  # 通用查询不增强
    
    enhanced = " ".join(enhanced.split())
    
    print(f"[Query Enhance] Simple enhancement: '{query}' → '{enhanced}' (type: {query_type})")
    
    return enhanced

