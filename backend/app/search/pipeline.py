"""
搜索 Pipeline：使用统一的 qwen2.5-vl-embedding 处理文本和图像
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from .config import (
    USE_REMOTE_EMBEDDING,
    USE_IMAGE_EMBEDDING,
    EMBED_SLEEP_S,
    QUERY_SLEEP_S,
    get_api_key,
)
from .preprocess import download_image, process_image, extract_text_from_item
from .embed import embed_text, embed_image
from .rank import sort_by_vector_similarity, fuzzy_score


async def _build_item_embedding(item: Dict, verbose: bool = False) -> Dict:
    """
    为单个 OpenGraph 项生成文本和图像 embedding
    
    使用统一的 qwen2.5-vl-embedding 模型，确保文本和图像在同一向量空间（1024维）
    """
    # 提取文本：title + og:title + og:description
    text = extract_text_from_item(item)
    text_vec = None
    
    # 文本 embedding（使用统一的 qwen2.5-vl-embedding）
    if USE_REMOTE_EMBEDDING and text:
        try:
            text_vec = await embed_text(text)
            if verbose:
                if text_vec:
                    print(f"[Pipeline] Text vector: {len(text_vec)} dims")
                else:
                    print(f"[Pipeline] Text vector: None")
        except Exception as e:
            print(f"[Pipeline] ERROR getting text embedding: {type(e).__name__}: {str(e)}")
            text_vec = None
    
    # 图像 embedding（使用统一的 qwen2.5-vl-embedding）
    # 流程：
    # - 如果是截图（Base64）：直接使用
    # - 如果是 OpenGraph 图片 URL：下载 → 处理为 Base64 → 生成 embedding
    image_vec = None
    if USE_REMOTE_EMBEDDING and USE_IMAGE_EMBEDDING:
        # 从 OpenGraph 数据中获取图片（可能是 URL 或 Base64 截图）
        img_data = item.get("image")
        is_screenshot = item.get("is_screenshot", False)
        
        if img_data:
            if verbose:
                if is_screenshot:
                    print(f"[Pipeline] Image is screenshot (Base64), length: {len(img_data)}")
                else:
                    print(f"[Pipeline] Image URL from OpenGraph: {img_data[:60]}...")
            
            try:
                # 检查是否为 Base64 截图（以 data:image 开头）
                if is_screenshot or (isinstance(img_data, str) and img_data.startswith("data:image")):
                    # 已经是 Base64 格式，直接使用
                    if verbose:
                        print(f"[Pipeline] Using screenshot Base64 directly (length: {len(img_data)})")
                    image_vec = await embed_image(img_data)
                    if verbose:
                        if image_vec:
                            print(f"[Pipeline] Image vector generated from screenshot: {len(image_vec)} dims")
                        else:
                            print(f"[Pipeline] Image vector: None (embedding API failed)")
                else:
                    # 是 URL，需要下载并处理
                    # 步骤1：下载图片到内存（来自 opengraph.py 的 og:image URL）
                    image_data = await download_image(img_data)
                    if not image_data:
                        if verbose:
                            print(f"[Pipeline] Failed to download image from URL")
                        image_vec = None
                    else:
                        if verbose:
                            print(f"[Pipeline] Downloaded {len(image_data)} bytes from OpenGraph image URL")
                        
                        # 步骤2：处理图片（调整大小、压缩、转换为 Base64）
                        img_b64 = process_image(image_data)
                        if not img_b64:
                            if verbose:
                                print(f"[Pipeline] Failed to process image (process_image returned None)")
                            image_vec = None
                        else:
                            if verbose:
                                print(f"[Pipeline] Processed image to Base64 (length: {len(img_b64)})")
                            
                            # 步骤3：生成 embedding（使用 Base64 数据）
                            image_vec = await embed_image(img_b64)
                            if verbose:
                                if image_vec:
                                    print(f"[Pipeline] Image vector generated: {len(image_vec)} dims")
                                else:
                                    print(f"[Pipeline] Image vector: None (embedding API failed)")
            except Exception as e:
                print(f"[Pipeline] ERROR getting image embedding: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
                image_vec = None
        else:
            if verbose:
                print(f"[Pipeline] No image data in OpenGraph item (item.get('image') is empty)")
    
    # 检查是否有任何 embedding
    has_embedding = (text_vec is not None) or (image_vec is not None)
    
    return {
        **item,
        "text_embedding": text_vec,  # 文本向量（1024维）
        "image_embedding": image_vec,  # 图像向量（1024维，同一向量空间）
        "embedding": None,  # 不再生成融合向量，直接使用 text_embedding 和 image_embedding
        "processed_text": text,
        "has_embedding": has_embedding,
    }


async def process_opengraph_for_search(opengraph_items: List[Dict]) -> List[Dict]:
    """
    批量处理 OpenGraph 数据，生成文本和图像 embedding
    
    使用统一的 qwen2.5-vl-embedding 模型，文本和图像在同一向量空间（1024维）
    """
    api_key = get_api_key()
    print(f"[Pipeline] USE_REMOTE_EMBEDDING={USE_REMOTE_EMBEDDING}, USE_IMAGE_EMBEDDING={USE_IMAGE_EMBEDDING}")
    print(f"[Pipeline] API key present: {bool(api_key)}, length: {len(api_key) if api_key else 0}")
    
    results: List[Dict] = []
    total = len([it for it in (opengraph_items or []) if it and it.get("success", False)])
    print(f"[Pipeline] Processing {total} items for embedding generation")
    
    for idx, it in enumerate(opengraph_items or []):
        if not it or not it.get("success", False):
            continue
        
        verbose = idx < 3
        if verbose:
            print(f"[Pipeline] Processing item {idx+1}/{total}: {it.get('title', it.get('tab_title', 'Unknown'))[:50]}")
        
        try:
            enriched = await _build_item_embedding(it, verbose=verbose)
            results.append(enriched)
        except Exception as e:
            print(f"[Pipeline] ERROR processing item {idx+1}: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            # 即使失败，也添加一个基础项
            results.append({
                **it,
                "embedding": None,
                "text_embedding": None,
                "image_embedding": None,
                "has_embedding": False,
            })
        
        await asyncio.sleep(EMBED_SLEEP_S)
    
    successful = sum(1 for r in results if r.get("has_embedding", False))
    print(f"[Pipeline] Generated embeddings for {len(results)} items, {successful} have embedding")
    return results


async def search_relevant_items(
    query_text: Optional[str] = None,
    query_image_url: Optional[str] = None,
    opengraph_items: List[Dict] = None,
    top_k: int = 20,
) -> List[Dict]:
    """
    搜索相关内容
    
    使用统一的 qwen2.5-vl-embedding 模型：
    1. 查询文本 → query_vec（1024维）
    2. 分别计算文本相似度和图像相似度（都在同一向量空间，可直接比较）
    3. 根据内容类型自适应权重融合
    """
    api_key = get_api_key()
    print(f"[Search] USE_REMOTE_EMBEDDING={USE_REMOTE_EMBEDDING}, API key present: {bool(api_key)}")
    
    # 生成查询向量
    query_vec = None
    if USE_REMOTE_EMBEDDING and query_text:
        try:
            print(f"[Search] Generating query embedding for: '{query_text[:50]}...'")
            query_vec = await embed_text(query_text or "")
            await asyncio.sleep(QUERY_SLEEP_S)
            if query_vec:
                print(f"[Search] Query embedding generated: {len(query_vec)} dims")
            else:
                print(f"[Search] Query embedding generation FAILED (returned None)")
        except Exception as e:
            print(f"[Search] Failed to generate query embedding: {e}")
            import traceback
            traceback.print_exc()
            query_vec = None
    else:
        if not USE_REMOTE_EMBEDDING:
            print(f"[Search] USE_REMOTE_EMBEDDING is False, skipping query embedding")
        if not query_text:
            print(f"[Search] query_text is empty, skipping query embedding")
    
    docs = [dict(x) for x in (opengraph_items or [])]
    print(f"[Search] Processing {len(docs)} documents")
    
    if query_vec:
        # 检查文档是否有 embedding（text_embedding 或 image_embedding）
        docs_with_embedding = [
            d for d in docs
            if (d.get("text_embedding") and isinstance(d.get("text_embedding"), list) and len(d.get("text_embedding", [])) > 0)
            or (d.get("image_embedding") and isinstance(d.get("image_embedding"), list) and len(d.get("image_embedding", [])) > 0)
        ]
        docs_without_embedding = [d for d in docs if d not in docs_with_embedding]
        print(f"[Search] Docs with embedding: {len(docs_with_embedding)}, without: {len(docs_without_embedding)}")
        
        if docs_with_embedding:
            # 使用两路相似度融合（文本和图像在同一向量空间，可直接比较）
            ranked = sort_by_vector_similarity(
                query_vec,
                docs_with_embedding,
                weights=None  # 使用自适应权重
            )
            # 为没有 embedding 的文档设置相似度为 0
            for d in docs_without_embedding:
                d["similarity"] = 0.0
            # 合并并排序
            all_docs = ranked + docs_without_embedding
            all_docs.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
            print(f"[Search] Top 3 similarities: {[d.get('similarity', 0.0) for d in all_docs[:3]]}")
            return all_docs[:top_k]
        else:
            print("[Search] No documents have embedding, falling back to fuzzy search")
            # 所有文档都没有 embedding，使用模糊搜索
            for d in docs:
                title = d.get("title") or d.get("tab_title", "")
                desc = d.get("description", "")
                score = fuzzy_score(query_text or "", title, desc)
                d["similarity"] = score
            docs.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
            print(f"[Search] Top 3 fuzzy scores: {[d.get('similarity', 0.0) for d in docs[:3]]}")
            return docs[:top_k]
    
    # 远端不可用/失败 → 本地模糊兜底
    print("[Search] Using fuzzy search fallback (query_vec is None)")
    for d in docs:
        title = d.get("title") or d.get("tab_title", "")
        desc = d.get("description", "")
        score = fuzzy_score(query_text or "", title, desc)
        d["similarity"] = score
    docs.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    print(f"[Search] Top 3 fuzzy scores: {[d.get('similarity', 0.0) for d in docs[:3]]}")
    return docs[:top_k]
