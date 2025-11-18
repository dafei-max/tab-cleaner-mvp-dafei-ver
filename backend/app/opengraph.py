"""
OpenGraph 抓取工具
支持截图功能：当 OpenGraph 抓取失败或识别为文档类网页时，使用截图
支持预取 Embedding：一旦 OpenGraph 数据解析完成，立即请求 embedding
"""
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional
import asyncio
import json
from pathlib import Path

# 延迟导入 screenshot 模块，避免 Playwright 未安装时出错
try:
    from screenshot import get_screenshot_as_base64, is_doc_like_url
    SCREENSHOT_AVAILABLE = True
except ImportError:
    SCREENSHOT_AVAILABLE = False
    print("[OpenGraph] WARNING: Screenshot module not available. Screenshot fallback disabled.")
    
    # 提供占位函数
    def is_doc_like_url(url: str) -> bool:
        """占位函数：判断是否为文档类网页"""
        url_lower = url.lower()
        doc_keywords = [
            "github.com",
            "readthedocs.io",
            "/docs/",
            "developer.",
            "dev.",
            "documentation",
            "wiki",
        ]
        return any(keyword in url_lower for keyword in doc_keywords)
    
    async def get_screenshot_as_base64(url: str) -> Optional[str]:
        """占位函数：获取截图"""
        return None


async def _try_backend_screenshot(url: str, result: Dict, wait_for_completion: bool = False) -> None:
    """
    异步尝试后端截图
    如果截图成功，会更新 result 字典（替换文档卡片）
    
    Args:
        url: 要截图的 URL
        result: 结果字典（会被更新）
        wait_for_completion: 如果为 True，等待截图完成（用于前端截图失败的情况）
    """
    try:
        from screenshot import get_screenshot_as_base64
        screenshot_b64 = await get_screenshot_as_base64(url)
        if screenshot_b64:
            # 更新结果（替换文档卡片）
            result["image"] = screenshot_b64
            result["is_screenshot"] = True
            result["is_doc_card"] = False  # 不再是文档卡片
            result["pending_screenshot"] = False  # 截图完成
            print(f"[OpenGraph] Backend screenshot completed for: {url[:60]}...")
        else:
            result["pending_screenshot"] = False  # 截图失败，保持文档卡片
            print(f"[OpenGraph] Backend screenshot failed (no image) for: {url[:60]}...")
    except Exception as e:
        result["pending_screenshot"] = False  # 截图失败，保持文档卡片
        print(f"[OpenGraph] Backend screenshot failed (error) for: {url[:60]}... Error: {str(e)}")


async def fetch_opengraph(url: str, timeout: float = 10.0, use_screenshot_fallback: bool = True) -> Dict:
    """
    抓取单个 URL 的 OpenGraph 数据
    
    如果 OpenGraph 抓取失败或识别为文档类网页，将使用截图作为后备方案
    
    Args:
        url: 要抓取的网页 URL
        timeout: 请求超时时间（秒）
        use_screenshot_fallback: 是否在失败时使用截图后备方案
    
    Returns:
        {
            "url": str,
            "title": str,
            "description": str,
            "image": str,  # OpenGraph 图片 URL 或截图 Base64
            "site_name": str,
            "success": bool,
            "error": Optional[str],
            "is_screenshot": bool,  # 是否为截图
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
    }

    # 优先尝试抓取 OpenGraph（所有网页都先尝试 OpenGraph）
    # 只有 OpenGraph 失败且是文档类时，才使用截图/文档卡片
    try:
        # 构建更完整的 headers（参考测试脚本）
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
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 提取 OpenGraph 标签
            og_title = soup.find('meta', property='og:title')
            og_description = soup.find('meta', property='og:description')
            og_image = soup.find('meta', property='og:image')
            og_image_width = soup.find('meta', property='og:image:width')
            og_image_height = soup.find('meta', property='og:image:height')
            og_site_name = soup.find('meta', property='og:site_name')
            
            # 提取标准 meta 标签作为后备
            meta_title = soup.find('meta', attrs={'name': 'title'}) or soup.find('title')
            meta_description = soup.find('meta', attrs={'name': 'description'})
            
            result["title"] = (
                og_title.get('content', '') if og_title else
                (meta_title.string if meta_title and hasattr(meta_title, 'string') else meta_title.get('content', '')) if meta_title else
                url
            )
            
            result["description"] = (
                og_description.get('content', '') if og_description else
                meta_description.get('content', '') if meta_description else
                ''
            )
            
            result["image"] = og_image.get('content', '') if og_image else ''
            
            # 处理图片 URL（参考测试脚本的 normalize_img 逻辑）
            if result["image"]:
                image_url = result["image"].strip()
                # 处理 // 开头的协议相对 URL（如 //example.com/image.jpg）
                if image_url.startswith('//'):
                    result["image"] = 'https:' + image_url
                # 处理相对路径
                elif not image_url.startswith(('http://', 'https://')):
                    from urllib.parse import urljoin
                    # 使用 response.url 作为 base（处理重定向后的最终 URL）
                    result["image"] = urljoin(str(response.url), image_url)
                else:
                    # 已经是绝对 URL，直接使用（包括 http:// 和 https://）
                    result["image"] = image_url
            
            # 提取图片尺寸（如果 OpenGraph 提供了）
            if og_image_width and og_image_width.get('content'):
                try:
                    result["image_width"] = int(og_image_width.get('content'))
                except (ValueError, TypeError):
                    result["image_width"] = None
            else:
                result["image_width"] = None
                
            if og_image_height and og_image_height.get('content'):
                try:
                    result["image_height"] = int(og_image_height.get('content'))
                except (ValueError, TypeError):
                    result["image_height"] = None
            else:
                result["image_height"] = None
            
            # 如果 OpenGraph 没有提供尺寸，尝试从图片 URL 获取实际尺寸
            if result["image"] and result["image"].startswith(('http://', 'https://')) and (not result["image_width"] or not result["image_height"]):
                try:
                    from PIL import Image
                    from io import BytesIO
                    
                    # 构建 headers，针对不同网站使用不同的策略
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    }
                    
                    # 小红书图片需要 Referer（包括所有 xhscdn.com 域名）
                    image_url_lower = result["image"].lower()
                    if ("xiaohongshu.com" in image_url_lower or 
                        "picasso-static.xiaohongshu.com" in image_url_lower or
                        "xhscdn.com" in image_url_lower or
                        "sns-webpic-qc.xhscdn.com" in image_url_lower):
                        headers["Referer"] = "https://www.xiaohongshu.com/"
                        headers["Origin"] = "https://www.xiaohongshu.com"
                    
                    async with httpx.AsyncClient(timeout=5.0) as img_client:
                        img_response = await img_client.get(result["image"], headers=headers)
                        if img_response.status_code == 200:
                            img_data = BytesIO(img_response.content)
                            img = Image.open(img_data)
                            w, h = img.size
                            result["image_width"] = w
                            result["image_height"] = h
                            print(f"[OpenGraph] Fetched image dimensions from URL: {w}x{h} for {url[:60]}...")
                except Exception as e:
                    # 获取图片尺寸失败不影响主流程，只记录日志
                    print(f"[OpenGraph] Failed to fetch image dimensions from URL for {url[:60]}...: {str(e)}")
            
            result["site_name"] = og_site_name.get('content', '') if og_site_name else ''
            
            # 如果 OpenGraph 抓取成功且有图片，立即预取 embedding
            if result["image"]:
                result["success"] = True
                # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                await _prefetch_embedding(result)
                return result
            
            # 如果 OpenGraph 抓取成功但无图片，检查是否为文档类
            # 只有文档类才使用截图/文档卡片，普通网页即使没有图片也返回成功
            is_doc_like = is_doc_like_url(url)
            if is_doc_like and use_screenshot_fallback and SCREENSHOT_AVAILABLE:
                print(f"[OpenGraph] No og:image found for doc-like URL, using screenshot fallback: {url[:60]}...")
                try:
                    screenshot_b64 = await get_screenshot_as_base64(url)
                    if screenshot_b64:
                        result["image"] = screenshot_b64
                        result["is_screenshot"] = True
                        result["success"] = True
                        result["description"] = "网页截图（OpenGraph 无图片）"
                        # 尝试从 URL 提取站点名称
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        if not result["site_name"]:
                            result["site_name"] = parsed.netloc or ""
                        # 从 Base64 截图获取图片尺寸
                        try:
                            import base64
                            from PIL import Image
                            from io import BytesIO
                            # 提取 Base64 数据（去掉 data URI 前缀）
                            if screenshot_b64.startswith('data:image'):
                                base64_data = screenshot_b64.split(',', 1)[1]
                            else:
                                base64_data = screenshot_b64
                            img_data = BytesIO(base64.b64decode(base64_data))
                            img = Image.open(img_data)
                            w, h = img.size
                            result["image_width"] = w
                            result["image_height"] = h
                            print(f"[OpenGraph] Screenshot dimensions: {w}x{h} for {url[:60]}...")
                        except Exception as e:
                            print(f"[OpenGraph] Failed to get screenshot dimensions for {url[:60]}...: {str(e)}")
                            result["image_width"] = None
                            result["image_height"] = None
                        # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                        await _prefetch_embedding(result)
                    else:
                        # 截图失败，使用文档卡片生成器
                        print(f"[OpenGraph] Screenshot failed for doc-like URL, generating doc card: {url[:60]}...")
                        from doc_card_generator import generate_doc_card_data_uri, detect_doc_type
                        from urllib.parse import urlparse
                        
                        parsed = urlparse(url)
                        site_name = result.get("site_name") or parsed.netloc or ""
                        if site_name.startswith("www."):
                            site_name = site_name[4:]
                        
                        if not result.get("title") or result["title"] == url:
                            path_parts = [p for p in parsed.path.split("/") if p]
                            result["title"] = path_parts[-1] if path_parts else site_name or url
                        
                        if not result.get("site_name"):
                            result["site_name"] = site_name
                        
                        doc_card_data_uri = generate_doc_card_data_uri(
                            title=result["title"],
                            url=url,
                            site_name=result["site_name"],
                            description=result.get("description", ""),
                        )
                        
                        result["image"] = doc_card_data_uri
                        result["is_screenshot"] = False
                        result["is_doc_card"] = True
                        result["success"] = True
                        result["doc_type"] = detect_doc_type(url, result["site_name"]).get("type", "网页")
                        # 文档卡片使用固定尺寸（200x150）
                        result["image_width"] = 200
                        result["image_height"] = 150
                        # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                        await _prefetch_embedding(result)
                except Exception as screenshot_error:
                    # 如果截图也失败，使用文档卡片生成器
                    print(f"[OpenGraph] Screenshot error for doc-like URL, generating doc card: {url[:60]}...")
                    try:
                        from doc_card_generator import generate_doc_card_data_uri, detect_doc_type
                        from urllib.parse import urlparse
                        
                        parsed = urlparse(url)
                        site_name = result.get("site_name") or parsed.netloc or ""
                        if site_name.startswith("www."):
                            site_name = site_name[4:]
                        
                        if not result.get("title") or result["title"] == url:
                            path_parts = [p for p in parsed.path.split("/") if p]
                            result["title"] = path_parts[-1] if path_parts else site_name or url
                        
                        if not result.get("site_name"):
                            result["site_name"] = site_name
                        
                        doc_card_data_uri = generate_doc_card_data_uri(
                            title=result["title"],
                            url=url,
                            site_name=result["site_name"],
                            description=result.get("description", ""),
                        )
                        
                        result["image"] = doc_card_data_uri
                        result["is_screenshot"] = False
                        result["is_doc_card"] = True
                        result["success"] = True
                        result["doc_type"] = detect_doc_type(url, result["site_name"]).get("type", "网页")
                        # 文档卡片使用固定尺寸（200x150）
                        result["image_width"] = 200
                        result["image_height"] = 150
                        # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                        await _prefetch_embedding(result)
                    except Exception as card_error:
                        result["error"] = f"OpenGraph 无图片，截图失败: {str(screenshot_error)}，卡片生成失败: {str(card_error)}"
                        result["success"] = False
            else:
                # 普通网页即使没有图片，也算成功（返回 OpenGraph 数据，前端可以显示标题等）
                result["success"] = True
                # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                await _prefetch_embedding(result)
                return result
            
    except Exception as e:
        result["error"] = str(e)
        result["success"] = False
        
        # 如果 OpenGraph 抓取失败，检查是否为文档类
        # 只有文档类才使用截图/文档卡片，普通网页返回失败
        is_doc_like = is_doc_like_url(url)
        if is_doc_like and use_screenshot_fallback and SCREENSHOT_AVAILABLE:
            print(f"[OpenGraph] OpenGraph fetch failed for doc-like URL, using screenshot fallback: {url[:60]}...")
            try:
                screenshot_b64 = await get_screenshot_as_base64(url)
                if screenshot_b64:
                    result["image"] = screenshot_b64
                    result["is_screenshot"] = True
                    result["success"] = True
                    result["title"] = url  # 使用 URL 作为标题
                    result["description"] = "网页截图（OpenGraph 抓取失败）"
                    # 尝试从 URL 提取站点名称
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    result["site_name"] = parsed.netloc or ""
                    result["error"] = None  # 清除错误，因为截图成功
                    # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                    await _prefetch_embedding(result)
                else:
                    # 截图失败，使用文档卡片生成器
                    print(f"[OpenGraph] Screenshot failed for doc-like URL, generating doc card: {url[:60]}...")
                    from doc_card_generator import generate_doc_card_data_uri, detect_doc_type
                    from urllib.parse import urlparse
                    
                    parsed = urlparse(url)
                    site_name = parsed.netloc or ""
                    if site_name.startswith("www."):
                        site_name = site_name[4:]
                    
                    path_parts = [p for p in parsed.path.split("/") if p]
                    title = path_parts[-1] if path_parts else site_name or url
                    
                    doc_card_data_uri = generate_doc_card_data_uri(
                        title=title,
                        url=url,
                        site_name=site_name,
                        description="网页卡片（OpenGraph 抓取失败）",
                    )
                    
                    result["image"] = doc_card_data_uri
                    result["is_screenshot"] = False
                    result["is_doc_card"] = True
                    result["success"] = True
                    result["title"] = title
                    result["description"] = "网页卡片（OpenGraph 抓取失败）"
                    result["site_name"] = site_name
                    result["doc_type"] = detect_doc_type(url, site_name).get("type", "网页")
                    result["error"] = None  # 清除错误，因为卡片生成成功
                    # 文档卡片使用固定尺寸（200x150）
                    result["image_width"] = 200
                    result["image_height"] = 150
            except Exception as screenshot_error:
                # 如果截图也失败，使用文档卡片生成器
                if is_doc_like_url(url):
                    try:
                        from doc_card_generator import generate_doc_card_data_uri, detect_doc_type
                        from urllib.parse import urlparse
                        
                        parsed = urlparse(url)
                        site_name = parsed.netloc or ""
                        if site_name.startswith("www."):
                            site_name = site_name[4:]
                        
                        path_parts = [p for p in parsed.path.split("/") if p]
                        title = path_parts[-1] if path_parts else site_name or url
                        
                        doc_card_data_uri = generate_doc_card_data_uri(
                            title=title,
                            url=url,
                            site_name=site_name,
                            description="网页卡片（OpenGraph 和截图均失败）",
                        )
                        
                        result["image"] = doc_card_data_uri
                        result["is_screenshot"] = False
                        result["is_doc_card"] = True
                        result["success"] = True
                        result["title"] = title
                        result["description"] = "网页卡片（OpenGraph 和截图均失败）"
                        result["site_name"] = site_name
                        result["doc_type"] = detect_doc_type(url, site_name).get("type", "网页")
                        result["error"] = None
                        # 文档卡片使用固定尺寸（200x150）
                        result["image_width"] = 200
                        result["image_height"] = 150
                    except Exception as card_error:
                        result["error"] = f"OpenGraph 抓取失败: {str(e)}，截图生成异常: {str(screenshot_error)}，卡片生成异常: {str(card_error)}"
                else:
                    result["error"] = f"OpenGraph 抓取失败: {str(e)}，截图生成异常: {str(screenshot_error)}"
    
    # 注意：所有成功分支都已经调用了 _prefetch_embedding，这里不需要再次调用
    return result


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
        is_screenshot = result.get("is_screenshot", False)
        
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
                    result["text_embedding"] = text_emb
                    print(f"[OpenGraph] ✓ Text embedding generated: {len(text_emb)} dims")
            except Exception as e:
                print(f"[OpenGraph] ⚠ Text embedding failed: {e}")
        
        # 生成图像 embedding
        image_emb = None
        if image:
            try:
                # 处理图像：如果是 URL 需要下载，如果是 Base64 直接使用
                if is_screenshot or (isinstance(image, str) and image.startswith("data:image")):
                    # 已经是 Base64 格式
                    image_emb = await embed_image(image)
                else:
                    # 是 URL，需要下载并处理
                    image_data = await download_image(image)
                    if image_data:
                        img_b64 = process_image(image_data)
                        if img_b64:
                            image_emb = await embed_image(img_b64)
                
                if image_emb:
                    result["image_embedding"] = image_emb
                    print(f"[OpenGraph] ✓ Image embedding generated: {len(image_emb)} dims")
            except Exception as e:
                print(f"[OpenGraph] ⚠ Image embedding failed: {e}")
        
        # 存储到向量数据库
        if text_emb or image_emb:
            success = await upsert_opengraph_item(
                url=url,
                title=title,
                description=description,
                image=image,
                site_name=result.get("site_name"),
                tab_id=result.get("tab_id"),
                tab_title=result.get("tab_title"),
                text_embedding=text_emb,
                image_embedding=image_emb,
                metadata={
                    "is_screenshot": is_screenshot,
                    "is_doc_card": result.get("is_doc_card", False),
                    "success": result.get("success", False),
                }
            )
            if success:
                print(f"[OpenGraph] ✓ Stored embeddings to DB for: {url[:60]}...")
            else:
                print(f"[OpenGraph] ⚠ Failed to store embeddings to DB for: {url[:60]}...")
        else:
            print(f"[OpenGraph] ⚠ No embeddings generated for: {url[:60]}...")
            
    except Exception as e:
        # 预取失败不影响主流程，只记录日志
        print(f"[OpenGraph] ⚠ Failed to pre-fetch embeddings for {result.get('url', '')[:60]}...: {str(e)}")
        import traceback
        traceback.print_exc()


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
                "error": str(result)
            })
        else:
            processed_results.append(result)
    
    return processed_results


