"""
相似度计算和排序模块
使用统一的 qwen2.5-vl-embedding 模型，文本和图像在同一向量空间，可直接比较
"""
from __future__ import annotations

from typing import List, Dict, Tuple
from .fuse import cosine_similarity, fuse_similarity_scores
from .config import DEFAULT_WEIGHTS, IMAGE_FOCUSED_WEIGHTS, DOC_FOCUSED_WEIGHTS


def fuzzy_score(query: str, title: str, description: str) -> float:
    """本地模糊搜索（fallback）"""
    q = (query or "").lower().strip()
    text = f"{title or ''} {description or ''}".lower()
    if not q or not text:
        return 0.0
    score = 0.0
    if q in text:
        score += 0.6
    tokens = [t for t in q.split() if t]
    if tokens:
        hits = sum(1 for t in tokens if t in text)
        score += 0.4 * (hits / len(tokens))
    if (title or "").lower().find(q) >= 0:
        score += 0.15
    return min(score, 1.0)


def _choose_weights(item: Dict) -> Tuple[float, float]:
    """
    根据内容类型选择融合权重
    
    设计师找图场景：默认更偏向图像，只有明确的技术文档站才降低图像权重
    """
    url = (item.get("url") or "").lower()
    site = (item.get("site_name") or "").lower()
    
    # 视觉为主的站点：图像权重极高（图95%:文5%）
    image_keywords = [
        "pinterest", "xiaohongshu", "arena", "unsplash", "behance", "dribbble", 
        "instagram", "pexels", "pixabay", "freepik", "shutterstock", "getty",
        "deviantart", "artstation", "500px", "flickr", "imgur", "tumblr"
    ]
    if any(k in url or k in site for k in image_keywords):
        return IMAGE_FOCUSED_WEIGHTS  # (0.05, 0.95) - 文本 5%，图像 95%
    
    # 明确的技术文档站点：降低图像权重（但仍保留40%）
    doc_keywords = ["github.com", "readthedocs", "/docs/", "developer.", "dev.", "stackoverflow"]
    if any(k in url for k in doc_keywords):
        return DOC_FOCUSED_WEIGHTS  # (0.6, 0.4) - 即使文档站也保留图像权重
    
    # 默认：图像优先（设计师找图场景）
    return DEFAULT_WEIGHTS  # (0.2, 0.8) - 文本 20%，图像 80%


def sort_by_vector_similarity(
    query_vec: List[float],
    docs: List[Dict],
    weights: Tuple[float, float] = None,  # 如果为None，会根据文档类型自适应
) -> List[Dict]:
    """
    计算查询向量与文档向量的相似度（两路相似度融合）
    
    使用统一的 qwen2.5-vl-embedding 模型，文本和图像在同一向量空间（1024维），
    可以直接计算余弦相似度，无需降维或跨空间对齐。
    
    Args:
        query_vec: 查询向量（文本embedding，1024维）
        docs: 文档列表，每个文档包含 text_embedding 和 image_embedding
        weights: 融合权重 (text_weight, image_weight)，如果为None则自适应
    
    Returns:
        按相似度排序的文档列表
    """
    if not query_vec:
        print("[Rank] Warning: query_vec is None or empty")
        for d in docs:
            d["similarity"] = 0.0
        return docs
    
    print(f"[Rank] Computing similarity for {len(docs)} documents (same vector space, direct comparison)")
    
    for idx, d in enumerate(docs):
        text_emb = d.get("text_embedding")
        image_emb = d.get("image_embedding")
        
        # 调试：检查前3个文档的embedding字段
        if idx < 3:
            has_text = text_emb is not None and isinstance(text_emb, list) and len(text_emb) > 0
            has_image = image_emb is not None and isinstance(image_emb, list) and len(image_emb) > 0
            print(f"[Rank] Doc {idx} embeddings check: text={has_text}, image={has_image}")
        
        text_sim = 0.0
        image_sim = 0.0
        
        # 计算文本相似度（同一向量空间，直接比较）
        if text_emb and isinstance(text_emb, list) and len(text_emb) > 0:
            verbose = idx == 0
            text_sim = cosine_similarity(query_vec, text_emb, verbose=verbose)
        
        # 计算图像相似度（同一向量空间，直接比较）
        if image_emb and isinstance(image_emb, list) and len(image_emb) > 0:
            verbose = idx == 0
            image_sim = cosine_similarity(query_vec, image_emb, verbose=verbose)
        
        # 选择权重（自适应或使用传入的权重）
        if weights is None:
            doc_weights = _choose_weights(d)
        else:
            doc_weights = weights
        
        # 融合相似度分数
        final_sim = fuse_similarity_scores(
            text_sim=text_sim,
            image_sim=image_sim,
            weights=doc_weights,
            has_text=text_emb is not None and isinstance(text_emb, list) and len(text_emb) > 0,
            has_image=image_emb is not None and isinstance(image_emb, list) and len(image_emb) > 0,
        )
        
        d["similarity"] = final_sim
        
        if idx < 5:
            title = d.get("title") or d.get("tab_title", "")[:30]
            text_info = f"text_sim={text_sim:.6f}" if text_emb else "text_sim=N/A"
            image_info = f"image_sim={image_sim:.6f}" if image_emb else "image_sim=N/A"
            print(f"[Rank] Doc {idx} '{title}': final={final_sim:.10f} ({text_info}, {image_info}, weights={doc_weights})")
    
    # 按相似度排序
    docs.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    print(f"[Rank] Sorted. Top 5 similarities:")
    for idx in range(min(5, len(docs))):
        title = docs[idx].get("title") or docs[idx].get("tab_title", "")[:30]
        sim = docs[idx].get("similarity", 0.0)
        print(f"[Rank]   {idx+1}. '{title}': {sim:.10f}")
    
    return docs
