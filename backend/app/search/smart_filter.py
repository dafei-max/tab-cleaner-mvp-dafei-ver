"""
AI监督筛选模块
根据查询类型（颜色、物体、风格）智能调整过滤策略
对于明确的视觉属性查询，返回所有匹配的结果
针对设计师场景：自动过滤掉文档类内容
"""
from typing import List, Dict, Optional
from .threshold_filter import FilterMode, filter_by_threshold, QUALITY_THRESHOLDS
from .query_enhance import enhance_visual_query
from .preprocess import is_doc_like


def detect_query_intent(query: str) -> Dict[str, any]:
    """
    检测查询意图
    
    Returns:
        {
            "has_color": bool,      # 是否包含颜色查询
            "has_object": bool,     # 是否包含物体查询
            "has_style": bool,      # 是否包含风格查询
            "is_visual_query": bool, # 是否是视觉属性查询
            "colors": List[str],     # 提取的颜色列表
            "objects": List[str],    # 提取的物体列表（从关键词推断）
            "styles": List[str],     # 提取的风格列表
        }
    """
    visual_attrs = enhance_visual_query(query)
    colors = visual_attrs.get("colors", [])
    styles = visual_attrs.get("styles", [])
    keywords = visual_attrs.get("keywords", [])
    
    # 常见物体关键词（可以根据需要扩展）
    object_keywords = [
        "椅子", "chair", "table", "桌子", "desk", "sofa", "沙发",
        "lamp", "灯", "plant", "植物", "bed", "床", "shelf", "书架",
        "mirror", "镜子", "rug", "地毯", "pillow", "枕头",
        "curtain", "窗帘", "vase", "花瓶", "painting", "画",
        "sculpture", "雕塑", "design", "设计", "image", "图片",
        "photo", "照片", "poster", "海报", "banner", "横幅",
    ]
    
    # 检测物体关键词
    detected_objects = []
    query_lower = query.lower()
    for obj in object_keywords:
        if obj.lower() in query_lower:
            detected_objects.append(obj)
    
    # 从关键词中提取可能的物体
    for keyword in keywords:
        if keyword.lower() not in [c.lower() for c in colors] and \
           keyword.lower() not in [s.lower() for s in styles]:
            # 可能是物体
            if len(keyword) > 1:  # 过滤单字
                detected_objects.append(keyword)
    
    has_color = len(colors) > 0
    has_object = len(detected_objects) > 0
    has_style = len(styles) > 0
    is_visual_query = has_color or has_object or has_style
    
    return {
        "has_color": has_color,
        "has_object": has_object,
        "has_style": has_style,
        "is_visual_query": is_visual_query,
        "colors": colors,
        "objects": detected_objects,
        "styles": styles,
    }


def smart_filter_by_visual_attributes(
    results: List[Dict],
    query_intent: Dict[str, any],
    min_similarity: float = 0.15,
) -> List[Dict]:
    """
    基于视觉属性的智能过滤
    
    对于颜色/物体/风格查询：
    - 如果结果在视觉属性上匹配，即使相似度较低也保留
    - 优先保留视觉属性匹配的结果
    
    Args:
        results: 排序后的搜索结果列表
        query_intent: 查询意图（来自 detect_query_intent）
        min_similarity: 最低相似度阈值
    
    Returns:
        过滤后的结果列表
    """
    if not results:
        return []
    
    if not query_intent["is_visual_query"]:
        # 非视觉查询，使用常规过滤
        return [r for r in results if r.get("similarity", 0.0) >= min_similarity]
    
    # 视觉查询：优先保留视觉属性匹配的结果
    matched = []  # 视觉属性匹配的结果
    unmatched = []  # 视觉属性不匹配的结果
    
    colors = [c.lower() for c in query_intent["colors"]]
    objects = [o.lower() for o in query_intent["objects"]]
    styles = [s.lower() for s in query_intent["styles"]]
    
    for item in results:
        # 检查视觉属性匹配
        item_colors = [c.lower() for c in (item.get("dominant_colors") or [])]
        item_tags = [t.lower() for t in (item.get("object_tags") or [])]
        item_styles = [s.lower() for s in (item.get("style_tags") or [])]
        
        # 检查颜色匹配
        color_match = any(c in item_colors for c in colors) if colors else False
        
        # 检查物体匹配（从标题、描述、caption中）
        title = (item.get("title") or "").lower()
        description = (item.get("description") or "").lower()
        caption = (item.get("image_caption") or "").lower()
        text_content = f"{title} {description} {caption}"
        
        object_match = any(
            obj in text_content or obj in item_tags
            for obj in objects
        ) if objects else False
        
        # 检查风格匹配
        style_match = any(s in item_styles for s in styles) if styles else False
        
        # 如果任何视觉属性匹配，认为是匹配的
        is_visual_match = color_match or object_match or style_match
        
        if is_visual_match:
            # 视觉属性匹配，即使相似度较低也保留
            item["visual_match"] = True
            item["visual_match_details"] = {
                "color_match": color_match,
                "object_match": object_match,
                "style_match": style_match,
            }
            matched.append(item)
        else:
            # 视觉属性不匹配，但相似度足够高也保留
            if item.get("similarity", 0.0) >= min_similarity:
                item["visual_match"] = False
                unmatched.append(item)
    
    # 优先返回视觉属性匹配的结果，然后补充其他高质量结果
    # 视觉属性匹配的结果按相似度排序
    matched.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    unmatched.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    
    # 合并结果：先返回所有视觉匹配的，然后补充未匹配但高质量的结果
    final_results = matched + unmatched
    
    return final_results


def is_designer_site(item: Dict) -> bool:
    """
    判断是否是设计师相关网站
    """
    url = (item.get("url") or "").lower()
    site_name = (item.get("site_name") or "").lower()
    
    # 设计师网站列表（扩展）
    designer_sites = [
        "pinterest", "behance", "dribbble", "xiaohongshu", "小红书",
        "站酷", "zcool", "ui.cn", "uisdc", "优设", "youzhan",
        "unsplash", "pexels", "pixabay", "freepik", "shutterstock",
        "getty", "deviantart", "artstation", "500px", "flickr",
        "imgur", "tumblr", "arena", "muzli", "designspiration",
        "awwwards", "siteinspire", "land-book", "onepagelove",
        "collectui", "mobbin", "pageflows", "saaslandingpage",
    ]
    
    return any(site in url or site in site_name for site in designer_sites)


def boost_designer_sites(results: List[Dict], boost_factor: float = 0.15) -> List[Dict]:
    """
    提升设计师网站的优先级（在相似度基础上加分）
    
    Args:
        results: 搜索结果列表
        boost_factor: 加分幅度（默认0.15，即提升15%）
    
    Returns:
        调整后的结果列表
    """
    boosted = []
    designer_count = 0
    
    for item in results:
        if is_designer_site(item):
            # 提升相似度分数
            original_sim = item.get("similarity", 0.0)
            boosted_sim = min(1.0, original_sim + boost_factor)
            item["similarity"] = boosted_sim
            item["designer_boost"] = True
            item["original_similarity"] = original_sim
            designer_count += 1
        else:
            item["designer_boost"] = False
        
        boosted.append(item)
    
    if designer_count > 0:
        print(f"[SmartFilter] Boosted {designer_count} designer sites (boost_factor={boost_factor})")
    
    # 重新排序（按新的相似度）
    boosted.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    
    return boosted


def filter_doc_items(results: List[Dict], filter_docs: bool = True) -> List[Dict]:
    """
    过滤掉文档类内容（针对设计师场景）
    
    Args:
        results: 搜索结果列表
        filter_docs: 是否过滤文档类内容（默认True，设计师场景）
    
    Returns:
        过滤后的结果列表
    """
    if not filter_docs:
        return results
    
    filtered = []
    doc_count = 0
    
    for item in results:
        # 检查是否是文档类内容
        is_doc = is_doc_like(item)
        
        # 检查metadata中的is_doc_card标记
        metadata = item.get("metadata", {})
        if isinstance(metadata, str):
            import json
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        is_doc_card = metadata.get("is_doc_card", False) or item.get("is_doc_card", False)
        
        if is_doc or is_doc_card:
            doc_count += 1
            item["filtered_reason"] = "doc_content"  # 标记过滤原因
            continue  # 跳过文档类内容
        
        filtered.append(item)
    
    if doc_count > 0:
        print(f"[SmartFilter] Filtered out {doc_count} doc items (designer-focused search)")
    
    return filtered


async def smart_filter(
    results: List[Dict],
    query: str,
    filter_mode: FilterMode = FilterMode.BALANCED,
    max_results: Optional[int] = None,  # 改为可选，None表示不限制数量
    filter_docs: bool = True,  # 是否过滤文档类内容（默认True，设计师场景）
) -> List[Dict]:
    """
    AI监督筛选：根据查询类型智能调整过滤策略
    
    策略：
    1. 过滤文档类内容（设计师场景，默认开启）
    2. 检测查询意图（颜色、物体、风格）
    3. 对于视觉属性查询：
       - 优先返回所有视觉属性匹配的结果（即使相似度较低）
       - 然后补充其他高质量结果
    4. 对于非视觉查询：
       - 使用常规阈值过滤
    5. （可选）使用大模型做结果二次审阅：
       - 看一眼前 N 条结果是否真的符合本次查询
       - 输出需要保留 / 过滤 / 提升优先级的索引
    
    Args:
        results: 排序后的搜索结果列表
        query: 查询文本
        filter_mode: 过滤模式
        max_results: 最大返回数量
        filter_docs: 是否过滤文档类内容（默认True）
    
    Returns:
        过滤后的结果列表
    """
    if not results:
        return []
    
    # 步骤1: 过滤文档类内容（设计师场景）
    results = filter_doc_items(results, filter_docs=filter_docs)
    
    if not results:
        print("[SmartFilter] All results filtered out (doc content)")
        return []
    
    # 步骤1.5: 提升设计师网站的优先级（在过滤文档之后，排序之前）
    results = boost_designer_sites(results, boost_factor=0.15)
    
    # 检测查询意图（支持AI增强）
    # 优先使用混合策略：规则式 + AI增强（如果可用）
    try:
        from .ai_intent_enhance import hybrid_intent_detection
        # 使用混合意图检测（规则式 + AI，超时2秒）
        enhanced_intent = await hybrid_intent_detection(
            query,
            use_ai=True,
            ai_timeout=2.0,
            cache={}  # 可以传入外部缓存
        )
        
        # 转换为兼容格式
        query_intent = {
            "has_color": len(enhanced_intent.get("extracted_info", {}).get("colors", [])) > 0,
            "has_object": len(enhanced_intent.get("extracted_info", {}).get("objects", [])) > 0,
            "has_style": len(enhanced_intent.get("extracted_info", {}).get("styles", [])) > 0,
            "is_visual_query": enhanced_intent.get("query_type") in ["visual", "object", "color", "style"],
            "colors": enhanced_intent.get("extracted_info", {}).get("colors", []),
            "objects": enhanced_intent.get("extracted_info", {}).get("objects", []),
            "styles": enhanced_intent.get("extracted_info", {}).get("styles", []),
            "ai_enhanced": enhanced_intent.get("ai_enhanced", False),
            "enhanced_query": enhanced_intent.get("enhanced_query", query),
        }
        
        if query_intent.get("ai_enhanced"):
            print(f"[SmartFilter] Query intent (AI-enhanced): {query_intent}")
        else:
            print(f"[SmartFilter] Query intent (rule-based): {query_intent}")
    except Exception as e:
        # AI增强失败，回退到规则式方法
        print(f"[SmartFilter] AI enhancement failed: {e}, using rule-based")
        query_intent = detect_query_intent(query)
        query_intent["ai_enhanced"] = False
        print(f"[SmartFilter] Query intent (rule-based): {query_intent}")
    
    # ===== 步骤3：根据意图做第一层规则过滤（视觉 / 非视觉） =====

    if query_intent["is_visual_query"]:
        # 视觉属性查询：使用智能过滤
        print(f"[SmartFilter] Visual query detected: colors={query_intent['colors']}, objects={query_intent['objects']}, styles={query_intent['styles']}")
        
        # 先进行视觉属性匹配过滤
        visual_filtered = smart_filter_by_visual_attributes(
            results,
            query_intent,
            min_similarity=0.10,  # 降低最低相似度阈值：确保有结果返回
        )
        
        # 如果视觉匹配的结果很多，优先返回它们（先得到一个 candidate 列表）
        if len(visual_filtered) > 0:
            candidate_results = visual_filtered[:max_results] if max_results is not None else visual_filtered
        else:
            candidate_results = []
    else:
        # 非视觉查询或视觉匹配结果为空：使用常规阈值过滤
        print(f"[SmartFilter] Using standard threshold filtering")
        candidate_results = filter_by_threshold(results, mode=filter_mode, max_results=max_results)

    if not candidate_results:
        return candidate_results

    # ===== 步骤4：使用视觉语言模型（VL）对候选结果做二次审阅（看图片内容判断） =====
    try:
        from .ai_intent_enhance import validate_search_results_with_vl

        # 只让 VL 看前 top_n 条（降低成本），但可以影响整个列表
        top_n = min(len(candidate_results), 12)
        ai_view = await validate_search_results_with_vl(query, candidate_results, top_n=top_n)

        if ai_view.get("ai_validated"):
            relevant = set(ai_view.get("relevant_indices", []))
            to_filter = set(ai_view.get("filter_out_indices", []))
            to_boost = set(ai_view.get("boost_indices", []))

            print(
                f"[SmartFilter] AI result review: relevant={len(relevant)}, "
                f"filter_out={len(to_filter)}, boost={len(to_boost)}"
            )

            # 4.1 先根据 AI 的建议过滤 / 保留
            adjusted: List[Dict] = []
            filtered_by_ai = 0
            kept_by_ai = 0
            
            for idx, item in enumerate(candidate_results):
                # AI 明确说要过滤的，直接丢掉
                if idx in to_filter:
                    item["ai_filtered"] = True
                    item["ai_filter_reason"] = "llm_suggested"
                    filtered_by_ai += 1
                    continue

                # ✅ 简化逻辑：只过滤 AI 明确标记为不相关的结果
                # 如果 AI 给了 relevant 列表，优先保留这些；但如果没有，也保留其他结果（除非明确标记为 to_filter）
                if relevant and len(relevant) > 0:
                    # AI 明确指定了相关结果，优先保留这些
                    if idx in relevant:
                        adjusted.append(item)
                        kept_by_ai += 1
                    else:
                        # 不在 relevant 列表中，但也不在 to_filter 中，仍然保留（放宽过滤）
                        # 只过滤明确标记为 to_filter 的结果
                        adjusted.append(item)
                        kept_by_ai += 1
                else:
                    # AI 没有给出 relevant 列表（验证失败或返回空），保留所有（除了明确要过滤的）
                    adjusted.append(item)
                    kept_by_ai += 1

            if not adjusted:
                # 如果 AI 结果太严格导致空列表，就退回到原始候选
                print(f"[SmartFilter] ⚠️  AI filtering too strict (filtered all), falling back to original candidates")
                adjusted = candidate_results
            else:
                print(f"[SmartFilter] AI filtering: kept {kept_by_ai}, filtered {filtered_by_ai} items")

            # 4.2 对需要 boost 的结果做轻微加权
            for idx in to_boost:
                if 0 <= idx < len(adjusted):
                    item = adjusted[idx]
                    score = float(item.get("similarity", 0.0) or 0.0)
                    boosted_score = min(1.0, score + 0.05)
                    item["similarity"] = boosted_score
                    item["ai_boost"] = True

            # 4.3 重新按 similarity 排序
            adjusted.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
            candidate_results = adjusted
    except Exception as e:
        # AI 验证失败时，直接使用规则结果
        print(f"[SmartFilter] AI result validation failed: {e}")

    # ===== 步骤5：根据质量阈值打标签（high / medium / low），并返回 =====
    thresholds = QUALITY_THRESHOLDS[filter_mode]
    for item in candidate_results:
        score = item.get("similarity", 0.0)
        if score >= thresholds["high"]:
            item["quality"] = "high"
        elif score >= thresholds["medium"]:
            item["quality"] = "medium"
        else:
            item["quality"] = "low"

    return candidate_results

