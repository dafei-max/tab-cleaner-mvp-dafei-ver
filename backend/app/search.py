"""
搜索功能模块 - 使用多模态Embedding实现模糊搜索和相关性检索
"""
import os
import base64
import httpx
from typing import Dict, List, Optional, Tuple
from PIL import Image
from io import BytesIO
import numpy as np
from dotenv import load_dotenv
import asyncio
from search.pipeline import process_opengraph_for_search, search_relevant_items  # type: ignore

# DashScope 新版多模态向量接口（基于文档 input.contents）
EMBEDDING_API_URL_V2 = "https://dashscope.aliyuncs.com/api/v1/services/embeddings"
QWEN_VL_EMBEDDING_MODEL = "qwen2.5-vl-embedding"

# 开关：启用远端/图片
USE_REMOTE_EMBEDDING = True
USE_IMAGE_EMBEDDING = True

# 加载环境变量
load_dotenv()

# Embedding API 配置
EMBEDDING_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding"
EMBEDDING_MODEL = "multimodal-embedding-one-peace-v1"

# 图片处理配置（根据API限制）
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB
MAX_IMAGE_DIMENSION = 4096  # 最大4096x4096像素
MIN_IMAGE_DIMENSION = 100  # 最小100x100像素
TARGET_IMAGE_DIMENSION = 1024  # 目标尺寸，用于归一化


async def download_image(image_url: str, timeout: float = 10.0) -> Optional[bytes]:
    """
    下载图片数据
    支持小红书等需要特殊 headers 的网站
    
    Args:
        image_url: 图片URL
        timeout: 超时时间（秒）
    
    Returns:
        图片的二进制数据，失败返回None
    """
    try:
        # 构建 headers，针对不同网站使用不同的策略
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
        }
        
        # 小红书图片需要 Referer（包括所有 xhscdn.com 域名）
        if ("xiaohongshu.com" in image_url.lower() or 
            "picasso-static.xiaohongshu.com" in image_url.lower() or
            "xhscdn.com" in image_url.lower() or
            "sns-webpic-qc.xhscdn.com" in image_url.lower()):
            headers["Referer"] = "https://www.xiaohongshu.com/"
            headers["Origin"] = "https://www.xiaohongshu.com"
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(image_url, headers=headers)
            response.raise_for_status()
            
            # 检查文件大小
            if len(response.content) > MAX_IMAGE_SIZE:
                print(f"[Search] Image too large: {len(response.content)} bytes, skipping")
                return None
            
            return response.content
    except Exception as e:
        print(f"[Search] Error downloading image {image_url[:60]}...: {e}")
        return None


def process_image(image_data: bytes, max_dimension: int = TARGET_IMAGE_DIMENSION) -> Optional[str]:
    """
    处理图片：缩放、压缩并转换为Base64编码
    
    Args:
        image_data: 图片的二进制数据
        max_dimension: 目标最大尺寸（保持宽高比）
    
    Returns:
        Base64编码的图片字符串（带data URI前缀），失败返回None
    """
    try:
        # 打开图片
        img = Image.open(BytesIO(image_data))
        
        # 获取原始格式
        original_format = img.format or 'JPEG'
        if original_format not in ['JPEG', 'PNG', 'BMP', 'WEBP']:
            # 转换为JPEG
            original_format = 'JPEG'
        
        # 检查尺寸
        width, height = img.size
        
        # 若图片过小：按最小边放大到阈值（不再跳过）
        new_width, new_height = width, height
        if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
            scale = max(MIN_IMAGE_DIMENSION / max(width, 1), MIN_IMAGE_DIMENSION / max(height, 1))
            new_width = max(int(round(width * scale)), MIN_IMAGE_DIMENSION)
            new_height = max(int(round(height * scale)), MIN_IMAGE_DIMENSION)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            print(f"[Search] Image too small: {width}x{height}, upscaled to {new_width}x{new_height}")
        
        # 如果图片太大，进行缩放（保持宽高比）
        if new_width > max_dimension or new_height > max_dimension:
            if new_width > new_height:
                target_w = max_dimension
                target_h = int(new_height * (max_dimension / new_width))
            else:
                target_h = max_dimension
                target_w = int(new_width * (max_dimension / new_height))
            img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            new_width, new_height = target_w, target_h
            print(f"[Search] Resized image to {new_width}x{new_height}")
        
        # 确保不超过最大尺寸限制
        if new_width > MAX_IMAGE_DIMENSION or new_height > MAX_IMAGE_DIMENSION:
            scale = min(MAX_IMAGE_DIMENSION / new_width, MAX_IMAGE_DIMENSION / new_height)
            new_width = int(new_width * scale)
            new_height = int(new_height * scale)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # 转换为RGB模式（如果不是）
        if img.mode in ('RGBA', 'LA', 'P'):
            # 创建白色背景
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # 压缩并转换为Base64
        output = BytesIO()
        # 使用质量85的JPEG压缩，平衡质量和文件大小
        img.save(output, format='JPEG', quality=85, optimize=True)
        image_bytes = output.getvalue()
        
        # 检查压缩后的大小
        if len(image_bytes) > MAX_IMAGE_SIZE:
            # 如果还是太大，进一步降低质量
            for quality in [70, 60, 50, 40]:
                output = BytesIO()
                img.save(output, format='JPEG', quality=quality, optimize=True)
                image_bytes = output.getvalue()
                if len(image_bytes) <= MAX_IMAGE_SIZE:
                    break
        
        if len(image_bytes) > MAX_IMAGE_SIZE:
            print(f"[Search] Image still too large after compression: {len(image_bytes)} bytes")
            return None
        
        # 转换为Base64
        base64_str = base64.b64encode(image_bytes).decode('utf-8')
        
        # 返回带data URI前缀的字符串
        mime_type = 'image/jpeg'  # 统一使用JPEG
        return f"data:image/{mime_type};base64,{base64_str}"
        
    except Exception as e:
        print(f"[Search] Error processing image: {e}")
        return None


async def get_image_embedding(image_base64: str) -> Optional[List[float]]:
    """
    获取图片的Embedding向量
    
    Args:
        image_base64: Base64编码的图片（带data URI前缀）
    
    Returns:
        Embedding向量，失败返回None
    """
    try:
        # 使用HTTP直接调用API（因为SDK可能没有MultiModalEmbedding类）
        api_key = os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            print("[Search] DASHSCOPE_API_KEY not configured")
            return None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EMBEDDING_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-DashScope-Api-Key": api_key,  # 兼容老接口
                    "Content-Type": "application/json"
                },
                json={
                    "model": EMBEDDING_MODEL,
                    "input": {
                        "images": [image_base64]
                    },
                    "parameters": {
                        "image_type": "document"
                    }
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("output") and data["output"].get("embeddings"):
                    embeddings = data["output"]["embeddings"]
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0].get("embedding")
            else:
                print(f"[Search] API error: {response.status_code}, {response.text}")
        
        return None
    except Exception as e:
        print(f"[Search] Error getting image embedding: {e}")
        return None


async def get_text_embedding(text: str, text_type: str = "document") -> Optional[List[float]]:
    """
    获取文本的Embedding向量
    
    Args:
        text: 文本内容（最大2000字符）
        text_type: 文本类型，"query" 或 "document"
    
    Returns:
        Embedding向量，失败返回None
    """
    try:
        # 截断文本（最大2000字符）
        if len(text) > 2000:
            text = text[:2000]
        
        # 使用HTTP直接调用API
        api_key = os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            print("[Search] DASHSCOPE_API_KEY not configured")
            return None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EMBEDDING_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-DashScope-Api-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "model": EMBEDDING_MODEL,
                    "input": {
                        "texts": [text]
                    },
                    "parameters": {
                        "text_type": text_type
                    }
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("output") and data["output"].get("embeddings"):
                    embeddings = data["output"]["embeddings"]
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0].get("embedding")
            else:
                print(f"[Search] API error: {response.status_code}, {response.text}")
        
        return None
    except Exception as e:
        print(f"[Search] Error getting text embedding: {e}")
        return None


async def get_multimodal_embedding(
    text: Optional[str] = None,
    image_base64: Optional[str] = None,
    text_type: str = "document",
    image_type: str = "document"
) -> Optional[List[float]]:
    """
    获取多模态（文本+图片）的Embedding向量
    
    Args:
        text: 文本内容（可选）
        image_base64: Base64编码的图片（可选）
        text_type: 文本类型，"query" 或 "document"
        image_type: 图片类型，"query" 或 "document"
    
    Returns:
        Embedding向量，失败返回None
    """
    try:
        input_data = {}
        parameters = {}
        
        if text:
            # 截断文本（最大2000字符）
            if len(text) > 2000:
                text = text[:2000]
            input_data["texts"] = [text]
            parameters["text_type"] = text_type
        
        if image_base64:
            input_data["images"] = [image_base64]
            parameters["image_type"] = image_type
        
        if not input_data:
            return None
        
        # 使用HTTP直接调用API
        api_key = os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            print("[Search] DASHSCOPE_API_KEY not configured")
            return None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EMBEDDING_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-DashScope-Api-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "model": EMBEDDING_MODEL,
                    "input": input_data,
                    "parameters": parameters
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("output") and data["output"].get("embeddings"):
                    embeddings = data["output"]["embeddings"]
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0].get("embedding")
            else:
                print(f"[Search] API error: {response.status_code}, {response.text}")
        
        return None
    except Exception as e:
        print(f"[Search] Error getting multimodal embedding: {e}")
        return None


async def _post_embeddings_v2(contents: List[Dict], model: str = QWEN_VL_EMBEDDING_MODEL) -> Optional[Dict]:
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        print("[Search] DASHSCOPE_API_KEY not configured")
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                EMBEDDING_API_URL_V2,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": {"contents": contents}
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data
            else:
                print(f"[Search] API v2 error: {resp.status_code}, {resp.text}")
                return None
    except Exception as e:
        print(f"[Search] Error calling v2 embeddings: {e}")
        return None

async def get_image_embedding_v2(image_base64_or_url: str) -> Optional[List[float]]:
    data = await _post_embeddings_v2([{"image": image_base64_or_url}])
    if not data or not data.get("output"):
        return None
    embs = data["output"].get("embeddings") or []
    for item in embs:
        if item.get("type") == "image" and isinstance(item.get("embedding"), list):
            return item["embedding"]
    # 若未带 type 字段，则取第一个
    if embs and isinstance(embs[0].get("embedding"), list):
        return embs[0]["embedding"]
    return None

async def get_text_embedding_v2(text: str) -> Optional[List[float]]:
    text = text[:32000] if text and len(text) > 32000 else text
    data = await _post_embeddings_v2([{"text": text}])
    if not data or not data.get("output"):
        return None
    embs = data["output"].get("embeddings") or []
    for item in embs:
        if item.get("type") == "text" and isinstance(item.get("embedding"), list):
            return item["embedding"]
    if embs and isinstance(embs[0].get("embedding"), list):
        return embs[0]["embedding"]
    return None


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    计算两个向量的余弦相似度
    
    Args:
        vec1: 向量1
        vec2: 向量2
    
    Returns:
        余弦相似度（-1到1之间，越大越相似）
    """
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)
    
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))


async def process_opengraph_for_search(opengraph_items: List[Dict]) -> List[Dict]:
    """
    处理OpenGraph数据，生成Embedding向量
    
    Args:
        opengraph_items: OpenGraph数据列表
    
    Returns:
        包含Embedding向量的OpenGraph数据列表
    """
    processed_items = []
    
    for item in opengraph_items:
        if not item.get("success", False):
            continue
        
        title = item.get("title", "") or item.get("tab_title", "")
        description = item.get("description", "")
        combined_text = f"{title} {description}".strip()
        
        if not USE_REMOTE_EMBEDDING:
            processed_items.append({
                **item,
                "embedding": None,
                "text_embedding": None,
                "image_embedding": None,
                "processed_text": combined_text,
                "has_embedding": False
            })
            await asyncio.sleep(0.05)
            continue
        
        image_base64 = None
        image_embedding = None
        
        if USE_IMAGE_EMBEDDING:
            image_url = item.get("image", "")
            if image_url:
                image_data = await download_image(image_url)
                if image_data:
                    image_base64 = process_image(image_data)
                    if image_base64:
                        # 优先新版多模态接口
                        image_embedding = await get_image_embedding_v2(image_base64)
                        if not image_embedding:
                            image_embedding = await get_image_embedding(image_base64)
        
        text_embedding = None
        if combined_text:
            text_embedding = await get_text_embedding_v2(combined_text)
            if not text_embedding:
                text_embedding = await get_text_embedding(combined_text, text_type="document")
        
        final_embedding = None
        if USE_IMAGE_EMBEDDING and image_embedding and combined_text:
            # 也尝试直接用文本作为主向量（简单融合策略可后续加入加权）
            final_embedding = image_embedding
        elif USE_IMAGE_EMBEDDING and image_embedding:
            final_embedding = image_embedding
        else:
            final_embedding = text_embedding
        
        processed_item = {
            **item,
            "embedding": final_embedding,
            "text_embedding": text_embedding,
            "image_embedding": image_embedding if USE_IMAGE_EMBEDDING else None,
            "processed_text": combined_text,
            "has_embedding": final_embedding is not None
        }
        
        processed_items.append(processed_item)
        
        await asyncio.sleep(0.15)
    
    return processed_items


async def search_relevant_items(
    query_text: Optional[str] = None,
    query_image_url: Optional[str] = None,
    opengraph_items: List[Dict] = None,
    top_k: int = 20
) -> List[Dict]:
    """
    搜索相关的内容
    
    Args:
        query_text: 查询文本（可选）
        query_image_url: 查询图片URL（可选）
        opengraph_items: 包含Embedding的OpenGraph数据列表
        top_k: 返回最相关的top_k个结果
    
    Returns:
        按相关性排序的OpenGraph数据列表（包含相似度分数）
    """
    if not opengraph_items:
        return []
    
    # 获取查询的Embedding
    query_embedding = None
    
    if USE_IMAGE_EMBEDDING and query_image_url:
        image_data = await download_image(query_image_url)
        if image_data:
            image_base64 = process_image(image_data)
            if image_base64:
                if query_text:
                    query_embedding = await get_multimodal_embedding(
                        text=query_text,
                        image_base64=image_base64,
                        text_type="query",
                        image_type="query"
                    )
                else:
                    query_embedding = await get_image_embedding(image_base64)
    
    if not query_embedding and query_text:
        query_embedding = await get_text_embedding(query_text, text_type="query")
        # 轻微节流
        await asyncio.sleep(0.05)
    
    if not query_embedding:
        # 使用本地模糊排序作为兜底
        if not query_text:
            return []
        q = query_text
        results = []
        for item in opengraph_items:
            text = (item.get("title") or item.get("tab_title") or "") + " " + (item.get("description") or "")
            score = text_fuzzy_similarity(q, text)
            # 标题命中加权
            title_text = (item.get("title") or item.get("tab_title") or "")
            score += 0.15 if q.lower() in title_text.lower() else 0.0
            if score > 1.0:
                score = 1.0
            results.append({ **item, "similarity": float(score) })
        results.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
        return results[:top_k]
    
    # 计算相似度
    results = []
    for item in opengraph_items:
        embedding = item.get("embedding")
        if not embedding:
            continue
        
        similarity = cosine_similarity(query_embedding, embedding)
        results.append({
            **item,
            "similarity": similarity
        })
    
    # 按相似度排序（从高到低）
    results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
    
    # 返回top_k个结果
    return results[:top_k]


def text_fuzzy_similarity(query: str, text: str) -> float:
    """
    简单文本模糊相似度：
    - 全词包含加大权重
    - 分词重叠加权
    - 标题命中可在上层再加权
    返回 0~1 之间分数
    """
    if not query or not text:
        return 0.0
    q = query.lower().strip()
    t = text.lower()
    if not q or not t:
        return 0.0

    # 整体包含
    score = 0.0
    if q in t:
        score += 0.6

    # 简单分词重叠
    q_tokens = [tok for tok in q.split() if tok]
    if q_tokens:
        hit = sum(1 for tok in q_tokens if tok in t)
        score += 0.4 * (hit / len(q_tokens))

    # 截断到 [0,1]
    if score > 1.0:
        score = 1.0
    return score

