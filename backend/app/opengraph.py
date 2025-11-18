"""
OpenGraph 抓取工具（基于 TechValiadtion-3.ipynb 逻辑）
支持预取 Embedding：一旦 OpenGraph 数据解析完成，立即请求 embedding
"""
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple
import asyncio
import json
from urllib.parse import urljoin

# Screenshot 功能已移除


def normalize_img(src: Optional[str], base_url: str) -> Optional[str]:
    """标准化图片 URL"""
    if not src:
        return None
    if src.startswith("//"):
        return "https:" + src
    if src.startswith(("http://", "https://")):
        return src
    return urljoin(base_url, src)


def pick_meta(soup: BeautifulSoup, selector: str, attr: str = "content") -> Optional[str]:
    """从 soup 中选择 meta 标签并获取属性值"""
    tag = soup.select_one(selector)
    return tag.get(attr) if tag and tag.has_attr(attr) else None


def best_text(*candidates) -> Optional[str]:
    """从多个候选中选择第一个非空字符串"""
    for c in candidates:
        if isinstance(c, str):
            t = c.strip()
            if t:
                return t
        return None


async def get_generic_og(client: httpx.AsyncClient, url: str) -> Dict:
    """
    其他站点：通用 OG/Twitter Card
    """
    response = await client.get(url, timeout=15.0)
    response.raise_for_status()
    
    html = response.text
    final_base = str(response.url)
    soup = BeautifulSoup(html, "html.parser")
    
    # 提取 OG 和 Twitter Card 数据
    title = best_text(
        pick_meta(soup, 'meta[property="og:title"]'),
        pick_meta(soup, 'meta[name="og:title"]'),
        soup.title.string if soup.title else None
    )
    
    description = best_text(
        pick_meta(soup, 'meta[property="og:description"]'),
        pick_meta(soup, 'meta[name="og:description"]'),
        pick_meta(soup, 'meta[name="description"]')
    )
    
    site_name = best_text(
        pick_meta(soup, 'meta[property="og:site_name"]'),
        pick_meta(soup, 'meta[name="og:site_name"]')
    )
    
    # 图片候选：OG image > Twitter image > 首图
    img_candidate = best_text(
        pick_meta(soup, 'meta[property="og:image"]'),
        pick_meta(soup, 'meta[name="og:image"]'),
        pick_meta(soup, 'meta[name="twitter:image"]'),
        pick_meta(soup, 'meta[name="twitter:image:src"]'),
    )
    image = normalize_img(img_candidate, final_base)
    
    # 图片最终兜底：页面首张 <img>
    if not image:
        img_tag = soup.select_one("img[src]")
        if img_tag:
            image = normalize_img(img_tag.get("src"), final_base)
    
    # 从 URL 提取站点名称（如果没有 OG site_name）
    if not site_name:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        site_name = parsed.netloc or ""
        if site_name.startswith("www."):
            site_name = site_name[4:]
    
    return {
        "url": url,
        "title": title or "",
        "description": description or "",
        "image": image or "",
        "site_name": site_name or "",
        "success": True,
        "error": None,
        "is_screenshot": False,
        "needs_screenshot": False,
        "source": "generic:og"
    }


async def fetch_opengraph(url: str, timeout: float = 15.0) -> Dict:
    """
    抓取单个 URL 的 OpenGraph 数据（基于 TechValiadtion-3.ipynb 逻辑）
    
    Args:
        url: 要抓取的网页 URL
        timeout: 请求超时时间（秒）
    
    Returns:
        {
            "url": str,
            "title": str,
            "description": str,
            "image": str,  # OpenGraph 图片 URL
            "site_name": str,
            "success": bool,
            "error": Optional[str],
            "is_screenshot": bool,  # 始终为 False（截图功能已移除）
            "needs_screenshot": bool,  # 始终为 False（截图功能已移除）
        }
    """
    result = {
        "url": url,
        "title": "",
        "description": "",
        "image": "",
        "site_name": "",
        "success": False,
        "error": None,
        "is_screenshot": False,
        "needs_screenshot": False,
    }
    
    # 构建 headers
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.6",
        "Accept-Encoding": "gzip, deflate, br",
    }
    
    # 小红书等需要 Referer
    url_lower = url.lower()
    if "xiaohongshu.com" in url_lower:
        headers["Referer"] = "https://www.xiaohongshu.com/"
        headers["Origin"] = "https://www.xiaohongshu.com"
    
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
            # 统一使用通用 OG/Twitter Card 逻辑（所有站点，包括 Pinterest）
            result = await get_generic_og(client, url)
            
            # Screenshot 功能已移除，needs_screenshot 始终为 False
            result["needs_screenshot"] = False
            
            # 如果 OpenGraph 抓取成功，立即预取 embedding（无论是否有图片）
            if result["success"]:
                await _prefetch_embedding(result)
            
                return result
            
    except Exception as e:
        result["error"] = str(e)
        result["success"] = False
        print(f"[OpenGraph] Error fetching {url[:60]}...: {str(e)}")
        return result


async def fetch_multiple_opengraph(urls: List[str]) -> List[Dict]:
    """
    并发抓取多个 URL 的 OpenGraph 数据
    """
    tasks = [fetch_opengraph(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 处理异常结果
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append({
                "url": urls[i],
                "title": "",
                "description": "",
                "image": "",
                "site_name": "",
                "success": False,
                "error": str(result),
                "is_screenshot": False,
                "needs_screenshot": False,
            })
                else:
            processed_results.append(result)
    
    return processed_results


async def _prefetch_embedding(result: Dict) -> None:
    """
    预取 embedding 数据并存储到向量数据库
    一旦 OpenGraph 数据解析完成，立即请求 embedding 并存储
    
    Args:
        result: OpenGraph 结果字典（会被更新，添加 text_embedding 和 image_embedding）
    """
    try:
        # 延迟导入，避免循环依赖
        from search.embed import embed_text, embed_image
        from search.preprocess import download_image, process_image, extract_text_from_item
        from vector_db import get_opengraph_item, upsert_opengraph_item
        
        url = result.get("url", "")
        if not url:
            return
        
        # 先检查数据库是否已有该 URL 的数据（包括 embedding）
        existing_item = await get_opengraph_item(url)
        if existing_item and (existing_item.get("text_embedding") or existing_item.get("image_embedding")):
            # 数据库已有 embedding，直接使用
            print(f"[OpenGraph] ✓ Found existing embeddings in DB for: {url[:60]}...")
            result["text_embedding"] = existing_item.get("text_embedding")
            result["image_embedding"] = existing_item.get("image_embedding")
            return
        
        # 数据库没有，需要生成 embedding
        title = result.get("title", "")
        description = result.get("description", "")
        image = result.get("image", "")
        
        # 使用 pipeline 的文本提取逻辑
        text_content = extract_text_from_item(result)
        if not text_content:
            text_content = url  # 如果没有标题和描述，使用 URL
        
        # 异步生成文本和图像 embedding
        print(f"[OpenGraph] Generating embeddings for: {url[:60]}...")
        
        # 生成文本 embedding
        text_emb = None
        if text_content:
            try:
                text_emb = await embed_text(text_content)
                if text_emb:
                    print(f"[OpenGraph] ✓ Text embedding generated for: {url[:60]}...")
            except Exception as e:
                print(f"[OpenGraph] Failed to generate text embedding: {e}")
        
        # 生成图像 embedding
        image_emb = None
        if image and image.startswith(('http://', 'https://')):
            try:
                # 下载并处理图片
                img_data = await download_image(image)
                if img_data:
                    img_base64 = process_image(img_data)
                    if img_base64:
                        image_emb = await embed_image(img_base64)
                if image_emb:
                            print(f"[OpenGraph] ✓ Image embedding generated for: {url[:60]}...")
            except Exception as e:
                print(f"[OpenGraph] Failed to generate image embedding: {e}")
        
        # 存储到数据库
        if text_emb or image_emb:
            try:
                await upsert_opengraph_item(
                url=url,
                title=title,
                description=description,
                image=image,
                    site_name=result.get("site_name", ""),
                text_embedding=text_emb,
                image_embedding=image_emb,
                )
                print(f"[OpenGraph] ✓ Embeddings stored to DB for: {url[:60]}...")
            except Exception as e:
                print(f"[OpenGraph] Failed to store embeddings to DB: {e}")
        
        # 更新 result
        result["text_embedding"] = text_emb
        result["image_embedding"] = image_emb
            
    except Exception as e:
        print(f"[OpenGraph] Error in _prefetch_embedding: {e}")
        import traceback
        traceback.print_exc()
