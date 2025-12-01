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
    search_by_text_embedding,
    search_by_image_embedding,
    get_pool,
    ACTIVE_TABLE,
    NAMESPACE,
    _normalize_user_id,
)
import asyncpg


# 五路分数权重配置（从 fusion_weights 模块导入，可配置）
from .fusion_weights import FUSION_WEIGHTS


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
    try:
        from .embed import embed_text
        query_vec = await embed_text(query_text)
        if not query_vec:
            return []
        
        results = await search_by_text_embedding(
            user_id=user_id,
            query_embedding=query_vec,
            top_k=top_k,
            threshold=0.0,  # 降低阈值：允许更多候选结果进入精排序阶段
        )
        
        # 添加路径标识
        for item in results:
            item["recall_path"] = "text_vector"
            item["text_similarity"] = item.get("similarity", 0.0)
        
        print(f"[Funnel] Text vector recall: found {len(results)} results for user_id={user_id}")
        return results
    except Exception as e:
        print(f"[Funnel] Error in text vector recall: {e}")
        import traceback
        traceback.print_exc()
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
    try:
        from .embed import embed_image
        query_vec = await embed_image(query_image_url, query_image_base64)
        if not query_vec:
            return []
        
        results = await search_by_image_embedding(
            user_id=user_id,
            query_embedding=query_vec,
            top_k=top_k,
            threshold=0.0,  # 降低阈值：允许更多候选结果进入精排序阶段
        )
        
        # 添加路径标识
        for item in results:
            item["recall_path"] = "image_vector"
            item["image_similarity"] = item.get("similarity", 0.0)
        
        return results
    except Exception as e:
        print(f"[Funnel] Error in image vector recall: {e}")
        return []


async def _coarse_recall_caption_keyword(
    user_id: Optional[str],
    query_text: str,
    top_k: int = 50,
) -> List[Dict]:
    """
    路径3: Caption 关键词搜索（全文搜索）
    
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
        
        # 使用 PostgreSQL 全文搜索
        # 将查询文本转换为 tsquery
        query_tokens = query_text.lower().split()
        tsquery = " & ".join(query_tokens)  # AND 查询
        
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
                rows = await conn.fetch(f"""
                    SELECT user_id, url, title, description, image, site_name,
                           tab_id, tab_title, metadata,
                           ts_rank(to_tsvector('english', COALESCE(metadata->>'caption', '')), 
                                   plainto_tsquery('english', $1)) AS rank
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $2
                      AND metadata ? 'caption'
                      AND metadata->>'caption' IS NOT NULL
                      AND metadata->>'caption' != ''
                      AND to_tsvector('english', metadata->>'caption') @@ plainto_tsquery('english', $1)
                    ORDER BY rank DESC
                    LIMIT $3;
                """, query_text, normalized_user, top_k)
            else:
                rows = await conn.fetch(f"""
                    SELECT user_id, url, title, description, image, site_name,
                           tab_id, tab_title, metadata,
                           image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
                           ts_rank(to_tsvector('english', COALESCE(image_caption, '')), 
                                   plainto_tsquery('english', $1)) AS rank
                    FROM {ACTIVE_TABLE}
                    WHERE status = 'active'
                      AND user_id = $2
                      AND image_caption IS NOT NULL
                      AND image_caption != ''
                      AND to_tsvector('english', image_caption) @@ plainto_tsquery('english', $1)
                    ORDER BY rank DESC
                    LIMIT $3;
                """, query_text, normalized_user, top_k)
            
            results = []
            for row in rows:
                item = dict(row)
                # 归一化 rank 到 [0, 1]（确保转换为 float）
                rank = item.get("rank", 0.0)
                item["caption_similarity"] = min(float(rank), 1.0)
                item["recall_path"] = "caption_keyword"
                results.append(item)
            
            print(f"[Funnel] Caption keyword recall: found {len(results)} results for user_id={user_id}")
            return results
    except Exception as e:
        print(f"[Funnel] Error in caption keyword recall: {e}")
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
                # 颜色匹配（使用数组包含操作符）
                color_conditions = []
                for color in colors:
                    color_conditions.append(f"${param_idx} = ANY(dominant_colors)")
                    params.append(color.lower())
                    param_idx += 1
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
            
            query = f"""
                SELECT user_id, url, title, description, image, site_name,
                       tab_id, tab_title, metadata,
                       image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
                       CASE 
                           WHEN dominant_colors && ARRAY[{','.join([f'${i+2}' for i, c in enumerate(colors)])}]::TEXT[] 
                                THEN 0.7
                           ELSE 0.0
                       END +
                       CASE 
                           WHEN style_tags && ARRAY[{','.join([f'${len(colors)+i+2}' for i, s in enumerate(styles)])}]::TEXT[] 
                                THEN 0.3
                           ELSE 0.0
                       END AS visual_score
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
    精排序：融合 5 路分数
    
    五路分数：
    1. 文本相似度 (15%)
    2. 图像相似度 (35%)
    3. Caption 相似度 (20%)
    4. 关键词匹配 (15%)
    5. 视觉属性匹配 (15%)
    
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
    
    # 计算融合分数
    results = []
    for url, item in merged.items():
        # 如果缺少向量相似度，尝试计算
        if query_text_vec and item.get("text_embedding") and item["text_similarity"] == 0.0:
            try:
                text_vec = item.get("text_embedding")
                if isinstance(text_vec, list):
                    item["text_similarity"] = max(
                        item["text_similarity"],
                        cosine_similarity(query_text_vec, text_vec)
                    )
            except Exception as e:
                print(f"[Funnel] Error computing text similarity for {url}: {e}")
        
        if query_image_vec and item.get("image_embedding") and item["image_similarity"] == 0.0:
            try:
                image_vec = item.get("image_embedding")
                if isinstance(image_vec, list):
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
        item["recall_paths"] = list(item["recall_paths"])
        results.append(item)
    
    # 按融合分数排序
    results.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    
    return results


async def search_with_funnel(
    user_id: Optional[str],
    query_text: str,
    query_image_url: Optional[str] = None,
    query_image_base64: Optional[str] = None,
    filter_mode: FilterMode = FilterMode.BALANCED,
    max_results: Optional[int] = None,  # 改为可选，None表示不限制数量，只根据质量过滤
    use_caption: bool = True,
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
    
    # ========== 阶段 1: 粗召回（Multi-Recall） ==========
    print("[Funnel] Stage 1: Coarse Recall (Multi-Recall)")
    
    recall_tasks = []
    
    # 路径1: 文本向量搜索
    recall_tasks.append(_coarse_recall_text_vector(user_id, query_text, top_k=50))
    
    # 路径2: 图像向量搜索（如果有图像）
    if query_image_url or query_image_base64:
        recall_tasks.append(_coarse_recall_image_vector(
            user_id, query_image_url, query_image_base64, top_k=50
        ))
    
    # 路径3: Caption 关键词搜索（如果启用）
    if use_caption:
        recall_tasks.append(_coarse_recall_caption_keyword(user_id, query_text, top_k=50))
    
    # 路径4: 视觉属性搜索
    recall_tasks.append(_coarse_recall_visual_attributes(user_id, query_text, top_k=50))
    
    # 并发执行所有召回路径
    recall_results = await asyncio.gather(*recall_tasks, return_exceptions=True)
    
    # 合并召回结果
    all_candidates = []
    for results in recall_results:
        if isinstance(results, Exception):
            print(f"[Funnel] Recall path error: {results}")
            continue
        all_candidates.extend(results)
    
    print(f"[Funnel] Coarse recall: {len(all_candidates)} candidates")
    
    if not all_candidates:
        print("[Funnel] ⚠️  No candidates found in recall stage")
        print("[Funnel] 💡  Possible reasons:")
        print("[Funnel]    1. No data in database for this user")
        print("[Funnel]    2. No embeddings generated")
        print("[Funnel]    3. User ID mismatch")
        print("[Funnel]    4. Query embedding generation failed")
        return []
    
    # ========== 阶段 2: 精排序（Re-Ranking） ==========
    print("[Funnel] Stage 2: Fine Ranking (Re-Ranking)")
    
    # 计算查询向量（用于精排序）
    query_text_vec = None
    query_image_vec = None
    
    if query_text:
        try:
            query_text_vec = await embed_text(query_text)
        except Exception as e:
            print(f"[Funnel] Error computing query text vector: {e}")
    
    if query_image_url or query_image_base64:
        try:
            query_image_vec = await embed_image(query_image_url, query_image_base64)
        except Exception as e:
            print(f"[Funnel] Error computing query image vector: {e}")
    
    ranked_results = await _fine_ranking(
        all_candidates,
        query_text,
        query_text_vec,
        query_image_vec,
    )
    
    print(f"[Funnel] Fine ranking: {len(ranked_results)} ranked results")
    
    # ========== 阶段 3: AI监督筛选（Smart Filtering） ==========
    print(f"[Funnel] Stage 3: AI-Supervised Smart Filtering (mode={filter_mode.value})")
    
    # 使用AI监督筛选：根据查询类型智能调整过滤策略
    # filter_docs=True: 针对设计师场景，自动过滤文档类内容
    filtered_results = smart_filter(
        ranked_results,
        query_text,
        filter_mode=filter_mode,
        max_results=max_results,
        filter_docs=True,  # 设计师场景：过滤文档类内容
    )
    
    print(f"[Funnel] Final results: {len(filtered_results)} items")
    
    return filtered_results

