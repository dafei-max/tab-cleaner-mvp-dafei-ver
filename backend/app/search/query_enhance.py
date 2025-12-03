"""
查询增强模块：在生成 embedding 前优化查询文本，提高检索准确度
"""
from typing import Optional, Dict, List


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

# 颜色映射（中英文 + 视觉描述）
COLOR_MAP = {
    "蓝色": ["blue", "azure", "navy", "cobalt", "sky blue", "blue color", "blue design"],
    "红色": ["red", "crimson", "scarlet", "burgundy", "red color", "red design"],
    "绿色": ["green", "emerald", "olive", "lime", "green color", "green design"],
    "黄色": ["yellow", "gold", "amber", "lemon", "yellow color"],
    "黑色": ["black", "dark", "ebony", "black color"],
    "白色": ["white", "ivory", "snow", "white color"],
    "灰色": ["gray", "grey", "silver", "charcoal"],
    "紫色": ["purple", "violet", "lavender", "plum"],
    "橙色": ["orange", "tangerine", "coral"],
    "粉色": ["pink", "rose", "blush", "magenta"],
}

# 风格映射
STYLE_MAP = {
    "简约": ["minimalist", "simple", "clean", "minimal design"],
    "现代": ["modern", "contemporary", "sleek"],
    "复古": ["vintage", "retro", "classic"],
    "工业": ["industrial", "loft", "rustic"],
    "北欧": ["scandinavian", "nordic", "hygge"],
    "日式": ["japanese", "zen", "muji style"],
}

# 物体映射（中英文，用于从查询中提取物体标签）
OBJECT_MAP = {
    "植物": ["plant", "tree", "flower", "foliage", "greenery", "vegetation"],
    "椅子": ["chair", "seat", "seating"],
    "桌子": ["table", "desk"],
    "沙发": ["sofa", "couch"],
    "床": ["bed"],
    "灯": ["lamp", "light", "lighting"],
    "书架": ["shelf", "bookshelf"],
    "镜子": ["mirror"],
    "地毯": ["rug", "carpet"],
    "枕头": ["pillow"],
    "窗帘": ["curtain", "drape"],
    "花瓶": ["vase"],
    "画": ["painting", "art", "picture"],
    "雕塑": ["sculpture"],
}

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


def enhance_query(query: str, enable_synonym_expansion: bool = True, default_to_visual: bool = True) -> str:
    """
    增强查询文本，提高 embedding 质量和检索准确度
    
    增强策略：
    1. 识别查询类型（视觉/技术/通用）
    2. 根据类型添加相关关键词（设计师找图场景，默认偏向视觉）
    3. 可选：添加英文同义词（支持中英文混合内容）
    
    Args:
        query: 原始查询文本
        enable_synonym_expansion: 是否启用同义词扩展（默认 True）
        default_to_visual: 是否默认偏向视觉查询（设计师找图场景，默认 True）
    
    Returns:
        增强后的查询文本
    """
    if not query or not query.strip():
        return query
    
    query = query.strip()
    query_type = detect_query_type(query, default_to_visual=default_to_visual)
    
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


def enhance_visual_query(query: str) -> Dict[str, any]:
    """
    增强视觉查询，提取颜色、风格、物体等属性
    
    Returns:
        {
            "original": "绿色植物",
            "enhanced": "绿色植物 green emerald plant tree design",
            "colors": ["green", "emerald"],
            "styles": [],
            "objects": ["plant", "tree", "flower"],
            "keywords": ["植物"]
        }
    """
    result = {
        "original": query,
        "enhanced": query,
        "colors": [],
        "styles": [],
        "objects": [],
        "keywords": []
    }
    
    if not query or not query.strip():
        return result
    
    query = query.strip()
    query_lower = query.lower()
    enhanced_words = set(query.split())
    
    # 检测颜色
    for color_cn, color_en_list in COLOR_MAP.items():
        if color_cn in query:
            result["colors"].extend(color_en_list[:3])  # 添加前3个英文同义词
            enhanced_words.update(color_en_list[:3])
    
    # 检测风格
    for style_cn, style_en_list in STYLE_MAP.items():
        if style_cn in query:
            result["styles"].extend(style_en_list)
            enhanced_words.update(style_en_list)
    
    # 检测物体
    for object_cn, object_en_list in OBJECT_MAP.items():
        if object_cn in query:
            result["objects"].extend(object_en_list)
            enhanced_words.update(object_en_list)
    
    # 提取关键词（去掉颜色/风格/物体词）
    for word in query.split():
        if word not in COLOR_MAP and word not in STYLE_MAP and word not in OBJECT_MAP:
            result["keywords"].append(word)
    
    result["enhanced"] = " ".join(enhanced_words)
    
    print(f"[Query Enhance] Original: '{query}'")
    print(f"[Query Enhance] Enhanced: '{result['enhanced']}'")
    print(f"[Query Enhance] Colors: {result['colors']}")
    print(f"[Query Enhance] Styles: {result['styles']}")
    print(f"[Query Enhance] Objects: {result['objects']}")
    
    return result


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

