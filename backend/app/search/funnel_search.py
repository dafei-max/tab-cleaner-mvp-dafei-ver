"""
三阶段漏斗搜索模块
1. 粗召回（Multi-Recall）：多路径召回 100-200 个候选
2. 精排序（Re-Ranking）：融合 5 路分数
3. 动态过滤（Threshold Filtering）：根据质量动态返回 1-20 个结果
"""
from typing import List, Dict, Optional, Tuple
import asyncio
from .threshold_filter import FilterMode, filter_by_threshold
from .smart_filter import smart_filter
from .embed import embed_text, embed_image
from .fuse import cosine_similarity, fuse_similarity_scores
from .rank import fuzzy_score
from .query_enhance import enhance_visual_query
import sys
from pathlib import Path

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from vector_db import (
    get_pool,
    ACTIVE_TABLE,
    NAMESPACE,
    _normalize_user_id,
    to_vector_str,
    _row_to_dict,
)
import asyncpg


# 五路分数权重配置（从 fusion_weights 模块导入，可配置）
from .fusion_weights import FUSION_WEIGHTS
from .config import MIN_SIMILARITY_THRESHOLD, IMAGE_EMBEDDING_THRESHOLD, CAPTION_RANK_THRESHOLD


async def _coarse_recall_text_vector(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 50,
) -> List[Dict]:
    """
    路径1: 文本向量搜索
    
    Args:
        user_id: 用户ID
        query_text: 查询文本
        top_k: 召回数量
    
    Returns:
        搜索结果列表（包含 similarity 字段）
    """
    # ✅ 已禁用：AI 搜索功能已移除，向量搜索不再使用
    print(f"[Funnel] Text vector recall: disabled (AI search removed)")
    return []


async def _coarse_recall_image_vector(
    user_id: Optional[str],
    query_image_url: Optional[str] = None,
    query_image_base64: Optional[str] = None,
    top_k: int = 50,
) -> List[Dict]:
    """
    路径2: 图像向量搜索
    
    Args:
        user_id: 用户ID
        query_image_url: 查询图像URL
        query_image_base64: 查询图像Base64
        top_k: 召回数量
    
    Returns:
        搜索结果列表（包含 similarity 字段）
    """
    # ✅ 已禁用：AI 搜索功能已移除，向量搜索不再使用
    print(f"[Funnel] Image vector recall: disabled (AI search removed)")
    return []


async def _coarse_recall_text_to_image_vector(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 60,
) -> List[Dict]:
    """
    路径2b: 文本→图像 向量搜索（Multi-modal）
    
    使用统一的 qwen2.5-vl-embedding 向量空间：
    - 将文本查询 embed 成向量
    - 在 image_embedding 列上做相似度搜索（文本搜图）
    
    Args:
        user_id: 用户ID
        query_text: 文本查询
        top_k: 召回数量
    """
    # ✅ 已禁用：AI 搜索功能已移除，向量搜索不再使用
    print(f"[Funnel] Text→Image vector recall: disabled (AI search removed)")
    return []


async def _coarse_recall_caption_embedding(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 60,
) -> List[Dict]:
    """
    路径2a: Caption Embedding 向量搜索（语义搜索）
    
    使用统一的 qwen2.5-vl-embedding 向量空间：
    - 将查询文本 embed 成向量
    - 在 caption_embedding 列上做相似度搜索（Caption语义搜索）
    
    优势：比关键词搜索更智能，能理解语义相似性（如"椅子"可以匹配"chair"、"seating"等）
    
    Args:
        user_id: 用户ID
        query_text: 文本查询
        top_k: 召回数量
    
    Returns:
        搜索结果列表（包含 similarity 字段）
    """
    # ✅ 已禁用：AI 搜索功能已移除，向量搜索不再使用
    print(f"[Funnel] Caption embedding recall: disabled (AI search removed)")
    return []


async def _coarse_recall_caption_keyword(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 50,
) -> List[Dict]:
    """
    路径2b: Caption 关键词搜索（全文搜索）
    
    ✅ 使用 jieba 分词器优化中文查询
    
    Args:
        user_id: 用户ID
        query_text: 查询文本
        top_k: 召回数量
    
    Returns:
        搜索结果列表
    """
    try:
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        
        # ✅ 使用 jieba 分词器处理中文查询
        keywords = []
        try:
            import jieba
            # 检查是否为中文查询（包含中文字符）
            has_chinese = any('\u4e00' <= ch <= '\u9fff' for ch in query_text)
            
            if has_chinese:
                # 中文查询：使用 jieba 分词
                # 搜索模式：适合搜索场景，会分词更细
                keywords = list(jieba.cut_for_search(query_text))
                # 过滤掉停用词和单字符（除非是查询本身）
                keywords = [kw.strip() for kw in keywords if len(kw.strip()) > 1 or kw.strip() == query_text.strip()]
                keywords = list(set(keywords))  # 去重
                
                if keywords:
                    print(f"[Funnel] Jieba segmented query '{query_text}' → {keywords}")
                else:
                    # 如果分词失败，回退到原始查询
                    keywords = [query_text]
            else:
                # 英文查询：使用空格分词
                keywords = query_text.lower().split()
        except ImportError:
            # jieba 未安装，回退到简单分词
            print("[Funnel] Warning: jieba not installed, falling back to simple tokenization")
            keywords = query_text.split()
        
        # 如果没有关键词，使用原始查询
        if not keywords:
            keywords = [query_text]
        
        # 判断是否为中文/多语言查询
        from string import ascii_letters, digits
        def _has_non_ascii(s: str) -> bool:
            allowed = set(ascii_letters + digits + " _-")
            return any(ch not in allowed for ch in s)
        
        use_simple = _has_non_ascii(query_text)
        ts_config = "simple" if use_simple else "english"
        
        async with pool.acquire() as conn:
            # 检查是否有 image_caption 字段
            has_caption_field = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = 'opengraph_items_v2'
                      AND column_name = 'image_caption'
                );
            """)
            
            if not has_caption_field:
                # 降级到 metadata 查询
                # ✅ 使用 jieba 分词后的关键词进行 ILIKE 查询（参数化，防止 SQL 注入）
                keyword_conditions_list = []
                params = [normalized_user]
                param_idx = 2
                
                for kw in keywords:
                    keyword_conditions_list.append(f"metadata->>'caption' ILIKE '%' || ${param_idx} || '%'")
                    params.append(kw)
                    param_idx += 1
                
                keyword_conditions_sql = " OR ".join(keyword_conditions_list)
                
                # 完全匹配原始查询的优先级更高
                full_match_idx = param_idx
                full_match_condition = f"metadata->>'caption' ILIKE '%' || ${full_match_idx} || '%'"
                params.append(query_text)
                param_idx += 1

                # LIMIT 使用单独的参数索引
                limit_idx = param_idx
                params.append(top_k)
                param_idx += 1
                
                rows = await conn.fetch(f"""
                    SELECT user_id, url, title, description, image, site_name,
                           tab_id, tab_title, metadata,
                           CASE 
                               WHEN {full_match_condition} THEN 1.0
                               ELSE 0.5
                           END AS rank
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1
                      AND metadata ? 'caption'
                      AND metadata->>'caption' IS NOT NULL
                      AND metadata->>'caption' != ''
                      AND ({keyword_conditions_sql})
                    ORDER BY rank DESC, metadata->>'caption'
                    LIMIT ${limit_idx};
                """, *params)
            else:
                # ✅ 使用 jieba 分词后的关键词进行 ILIKE 查询（参数化，防止 SQL 注入）
                keyword_conditions_list = []
                params = [normalized_user]
                param_idx = 2
                
                for kw in keywords:
                    keyword_conditions_list.append(f"image_caption ILIKE '%' || ${param_idx} || '%'")
                    params.append(kw)
                    param_idx += 1
                
                keyword_conditions_sql = " OR ".join(keyword_conditions_list)
                
                # 完全匹配原始查询的优先级更高
                full_match_idx = param_idx
                full_match_condition = f"image_caption ILIKE '%' || ${full_match_idx} || '%'"
                params.append(query_text)
                param_idx += 1

                # LIMIT 使用单独的参数索引
                limit_idx = param_idx
                params.append(top_k)
                param_idx += 1
                
                rows = await conn.fetch(f"""
                    SELECT user_id, url, title, description, image, site_name,
                           tab_id, tab_title, metadata,
                           image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
                           CASE 
                               WHEN {full_match_condition} THEN 1.0
                               ELSE 0.5
                           END AS rank
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $1
                      AND image_caption IS NOT NULL
                      AND image_caption != ''
                      AND ({keyword_conditions_sql})
                    ORDER BY rank DESC, image_caption
                    LIMIT ${limit_idx};
                """, *params)
            
            # 统一处理两个分支的结果，应用 rank 阈值过滤
            results = []
            for row in rows:
                item = dict(row)
                # 归一化 rank 到 [0, 1]（确保转换为 float）
                rank = item.get("rank", 0.0)
                caption_similarity = min(float(rank), 1.0)
                
                # Caption 关键词路径：使用更严格的阈值（60%），过滤掉 rank < 0.6 的结果
                # rank 为 0.5（部分匹配）或 1.0（完全匹配），所以 0.6 阈值会过滤掉部分匹配的结果
                if caption_similarity < CAPTION_RANK_THRESHOLD:
                    continue  # 跳过 rank 太低的结果
                
                item["caption_similarity"] = caption_similarity
                item["recall_path"] = "caption_keyword"
                results.append(item)
            
            print(f"[Funnel] Caption keyword recall: found {len(results)} results (after rank threshold >= {CAPTION_RANK_THRESHOLD}) for user_id={user_id}")
            return results
    except Exception as e:
        print(f"[Funnel] Error in caption keyword recall: {e}")
        import traceback
        traceback.print_exc()
        return []


async def _coarse_recall_designer_sites(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 100,
) -> List[Dict]:
    """
    路径5: 设计师网站专门召回（小红书、Pinterest、Behance等）
    
    专门针对设计师网站进行向量搜索，确保尽可能多地召回这些网站的内容
    
    Args:
        user_id: 用户ID
        query_text: 查询文本
        top_k: 召回数量（默认100，比其他路径更多）
    
    Returns:
        搜索结果列表
    """
    try:
        from .embed import embed_text
        query_vec = await embed_text(query_text)
        if not query_vec:
            return []
        
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        query_vec_str = to_vector_str(query_vec)
        
        # 设计师网站列表
        designer_sites = [
            "pinterest.com", "xiaohongshu.com", "behance.net", "dribbble.com",
            "zcool.com.cn", "ui.cn", "uisdc.com", "youzhan.com",
            "unsplash.com", "pexels.com", "pixabay.com", "freepik.com",
            "shutterstock.com", "gettyimages.com", "deviantart.com",
            "artstation.com", "500px.com", "flickr.com", "imgur.com",
            "tumblr.com", "arena.com", "muzli.com", "designspiration.com",
            "awwwards.com", "siteinspire.com", "land-book.com",
            "onepagelove.com", "collectui.com", "mobbin.com",
        ]
        
        async with pool.acquire() as conn:
            # 优先使用 image_embedding（设计师网站主要是图片）
            # 使用参数化查询，避免 SQL 注入
            # 构建 LIKE 条件列表
            site_like_conditions = []
            params = [query_vec_str, normalized_user, IMAGE_EMBEDDING_THRESHOLD]  # $1, $2, $3 (设计师网站主要用 image embedding，使用更宽松的阈值)
            param_idx = 4  # 从 $4 开始
            
            for site in designer_sites:
                site_like_conditions.append(f"url LIKE ${param_idx}")
                params.append(f"%{site}%")
                param_idx += 1
            
            site_conditions_sql = " OR ".join(site_like_conditions)
            
            query_sql = f"""
                SELECT user_id, url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata,
                       image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
                       CASE 
                           WHEN image_embedding IS NOT NULL THEN 
                               1 - (image_embedding <=> $1::vector(1024))
                           ELSE 
                               1 - (text_embedding <=> $1::vector(1024))
                       END AS similarity
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $2
                  AND ({site_conditions_sql})
                  AND (
                      (image_embedding IS NOT NULL AND 1 - (image_embedding <=> $1::vector(1024)) >= $3)
                      OR 
                      (text_embedding IS NOT NULL AND 1 - (text_embedding <=> $1::vector(1024)) >= $3)
                  )
                ORDER BY similarity DESC
                LIMIT ${param_idx};
            """
            
            params.append(top_k)  # 添加 LIMIT 参数
            
            rows = await conn.fetch(query_sql, *params)  # threshold=0.0，尽可能多召回
            
            results = []
            for row in rows:
                item = _row_to_dict(row)
                item["recall_path"] = "designer_sites"
                item["designer_site_boost"] = True
                results.append(item)
            
            print(f"[Funnel] Designer sites recall: found {len(results)} results for user_id={user_id}")
            return results
    except Exception as e:
        print(f"[Funnel] Error in designer sites recall: {e}")
        import traceback
        traceback.print_exc()
        return []


async def _coarse_recall_visual_attributes(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 50,
) -> List[Dict]:
    """
    路径4: 颜色/风格标签搜索
    
    Args:
        user_id: 用户ID
        query_text: 查询文本
        top_k: 召回数量
    
    Returns:
        搜索结果列表
    """
    try:
        # 提取视觉属性（颜色、风格）
        visual_attrs = enhance_visual_query(query_text)
        colors = visual_attrs.get("colors", [])
        styles = visual_attrs.get("styles", [])
        
        if not colors and not styles:
            return []
        
        pool = await get_pool()
        normalized_user = _normalize_user_id(user_id)
        
        async with pool.acquire() as conn:
            # 检查是否有新字段
            has_new_fields = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = 'opengraph_items_v2'
                      AND column_name = 'dominant_colors'
                );
            """)
            
            if not has_new_fields:
                return []
            
            # 构建查询条件
            conditions = []
            params = [normalized_user]
            param_idx = 2
            
            if colors:
                # ✅ 增强颜色匹配：支持同义词匹配
                # 例如：查询"黄色"时，应该匹配 "yellow", "gold", "amber", "lemon" 等
                color_conditions = []
                
                # 颜色同义词映射（确保所有同义词都能匹配）
                COLOR_SYNONYMS = {
                    "yellow": ["yellow", "gold", "amber", "lemon", "golden"],
                    "gold": ["yellow", "gold", "amber", "lemon", "golden"],
                    "amber": ["yellow", "gold", "amber", "lemon", "golden"],
                    "lemon": ["yellow", "gold", "amber", "lemon", "golden"],
                    "blue": ["blue", "azure", "navy", "cobalt", "sky blue"],
                    "azure": ["blue", "azure", "navy", "cobalt", "sky blue"],
                    "navy": ["blue", "azure", "navy", "cobalt", "sky blue"],
                    "red": ["red", "crimson", "scarlet", "burgundy"],
                    "crimson": ["red", "crimson", "scarlet", "burgundy"],
                    "green": ["green", "emerald", "olive", "lime"],
                    "emerald": ["green", "emerald", "olive", "lime"],
                    "orange": ["orange", "tangerine", "coral"],
                    "purple": ["purple", "violet", "lavender", "plum"],
                    "pink": ["pink", "rose", "blush", "magenta"],
                }
                
                # 收集所有需要匹配的颜色（包括同义词）
                all_colors_to_match = set()
                for color in colors:
                    color_lower = color.lower()
                    all_colors_to_match.add(color_lower)
                    # 添加同义词
                    if color_lower in COLOR_SYNONYMS:
                        all_colors_to_match.update(COLOR_SYNONYMS[color_lower])
                
                # 为每个颜色（包括同义词）创建匹配条件
                for color_to_match in all_colors_to_match:
                    color_conditions.append(f"${param_idx} = ANY(dominant_colors)")
                    params.append(color_to_match)
                    param_idx += 1
                
                if color_conditions:
                    conditions.append(f"({' OR '.join(color_conditions)})")
            
            if styles:
                # 风格匹配
                style_conditions = []
                for style in styles:
                    style_conditions.append(f"${param_idx} = ANY(style_tags)")
                    params.append(style.lower())
                    param_idx += 1
                conditions.append(f"({' OR '.join(style_conditions)})")
            
            if not conditions:
                return []
            
            where_clause = " AND ".join(conditions)
            params.append(top_k)
            
            # ✅ 简化：直接使用数组交集操作符计算 visual_score
            # 如果 dominant_colors 与查询颜色有交集，给高分
            if colors:
                # 使用 all_colors_to_match（包含同义词）构建数组
                color_array_str = ','.join([f"'{c}'" for c in all_colors_to_match])
                color_score_case = f"WHEN dominant_colors && ARRAY[{color_array_str}]::TEXT[] THEN 0.7 ELSE 0.0"
            else:
                color_score_case = "0.0"
            
            if styles:
                style_array_str = ','.join([f"'{s.lower()}'" for s in styles])
                style_score_case = f"WHEN style_tags && ARRAY[{style_array_str}]::TEXT[] THEN 0.3 ELSE 0.0"
            else:
                style_score_case = "0.0"
            
            query = f"""
                SELECT user_id, url, title, description, image, site_name,
                       tab_id, tab_title, metadata,
                       image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
                       CASE {color_score_case} END +
                       CASE {style_score_case} END AS visual_score
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $1
                  AND ({where_clause})
                ORDER BY visual_score DESC
                LIMIT ${param_idx};
            """
            
            rows = await conn.fetch(query, *params)
            
            results = []
            for row in rows:
                item = dict(row)
                # 确保转换为 float
                visual_score = item.get("visual_score", 0.0)
                item["visual_attributes_score"] = float(visual_score) if visual_score is not None else 0.0
                item["recall_path"] = "visual_attributes"
                results.append(item)
            
            print(f"[Funnel] Visual attributes recall: found {len(results)} results for user_id={user_id}")
            return results
    except Exception as e:
        print(f"[Funnel] Error in visual attributes recall: {e}")
        import traceback
        traceback.print_exc()
        return []


async def _fine_ranking(
    candidates: List[Dict],
    query_text: str,
    query_text_vec: Optional[List[float]] = None,
    query_image_vec: Optional[List[float]] = None,
) -> List[Dict]:
    """
    精排序：融合 5 路分数 + 严格过滤不相关结果
    
    五路分数：
    1. 文本相似度 (15%)
    2. 图像相似度 (35%)
    3. Caption 相似度 (20%)
    4. 关键词匹配 (15%)
    5. 视觉属性匹配 (15%)
    
    过滤机制：
    1. 标签匹配度检查（如果查询有明确的视觉属性，结果必须有匹配的标签）
    2. 最低相似度阈值（融合分数太低直接过滤）
    3. 纯色图片/代码截图检测（通过标题/描述判断）
    
    Args:
        candidates: 候选结果列表
        query_text: 查询文本
        query_text_vec: 查询文本向量（可选，如果未提供会计算）
        query_image_vec: 查询图像向量（可选）
    
    Returns:
        排序后的结果列表（包含 similarity 字段）
    """
    if not candidates:
        return []
    
    # 提取查询的视觉属性，用于精排序阶段的标签匹配检查
    from .query_enhance import enhance_visual_query
    visual_attrs = enhance_visual_query(query_text)
    query_colors = [c.lower() for c in visual_attrs.get("colors", [])]
    query_objects = [o.lower() for o in visual_attrs.get("objects", [])]
    query_styles = [s.lower() for s in visual_attrs.get("styles", [])]
    
    # 精排序阶段的最低相似度阈值（只过滤明显不相关的结果）
    MIN_FINE_RANKING_SIMILARITY = 0.10  # 10%，降低阈值，避免误过滤相关结果
    
    # 如果未提供文本向量，计算它
    if query_text_vec is None and query_text:
        try:
            query_text_vec = await embed_text(query_text)
        except Exception as e:
            print(f"[Funnel] Error computing query text vector: {e}")
            query_text_vec = None
    
    # 合并结果（去重）
    merged = {}  # url -> item
    
    for item in candidates:
        url = item.get("url")
        if not url:
            continue
        
        if url not in merged:
            merged[url] = {
                "text_similarity": 0.0,
                "image_similarity": 0.0,
                "caption_similarity": 0.0,
                "keyword_score": 0.0,
                "visual_attributes_score": 0.0,
                "recall_paths": set(),
            }
            # 复制原始字段
            for key, value in item.items():
                if key not in ["text_similarity", "image_similarity", "caption_similarity", 
                              "keyword_score", "visual_attributes_score", "similarity", 
                              "recall_path", "recall_paths"]:
                    merged[url][key] = value
        
        # 合并分数（确保转换为 float）
        merged[url]["text_similarity"] = max(
            merged[url]["text_similarity"],
            float(item.get("text_similarity", 0.0) or 0.0)
        )
        merged[url]["image_similarity"] = max(
            merged[url]["image_similarity"],
            float(item.get("image_similarity", 0.0) or 0.0)
        )
        merged[url]["caption_similarity"] = max(
            merged[url]["caption_similarity"],
            float(item.get("caption_similarity", 0.0) or 0.0)
        )
        merged[url]["visual_attributes_score"] = max(
            merged[url]["visual_attributes_score"],
            float(item.get("visual_attributes_score", 0.0) or 0.0)
        )
        merged[url]["recall_paths"].add(item.get("recall_path", "unknown"))
        
        # 计算关键词匹配分数
        title = item.get("title", "")
        description = item.get("description", "")
        # 处理 metadata（可能是 dict 或 str）
        metadata = item.get("metadata", {})
        if isinstance(metadata, str):
            import json
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        caption = item.get("image_caption") or (metadata.get("caption", "") if isinstance(metadata, dict) else "")
        
        keyword_score = fuzzy_score(query_text, title, f"{description} {caption}")
        merged[url]["keyword_score"] = max(merged[url]["keyword_score"], float(keyword_score))
    
    # 计算融合分数 + 严格过滤
    results = []
    filtered_count = 0
    filter_reasons = {
        "low_similarity": 0,
        "tag_mismatch": 0,
        "no_tags": 0,
        "irrelevant_content": 0,
    }
    
    for url, item in merged.items():
        # 如果缺少向量相似度，尝试计算
        if query_text_vec and item.get("text_embedding") and item["text_similarity"] == 0.0:
            try:
                text_vec = item.get("text_embedding")
                # ✅ 修复：处理 text_embedding 可能是字符串的情况
                if isinstance(text_vec, str):
                    # 尝试解析字符串（可能是 JSON 格式的数组）
                    import json
                    try:
                        text_vec = json.loads(text_vec)
                    except:
                        # 如果不是 JSON，可能是 PostgreSQL 数组格式，跳过
                        text_vec = None
                
                if isinstance(text_vec, list) and len(text_vec) > 0:
                    item["text_similarity"] = max(
                        item["text_similarity"],
                        cosine_similarity(query_text_vec, text_vec)
                    )
            except Exception as e:
                print(f"[Funnel] Error computing text similarity for {url}: {e}")
        
        if query_image_vec and item.get("image_embedding") and item["image_similarity"] == 0.0:
            try:
                image_vec = item.get("image_embedding")
                # ✅ 修复：处理 image_embedding 可能是字符串的情况
                if isinstance(image_vec, str):
                    import json
                    try:
                        image_vec = json.loads(image_vec)
                    except:
                        image_vec = None
                
                if isinstance(image_vec, list) and len(image_vec) > 0:
                    item["image_similarity"] = max(
                        item["image_similarity"],
                        cosine_similarity(query_image_vec, image_vec)
                    )
            except Exception as e:
                print(f"[Funnel] Error computing image similarity for {url}: {e}")
        
        # 融合五路分数
        weights = FUSION_WEIGHTS
        fused_score = (
            weights["text_similarity"] * item["text_similarity"] +
            weights["image_similarity"] * item["image_similarity"] +
            weights["caption_similarity"] * item["caption_similarity"] +
            weights["keyword_match"] * item["keyword_score"] +
            weights["visual_attributes"] * item["visual_attributes_score"]
        )
        
        item["similarity"] = fused_score
        
        # ========== 精排序阶段智能过滤 ==========
        # 策略：只过滤明显不相关的结果，保留有匹配标签的结果
        should_filter = False
        filter_reason = ""
        
        # 先检查标签匹配情况（用于判断是否应该保留）
        item_colors = item.get("dominant_colors", []) or []
        item_objects = item.get("object_tags", []) or []
        item_styles = item.get("style_tags", []) or []
        
        # 转换为小写列表
        if isinstance(item_colors, list):
            item_colors = [str(c).lower() for c in item_colors if c]
        else:
            item_colors = []
        
        if isinstance(item_objects, list):
            item_objects = [str(o).lower() for o in item_objects if o]
        else:
            item_objects = []
        
        if isinstance(item_styles, list):
            item_styles = [str(s).lower() for s in item_styles if s]
        else:
            item_styles = []
        
        # 检查是否有匹配的标签（如果有匹配，应该保留）
        has_color_match = any(qc in item_colors for qc in query_colors) if query_colors else False
        has_object_match = any(qo in item_objects for qo in query_objects) if query_objects else False
        has_style_match = any(qs in item_styles for qs in query_styles) if query_styles else False
        has_any_match = has_color_match or has_object_match or has_style_match
        
        # 1. 不相关内容检测（纯色图片、代码截图等）- 最严格，直接过滤
        title = (item.get("title") or item.get("tab_title") or "").lower()
        description = (item.get("description") or "").lower()
        caption = (item.get("image_caption") or "").lower()
        all_text = f"{title} {description} {caption}".lower()
        
        # 检测纯色图片关键词（排除查询颜色本身，比如查询"绿色"时，"green"不应该被过滤）
        solid_color_keywords = [
            "solid", "pure", "blank", "纯色", "纯白", "纯黑", "纯红", "空白", "单色",
        ]
        # 如果标题明确说是"纯色"或"空白"，且融合分数很低，过滤掉
        if any(kw in all_text for kw in solid_color_keywords) and fused_score < 0.15:
            should_filter = True
            filter_reason = "irrelevant_content"
        
        # 检测代码/开发环境关键词
        code_keywords = [
            "codesandbox", "terminal", "editor", "code", "programming", "git",
            "localhost", "npm", "yarn", "build", "compile", "debug",
            "代码", "编程", "开发", "编辑器", "终端",
        ]
        if any(kw in all_text for kw in code_keywords) and fused_score < 0.15:
            should_filter = True
            filter_reason = "irrelevant_content"
        
        # 2. 如果有匹配的标签（颜色/物体/风格），即使融合分数稍低也保留
        # 例如：查询"绿色植物"，结果有"green"颜色标签，应该保留
        if has_any_match:
            # 有匹配标签的结果，降低过滤阈值，更宽松
            if fused_score < 0.08:  # 只有非常低的分才过滤
                should_filter = True
                filter_reason = "low_similarity_with_match"
        else:
            # 没有匹配标签的结果，应用更严格的阈值
            # 3. 最低相似度阈值检查（只对没有匹配标签的结果应用）
            if fused_score < MIN_FINE_RANKING_SIMILARITY:
                should_filter = True
                filter_reason = "low_similarity"
            
            # 4. 如果查询有明确的视觉属性，但结果完全不匹配，且融合分数很低，过滤掉
            if (query_colors or query_objects) and fused_score < 0.15:
                should_filter = True
                filter_reason = "tag_mismatch"
        
        if should_filter:
            filtered_count += 1
            filter_reasons[filter_reason] = filter_reasons.get(filter_reason, 0) + 1
            continue
        
        item["recall_paths"] = list(item["recall_paths"])
        results.append(item)
    
    # 按融合分数排序
    results.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    
    if filtered_count > 0:
        print(f"[Funnel] Fine ranking filtered out {filtered_count} items:")
        for reason, count in filter_reasons.items():
            if count > 0:
                print(f"  - {reason}: {count}")
    
    return results


async def search_with_funnel(
    user_id: Optional[str],
    query_text: str,
    query_image_url: Optional[str] = None,
    query_image_base64: Optional[str] = None,
    filter_mode: FilterMode = FilterMode.BALANCED,
    max_results: Optional[int] = None,  # 改为可选，None表示不限制数量，只根据质量过滤
    use_caption: bool = True,
    filter_urls: Optional[List[str]] = None,  # ✅ 新增：只搜索这些 URL（Personal Space 中的 URL）
    filter_tab_ids: Optional[List[str]] = None,  # ✅ 新增：只搜索这些 tab_id（Personal Space 中的 tab_id）
) -> List[Dict]:
    """
    三阶段漏斗搜索
    
    Args:
        user_id: 用户ID
        query_text: 查询文本
        query_image_url: 查询图像URL（可选）
        query_image_base64: 查询图像Base64（可选）
        filter_mode: 过滤模式
        max_results: 最大返回数量
        use_caption: 是否使用 Caption 搜索
    
    Returns:
        搜索结果列表（根据质量阈值动态返回，不限制数量）
    """
    print(f"[Funnel] Starting funnel search for query: {query_text[:50]}...")
    
    # ✅ 已禁用：AI 增强查询流程
    # 现在只使用原始查询文本，不进行 AI 增强
    # 但保留从数据库获取 caption 并返回给本地的功能
    enhanced_query = query_text
    ai_enhanced = False
    enhanced_intent = None
    search_query = query_text
    print(f"[Funnel] ⚠️  AI enhancement disabled, using original query: '{query_text}'")
    
    # ========== 阶段 1: 粗召回（Multi-Recall） ==========
    print("[Funnel] Stage 1: Coarse Recall (Multi-Recall)")
    print(f"[Funnel] Using {'AI-enhanced' if ai_enhanced else 'original'} query: '{search_query[:50]}...'")
    print("[Funnel] Priority order: Image Vector / Text→Image > Caption Embedding > Caption Keyword > Visual Attributes > Designer Sites > Text Vector")
    
    recall_tasks = []
    
    # ✅ 优先级1: 图像向量搜索（有图像查询时）
    if query_image_url or query_image_base64:
        recall_tasks.append(_coarse_recall_image_vector(
            user_id, query_image_url, query_image_base64, top_k=80
        ))
    
    # ✅ 优先级1b: 文本→图像向量搜索（多模态文本搜图，始终开启）
    # 使用AI增强后的查询（如果可用）
    if search_query:
        recall_tasks.append(_coarse_recall_text_to_image_vector(
            user_id, search_query, top_k=80  # ✅ 使用增强后的查询
        ))
    
    # ✅ 检测是否是颜色查询
    from .query_enhance import enhance_visual_query
    visual_attrs = enhance_visual_query(query_text)
    is_color_query = len(visual_attrs.get("colors", [])) > 0
    
    # ✅ 如果是颜色查询，优先使用视觉属性搜索
    if is_color_query:
        print(f"[Funnel] 🎨 Color query detected: {visual_attrs.get('colors')}, prioritizing visual attributes search")
        # ✅ 优先级1c: 视觉属性搜索（颜色查询时优先级最高）
        recall_tasks.append(_coarse_recall_visual_attributes(user_id, search_query, top_k=100))  # ✅ 颜色查询时提高召回数量
    
    # ✅ 优先级2a: Caption Embedding 向量搜索（语义搜索，更智能）
    # 使用AI增强后的查询（如果可用）
    if use_caption and search_query:
        recall_tasks.append(_coarse_recall_caption_embedding(user_id, search_query, top_k=60))  # ✅ 使用增强后的查询
    
    # ✅ 优先级2b: Caption 关键词搜索（全文搜索，作为补充）
    # 同时使用原始查询和增强查询，提高召回率
    if use_caption:
        recall_tasks.append(_coarse_recall_caption_keyword(user_id, search_query, top_k=80))  # ✅ 使用增强后的查询
        # 如果AI增强成功，也尝试原始查询（可能包含更精确的关键词）
        if ai_enhanced and search_query != query_text:
            recall_tasks.append(_coarse_recall_caption_keyword(user_id, query_text, top_k=40))  # 原始查询作为补充
    
    # ✅ 优先级3: 视觉属性搜索（非颜色查询时使用，颜色查询时已在上面处理）
    if not is_color_query:
        recall_tasks.append(_coarse_recall_visual_attributes(user_id, search_query, top_k=50))  # ✅ 使用增强后的查询
    
    # ✅ 优先级4: 设计师网站专门召回（小红书、Pinterest、Behance等）
    recall_tasks.append(_coarse_recall_designer_sites(user_id, search_query, top_k=100))  # ✅ 使用增强后的查询
    
    # ✅ 优先级5: 文本向量搜索（最低优先级，作为补充）
    recall_tasks.append(_coarse_recall_text_vector(user_id, search_query, top_k=80))  # ✅ 使用增强后的查询
    
    # 并发执行所有召回路径
    recall_results = await asyncio.gather(*recall_tasks, return_exceptions=True)
    
    # 合并召回结果
    all_candidates = []
    for results in recall_results:
        if isinstance(results, Exception):
            print(f"[Funnel] Recall path error: {results}")
            continue
        all_candidates.extend(results)
    
    print(f"[Funnel] Coarse recall: {len(all_candidates)} candidates (before filtering)")
    
    # ✅ 修复：在粗召回阶段就过滤文档类内容（设计师场景）
    from .preprocess import is_doc_like
    from .query_enhance import enhance_visual_query
    
    # 提取查询的视觉属性（颜色、物体、风格），用于标签匹配过滤
    visual_attrs = enhance_visual_query(query_text)
    query_colors = [c.lower() for c in visual_attrs.get("colors", [])]
    query_objects = [o.lower() for o in visual_attrs.get("objects", [])]
    query_styles = [s.lower() for s in visual_attrs.get("styles", [])]
    
    doc_count = 0
    tag_mismatch_count = 0
    filtered_candidates = []
    seen_urls = set()  # 用于去重
    seen_titles = set()  # 用于去重相似标题
    original_count = len(all_candidates)  # 记录原始数量
    
    for item in all_candidates:
        url = item.get("url", "")
        title = (item.get("title") or item.get("tab_title") or "").strip()
        
        # 1. 检查是否是文档类内容
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
            continue  # 跳过文档类内容
        
        # 2. 标签匹配过滤：如果查询有明确的视觉属性（颜色/物体/风格），检查结果是否匹配
        # 例如：查询"植物"应该返回有 "plant" 标签或 "green" 颜色的结果
        # ⚠️ 特别说明：
        # - 对于「纯颜色查询」（只有颜色，没有物体/风格），这里不做 tag mismatch 过滤，
        #   只在后面用颜色标签做排序，避免把本来是黄色但被识别成 gold/amber 的卡片全过滤掉。
        pure_color_query = bool(query_colors) and not query_objects and not query_styles

        if (query_colors or query_objects or query_styles) and not pure_color_query:
            item_colors = item.get("dominant_colors", []) or []
            item_objects = item.get("object_tags", []) or []
            item_styles = item.get("style_tags", []) or []
            
            # 转换为小写列表（处理可能是字符串数组或 None 的情况）
            if isinstance(item_colors, list):
                item_colors = [str(c).lower() for c in item_colors if c]
            else:
                item_colors = []
            
            if isinstance(item_objects, list):
                item_objects = [str(o).lower() for o in item_objects if o]
            else:
                item_objects = []
            
            if isinstance(item_styles, list):
                item_styles = [str(s).lower() for s in item_styles if s]
            else:
                item_styles = []
            
            # 检查是否有匹配的标签
            has_color_match = False
            has_object_match = False
            has_style_match = False
            
            if query_colors:
                # ✅ 改进：优先检查主色（第一个颜色），避免黄绿色被误识别为黄色
                # 如果查询的是黄色，只匹配主色是黄色的（第一个颜色是yellow/gold/amber）
                has_color_match = False
                
                # 检查主色（第一个颜色）
                if item_colors and len(item_colors) > 0:
                    primary_color = item_colors[0].lower()
                    
                    # 对于黄色查询，严格匹配：主色必须是黄色系列
                    if any(qc.lower() in ["yellow", "gold", "amber", "lemon", "golden"] for qc in query_colors):
                        yellow_keywords = ["yellow", "gold", "amber", "lemon", "golden"]
                        if any(kw in primary_color for kw in yellow_keywords):
                            has_color_match = True
                        # 如果主色是绿色系列，明确排除（避免黄绿色被误识别）
                        elif any(kw in primary_color for kw in ["green", "emerald", "olive", "lime", "forestgreen"]):
                            has_color_match = False
                    # ✅ 新增：对于红色查询，严格匹配：主色必须是红色系列
                    elif any(qc.lower() in ["red", "crimson", "scarlet", "burgundy"] for qc in query_colors):
                        red_keywords = ["red", "crimson", "scarlet", "burgundy"]
                        if any(kw in primary_color for kw in red_keywords):
                            has_color_match = True
                        # 如果主色是黄色系列，明确排除（避免黄色被误识别为红色）
                        elif any(kw in primary_color for kw in ["yellow", "gold", "amber", "lemon", "golden"]):
                            has_color_match = False
                    else:
                        # 其他颜色查询：检查主色或任何颜色
                        has_color_match = any(qc.lower() in primary_color for qc in query_colors) or \
                                        any(qc.lower() in item_colors for qc in query_colors)
                
                # ✅ 新增：如果 dominant_colors 中没有匹配，检查 Caption 中是否包含颜色相关词汇
                if not has_color_match:
                    caption = (item.get("image_caption") or "").lower()
                    title = (item.get("title") or "").lower()
                    description = (item.get("description") or "").lower()
                    text_content = f"{title} {description} {caption}"
                    
                    # 颜色关键词映射（中英文）
                    color_keywords_map = {
                        "yellow": ["yellow", "gold", "amber", "lemon", "golden", "黄色", "金色", "金黄", "柠檬黄"],
                        "gold": ["yellow", "gold", "amber", "lemon", "golden", "金色", "金黄"],
                        "amber": ["yellow", "gold", "amber", "lemon", "golden", "琥珀", "黄色"],
                        "red": ["red", "crimson", "scarlet", "burgundy", "红色", "红", "赤"],
                        "blue": ["blue", "azure", "navy", "cobalt", "蓝色", "蓝", "天蓝", "海军蓝"],
                        "green": ["green", "emerald", "olive", "lime", "绿色", "绿", "翠绿"],
                        "orange": ["orange", "tangerine", "coral", "橙色", "橙", "橘"],
                        "purple": ["purple", "violet", "lavender", "紫色", "紫", "紫罗兰"],
                        "pink": ["pink", "rose", "blush", "magenta", "粉色", "粉", "玫瑰"],
                        "black": ["black", "dark", "ebony", "黑色", "黑"],
                        "white": ["white", "ivory", "snow", "白色", "白"],
                        "gray": ["gray", "grey", "silver", "charcoal", "灰色", "灰"],
                        "brown": ["brown", "saddlebrown", "sienna", "tan", "棕色", "棕", "褐色"],
                    }
                    
                    # 检查查询颜色对应的关键词是否在文本中
                    # ✅ 改进：同时检查是否有冲突颜色的关键词，如果有则排除
                    for qc in query_colors:
                        qc_lower = qc.lower()
                        if qc_lower in color_keywords_map:
                            keywords = color_keywords_map[qc_lower]
                            
                            # ✅ 新增：检查是否有冲突颜色的关键词
                            # 如果查询红色，但文本中包含黄色关键词，则不匹配
                            conflict_keywords = []
                            if qc_lower in ["red", "crimson", "scarlet", "burgundy"]:
                                conflict_keywords = ["yellow", "gold", "amber", "lemon", "golden", "黄色", "金色", "金黄"]
                            elif qc_lower in ["yellow", "gold", "amber", "lemon"]:
                                conflict_keywords = ["red", "crimson", "scarlet", "burgundy", "红色", "红", "赤"]
                            
                            # 如果文本中包含冲突颜色的关键词，明确排除
                            if conflict_keywords and any(kw in text_content for kw in conflict_keywords):
                                print(f"[Funnel] ❌ Caption冲突检测: 查询颜色 '{qc}' 但文本中包含冲突颜色关键词，排除")
                                has_color_match = False
                                break
                            
                            # 检查是否有匹配的关键词
                            if any(kw in text_content for kw in keywords):
                                has_color_match = True
                                print(f"[Funnel] ✅ Caption辅助匹配: 查询颜色 '{qc}' 在文本中找到相关词汇")
                                break
            
            if query_objects:
                # 检查是否有物体匹配（至少有一个查询物体在结果物体中）
                has_object_match = any(qo in item_objects for qo in query_objects)
            
            if query_styles:
                # 检查是否有风格匹配（至少有一个查询风格在结果风格中）
                has_style_match = any(qs in item_styles for qs in query_styles)
            
            # ✅ 简化：只检查明显冲突的情况，不再严格过滤
            # 对于物体/风格查询，如果没有标签匹配，不应该直接过滤，而是保留让 AI 判断
            # 只对明显冲突的颜色进行过滤
            COLOR_CONFLICTS = {
                "green": ["red", "crimson", "scarlet", "burgundy"],
                "emerald": ["red", "crimson", "scarlet", "burgundy"],
                "olive": ["red", "crimson", "scarlet", "burgundy"],
                "lime": ["red", "crimson", "scarlet", "burgundy"],
                "red": ["green", "emerald", "olive", "lime", "yellow", "gold", "amber", "lemon"],  # ✅ 新增：红色与黄色冲突
                "crimson": ["green", "emerald", "olive", "lime", "yellow", "gold", "amber", "lemon"],  # ✅ 新增：红色与黄色冲突
                "scarlet": ["green", "emerald", "olive", "lime", "yellow", "gold", "amber", "lemon"],  # ✅ 新增：红色与黄色冲突
                "burgundy": ["green", "emerald", "olive", "lime", "yellow", "gold", "amber", "lemon"],  # ✅ 新增：红色与黄色冲突
                "blue": ["orange", "tangerine", "coral"],
                "azure": ["orange", "tangerine", "coral"],
                "navy": ["orange", "tangerine", "coral"],
                "cobalt": ["orange", "tangerine", "coral"],
                "orange": ["blue", "azure", "navy", "cobalt"],
                "tangerine": ["blue", "azure", "navy", "cobalt"],
                "coral": ["blue", "azure", "navy", "cobalt"],
                "yellow": ["purple", "violet", "lavender", "red", "crimson", "scarlet", "burgundy"],  # ✅ 新增：黄色与红色冲突
                "gold": ["purple", "violet", "lavender", "red", "crimson", "scarlet", "burgundy"],  # ✅ 新增：黄色与红色冲突
                "amber": ["purple", "violet", "lavender", "red", "crimson", "scarlet", "burgundy"],  # ✅ 新增：黄色与红色冲突
                "lemon": ["purple", "violet", "lavender", "red", "crimson", "scarlet", "burgundy"],  # ✅ 新增：黄色与红色冲突
                "purple": ["yellow", "gold", "amber", "lemon"],
                "violet": ["yellow", "gold", "amber", "lemon"],
                "lavender": ["yellow", "gold", "amber", "lemon"],
            }
            
            has_color_conflict = False
            if query_colors and item_colors:
                # 检查查询颜色是否有冲突色，以及结果是否包含冲突色
                for qc in query_colors:
                    conflicts = COLOR_CONFLICTS.get(qc, [])
                    if any(conflict in item_colors for conflict in conflicts):
                        has_color_conflict = True
                        break
            
            # 如果查询有明确的视觉属性，但结果完全不匹配，则过滤掉
            # 规则1：如果查询明确指定了颜色，但结果是冲突颜色，直接过滤掉（最严格）
            # 规则2：如果查询有物体/颜色/风格，结果必须至少匹配其中一种
            should_filter = False
            filter_reason = ""
            
            # ✅ 简化过滤逻辑：只过滤明显冲突的情况
            # 对于物体查询（如"椅子"）和颜色+物体/风格混合查询，如果没有标签匹配，不应该直接过滤，而是保留让 AI 判断
            if has_color_conflict:
                # 颜色冲突：查询是绿色，但结果是红色（最严格，直接过滤）
                should_filter = True
                filter_reason = "color_conflict"
            # ✅ 放宽：对于物体查询，如果没有标签匹配，保留让 AI 判断（不再过滤）
            # elif query_objects and not has_object_match and not has_color_match:
            #     should_filter = True
            #     filter_reason = "object_mismatch"
            elif query_colors and item_colors and not has_color_match and not has_object_match:
                # 如果查询明确指定了颜色（如"绿色"），且结果有颜色标签但不是查询颜色，也没有相关物体，过滤掉
                # 注意：如果结果没有颜色标签，暂时不过滤（可能标签未生成）
                should_filter = True
                filter_reason = "color_mismatch_with_tags"
            # ✅ 放宽：对于颜色查询，如果没有颜色标签，保留让 AI 判断（不再过滤）
            # elif query_colors and not item_colors and not has_object_match:
            #     should_filter = True
            #     filter_reason = "color_mismatch_no_tags"
            # ✅ 放宽：对于风格查询，如果没有风格匹配，保留让 AI 判断（不再过滤）
            # elif query_styles and not has_style_match and not has_color_match and not has_object_match:
            #     should_filter = True
            #     filter_reason = "style_mismatch"
            
            if should_filter:
                tag_mismatch_count += 1
                continue
        
        # 3. 去重：基于 URL（标准化 URL，移除查询参数和锚点）
        normalized_url = None
        if url:
            # 标准化 URL（移除查询参数、锚点、尾随斜杠）
            try:
                from urllib.parse import urlparse, urlunparse
                parsed = urlparse(url)
                normalized_url = urlunparse((
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path.rstrip('/'),
                    '',  # params
                    '',  # query - 移除查询参数
                    ''   # fragment - 移除锚点
                )).lower()
            except:
                normalized_url = url.lower()
            
            if normalized_url in seen_urls:
                continue  # 跳过重复的 URL
            
            seen_urls.add(normalized_url)
        
        # 4. 去重：基于标题相似度（过滤重复的周会记录、工作台、小红书主页等）
        if title:
            # 标准化标题用于比较（移除特殊字符、空格、数字ID等）
            import re
            # 移除数字ID（如 _-1451008, _73823749, _45390241 等）
            title_clean = re.sub(r'[_-]\d+', '', title)
            # 移除特殊字符，只保留字母、数字、中文、空格、连字符
            normalized_title = "".join(c for c in title_clean if c.isalnum() or c in (' ', '-', '_', '，', '。')).strip().lower()
            
            # 特殊处理：小红书主页等通用标题（如"小红书_-_你的生活兴趣社区"）
            # 如果标题是通用标题且URL已存在，跳过
            generic_titles = [
                "小红书_-_你的生活兴趣社区",
                "xiaohongshu",
                "pinterest",
                "behance",
                "dribbble",
            ]
            is_generic_title = any(gt in normalized_title for gt in generic_titles)
            
            # 如果标题太相似（比如都是"20251117视觉设计部管理周会"或"面试官工作台"），只保留第一个
            if normalized_title in seen_titles:
                # 检查是否是重复的周会记录、工作台等，或者是通用标题
                if any(kw in normalized_title for kw in ["周会", "会议", "管理", "设计部", "工作台", "周报收纳"]) or is_generic_title:
                    continue  # 跳过重复的周会记录、工作台、通用标题等
            
            seen_titles.add(normalized_title)
        
        filtered_candidates.append(item)
    
    all_candidates = filtered_candidates
    
    if doc_count > 0:
        print(f"[Funnel] Filtered out {doc_count} doc items in coarse recall stage (designer-focused)")
    
    if tag_mismatch_count > 0:
        print(f"[Funnel] Filtered out {tag_mismatch_count} items with tag mismatch (query: colors={query_colors}, objects={query_objects}, styles={query_styles})")
    
    duplicate_count = original_count - len(all_candidates) - doc_count - tag_mismatch_count
    if duplicate_count > 0:
        print(f"[Funnel] Removed {duplicate_count} duplicate items")
    
    print(f"[Funnel] Coarse recall: {len(all_candidates)} unique candidates (after filtering, removed {doc_count} docs + {tag_mismatch_count} tag mismatches + {duplicate_count} duplicates)")
    
    if not all_candidates:
        print("[Funnel] ⚠️  No candidates found in recall stage")
        print("[Funnel] 💡  Possible reasons:")
        print("[Funnel]    1. No data in database for this user")
        print("[Funnel]    2. No embeddings generated")
        print("[Funnel]    3. User ID mismatch")
        print("[Funnel]    4. Query embedding generation failed")
        return []
    
    # ✅ 为粗召回结果统一设置 similarity 字段（取各路分数的最大值）
    # 这样 AI 筛选阶段可以基于 similarity 进行过滤
    for item in all_candidates:
        # 收集所有可能的相似度分数
        scores = []
        if "similarity" in item:
            scores.append(item["similarity"])
        if "text_similarity" in item:
            scores.append(item["text_similarity"])
        if "image_similarity" in item:
            scores.append(item["image_similarity"])
        if "caption_similarity" in item:
            scores.append(item["caption_similarity"])
        
        # 使用最大分数作为统一的 similarity（如果各路都有分数）
        if scores:
            item["similarity"] = max(scores)
        elif "similarity" not in item:
            # 如果没有找到任何分数，设置默认值（避免 AI 筛选阶段出错）
            item["similarity"] = 0.5  # 中等分数，让 AI 筛选来决定
    
    # ========== 阶段 2: AI监督筛选（Smart Filtering） ==========
    print(f"[Funnel] Stage 2: AI-Supervised Smart Filtering (mode={filter_mode.value})")
    print("[Funnel] ⚠️  Fine ranking stage removed (as requested)")
    
    # ✅ 使用AI增强后的查询进行智能过滤（如果AI增强成功）
    filter_query = search_query if ai_enhanced else query_text
    
    # 使用AI监督筛选：根据查询类型智能调整过滤策略
    # filter_docs=True: 针对设计师场景，自动过滤文档类内容
    filtered_results = await smart_filter(
        all_candidates,  # ✅ 直接使用粗召回结果，跳过精排序
        filter_query,  # ✅ 使用增强后的查询
        filter_mode=filter_mode,
        max_results=max_results,
        filter_docs=True,  # 设计师场景：过滤文档类内容
    )
    
    print(f"[Funnel] Final results: {len(filtered_results)} items")
    
    # ✅ 新增：如果提供了 filter_urls 或 filter_tab_ids，只返回 Personal Space 中的结果
    if filter_urls or filter_tab_ids:
        original_count = len(filtered_results)
        filter_urls_set = set(filter_urls or [])
        filter_tab_ids_set = set(filter_tab_ids or [])
        
        # 规范化 URL（移除尾随斜杠和查询参数）
        def normalize_url_for_filter(url: str) -> str:
            if not url:
                return ""
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
                return normalized
            except:
                return url
        
        # 创建规范化 URL 集合
        normalized_filter_urls = set()
        for url in filter_urls_set:
            normalized_filter_urls.add(url)
            normalized = normalize_url_for_filter(url)
            if normalized:
                normalized_filter_urls.add(normalized)
        
        filtered_by_personal_space = []
        for item in filtered_results:
            # 优先使用 tab_id 匹配
            if filter_tab_ids_set and item.get("tab_id"):
                if str(item.get("tab_id")) in filter_tab_ids_set:
                    filtered_by_personal_space.append(item)
                    continue
            
            # 使用 URL 匹配
            item_url = item.get("url", "")
            if item_url:
                if item_url in filter_urls_set or item_url in normalized_filter_urls:
                    filtered_by_personal_space.append(item)
                    continue
                # 尝试规范化 URL 匹配
                normalized_item_url = normalize_url_for_filter(item_url)
                if normalized_item_url in normalized_filter_urls:
                    filtered_by_personal_space.append(item)
                    continue
        
        filtered_results = filtered_by_personal_space
        removed_count = original_count - len(filtered_results)
        if removed_count > 0:
            print(f"[Funnel] ✅ Filtered by Personal Space: {removed_count} items removed, {len(filtered_results)} items remain")
    
    return filtered_results

