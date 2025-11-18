"""
OpenGraph 抓取工具
支持截图功能：当 OpenGraph 抓取失败或识别为文档类网页时，使用截图
支持预取 Embedding：一旦 OpenGraph 数据解析完成，立即请求 embedding
"""
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple
import asyncio
import json
from pathlib import Path

# Screenshot 功能已移除（Playwright 体积过大，不适合 Serverless）
# 截图功能由前端 Chrome Extension 的 chrome.tabs.captureVisibleTab 处理

def _is_doc_like_url(url: str) -> bool:
    """判断是否为文档类网页"""
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


def get_best_image_candidate(soup, response_url: str) -> Tuple[Optional[str], Optional[str]]:
    """
    CleanTab 图像决策树：按优先级提取最佳图片 URL
    
    优先级从高到低：
    ① 首图（正文第一张大图）- 最完美的 preview
    ② OG/Twitter Card 图像 - 平台提供的预览图
    ③ 截图 fallback（由前端处理）
    ④ 文档类占位图（由前端处理）
    ⑤ favicon（仅用于 corner badge，不作为主图）
    
    Returns:
        (image_url, source_type): 图片 URL 和来源类型
        source_type 可能的值：
        - 'first-img': 正文第一个大图（最高优先级）
        - 'og:image': OpenGraph 图片
        - 'twitter:image': Twitter Card 图片
        - 'itemprop:image': Schema.org itemprop
        - 'link:image_src': <link rel="image_src">
        - None: 没有找到图片（需要截图或占位图）
    """
    from urllib.parse import urljoin
    
    # 确保 response_url 是字符串（httpx.Response.url 可能是 URL 对象）
    response_url_str = str(response_url) if not isinstance(response_url, str) else response_url
    
    # Pinterest 特殊处理：优先使用 OG 图片而不是首图（因为首图可能是缩略图）
    response_url_lower = response_url_str.lower()
    is_pinterest_page = "pinterest.com" in response_url_lower
    
    # ① 首图（正文第一张大图）- 最高优先级
    # 这是最完美的 preview，因为它是用户实际看到的内容
    # 注意：Pinterest 等平台跳过首图选择，直接使用 OG 图片
    img_tags = soup.find_all('img', src=True)
    if img_tags and not is_pinterest_page:
        exclude_keywords = [
            'icon', 'logo', 'avatar', 'favicon', 'sprite',
            'button', 'arrow', 'badge', 'spinner', 'loader',
            'placeholder', 'blank', 'pixel', 'tracker', 'beacon'
        ]
        
        best_image = None
        best_score = 0
        
        for img in img_tags:
            src = img.get('src', '').strip()
            if not src:
                continue
            
            # 跳过 data URI 和 SVG（通常是小图标）
            if src.startswith('data:') or src.endswith('.svg'):
                continue
            
            # 跳过包含排除关键词的图片
            src_lower = src.lower()
            if any(keyword in src_lower for keyword in exclude_keywords):
                continue
            
            # 计算图片的"代表性"分数
            score = 0
            
            # 优先选择有 alt 文本的图片（通常是内容图片）
            if img.get('alt'):
                score += 10
            
            # 优先选择较大的图片（通过 class、id 等判断）
            img_class = img.get('class', [])
            img_id = img.get('id', '')
            class_id_str = ' '.join(img_class) + ' ' + img_id
            class_id_lower = class_id_str.lower()
            
            # 内容相关的关键词加分
            content_keywords = ['content', 'main', 'article', 'post', 'image', 'photo', 'picture', 'cover', 'hero', 'banner']
            if any(keyword in class_id_lower for keyword in content_keywords):
                score += 5
            
            # 优先选择绝对 URL
            if src.startswith(('http://', 'https://')):
                score += 3
            
            # 优先选择常见的图片格式
            if any(ext in src_lower for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                score += 2
            
            # 跳过明显的小图片（通过 URL 中的尺寸参数判断）
            if any(size in src_lower for size in ['16x16', '32x32', '48x48', '64x64', 'w=16', 'w=32', 'h=16', 'h=32']):
                score -= 10
            
            if score > best_score:
                best_score = score
                best_image = src
        
        if best_image:
            # 处理相对 URL
            if best_image.startswith('//'):
                best_image = 'https:' + best_image
            elif not best_image.startswith(('http://', 'https://')):
                best_image = urljoin(response_url_str, best_image)
            return best_image, 'first-img'
    
    # ② OG/Twitter Card 图像 - 平台提供的预览图
    # 2.1 OpenGraph 图片
    og_image = soup.find('meta', property='og:image')
    if og_image and og_image.get('content'):
        url = og_image.get('content').strip()
        if url:
            # 处理相对 URL
            if url.startswith('//'):
                url = 'https:' + url
            elif not url.startswith(('http://', 'https://')):
                url = urljoin(response_url_str, url)
            return url, 'og:image'
    
    # 2.2 Twitter Card 图片
    twitter_image = soup.find('meta', attrs={'name': 'twitter:image'}) or soup.find('meta', attrs={'property': 'twitter:image'})
    if twitter_image and twitter_image.get('content'):
        url = twitter_image.get('content').strip()
        if url:
            if url.startswith('//'):
                url = 'https:' + url
            elif not url.startswith(('http://', 'https://')):
                url = urljoin(response_url_str, url)
            return url, 'twitter:image'
    
    # 2.3 Schema.org itemprop="image"
    itemprop_image = soup.find('meta', attrs={'itemprop': 'image'})
    if itemprop_image and itemprop_image.get('content'):
        url = itemprop_image.get('content').strip()
        if url:
            if url.startswith('//'):
                url = 'https:' + url
            elif not url.startswith(('http://', 'https://')):
                url = urljoin(response_url_str, url)
            return url, 'itemprop:image'
    
    # 2.4 <link rel="image_src">
    link_image_src = soup.find('link', attrs={'rel': 'image_src'})
    if link_image_src and link_image_src.get('href'):
        url = link_image_src.get('href').strip()
        if url:
            if url.startswith('//'):
                url = 'https:' + url
            elif not url.startswith(('http://', 'https://')):
                url = urljoin(response_url_str, url)
            return url, 'link:image_src'
    
    # ③ 截图 fallback - 由前端处理（chrome.tabs.captureVisibleTab）
    # ④ 文档类占位图 - 由前端处理
    # ⑤ favicon - 仅用于 corner badge，不作为主图
    
    # 没有找到图片，返回 None（前端会使用截图或占位图）
    return None, None


async def fetch_opengraph(url: str, timeout: float = 10.0) -> Dict:
    """
    抓取单个 URL 的 OpenGraph 数据
    
    如果 OpenGraph 抓取失败或识别为文档类网页，将使用文档卡片作为后备方案
    
    Args:
        url: 要抓取的网页 URL
        timeout: 请求超时时间（秒）
    
    Returns:
        {
            "url": str,
            "title": str,
            "description": str,
            "image": str,  # OpenGraph 图片 URL 或截图 Base64
            "site_name": str,
            "success": bool,
            "error": Optional[str],
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
        "needs_screenshot": False,  # 标记是否需要前端截图
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
            
            # 🔍 诊断日志：记录关键信息（用于定位环境/风控问题）
            print(f"[OpenGraph] ====== 诊断信息开始 ======")
            print(f"[OpenGraph] Request URL: {url}")
            print(f"[OpenGraph] Final URL: {response.url}")
            print(f"[OpenGraph] Status Code: {response.status_code}")
            print(f"[OpenGraph] Response Length: {len(response.text)} bytes")
            
            # 记录请求 headers（用于对比本地和云端）
            print(f"[OpenGraph] Request Headers:")
            for k, v in headers.items():
                print(f"[OpenGraph]   {k}: {v}")
            
            # 记录响应 headers（检查是否有重定向、限制等）
            print(f"[OpenGraph] Response Headers (关键):")
            important_headers = ['content-type', 'content-length', 'location', 'x-ratelimit', 'cf-ray', 'server']
            for k, v in response.headers.items():
                if any(h in k.lower() for h in important_headers):
                    print(f"[OpenGraph]   {k}: {v}")
            
            # 检查响应内容（判断是否被拦截）
            response_preview = response.text[:1000]
            print(f"[OpenGraph] Response Preview (first 1000 chars):")
            print(f"[OpenGraph] {response_preview}")
            
            # 检查是否被重定向到错误页面或拦截页面
            if any(keyword in response_preview.lower() for keyword in ['access denied', 'blocked', 'captcha', '403', 'forbidden']):
                print(f"[OpenGraph] ⚠️  警告：响应可能被拦截或限制")
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 检查是否有 OG 标签
            og_title_tag = soup.find('meta', property='og:title')
            og_image_tag = soup.find('meta', property='og:image')
            og_description_tag = soup.find('meta', property='og:description')
            
            print(f"[OpenGraph] OG Tags Detection:")
            print(f"[OpenGraph]   OG Title: {'✅ Found' if og_title_tag else '❌ Not Found'}")
            if og_title_tag:
                title_content = og_title_tag.get('content', '')[:100]
                print(f"[OpenGraph]     Content: {title_content}")
            print(f"[OpenGraph]   OG Image: {'✅ Found' if og_image_tag else '❌ Not Found'}")
            if og_image_tag:
                image_content = og_image_tag.get('content', '')[:100]
                print(f"[OpenGraph]     Content: {image_content}")
            print(f"[OpenGraph]   OG Description: {'✅ Found' if og_description_tag else '❌ Not Found'}")
            
            # 检查是否有 JSON-LD
            jsonld_tags = soup.select('script[type="application/ld+json"]')
            print(f"[OpenGraph] JSON-LD scripts: {len(jsonld_tags)} found")
            if jsonld_tags:
                for i, tag in enumerate(jsonld_tags[:2]):  # 只打印前2个
                    try:
                        jsonld_data = json.loads(tag.string or "{}")
                        keys = list(jsonld_data.keys())[:10]
                        print(f"[OpenGraph]   JSON-LD #{i+1} keys: {keys}")
                        # 检查是否有图片或标题
                        if 'image' in jsonld_data or 'name' in jsonld_data:
                            print(f"[OpenGraph]     Contains image/name data: ✅")
                    except Exception as e:
                        print(f"[OpenGraph]     JSON-LD #{i+1} parse error: {e}")
            
            # Pinterest 特定检查
            if "pinterest.com" in url.lower():
                print(f"[OpenGraph] Pinterest-specific checks:")
                pinimg_images = soup.select('img[src*="pinimg.com"], img[data-src*="pinimg.com"]')
                print(f"[OpenGraph]   pinimg.com images: {len(pinimg_images)} found")
                if pinimg_images:
                    first_img = pinimg_images[0].get('src') or pinimg_images[0].get('data-src')
                    print(f"[OpenGraph]     First image: {first_img[:80] if first_img else 'None'}")
                
                # 检查是否有 Pinterest 的 JavaScript 数据
                scripts_with_pinterest = [s for s in soup.select('script') if s.string and ('pinimg' in s.string.lower() or 'pinterest' in s.string.lower())]
                print(f"[OpenGraph]   Scripts with Pinterest data: {len(scripts_with_pinterest)}")
            
            print(f"[OpenGraph] ====== 诊断信息结束 ======")
            
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
            
            # 使用多层取图策略
            image_url, image_source = get_best_image_candidate(soup, response.url)
            
            if image_url:
                # 找到了图片（首图或 OG/Twitter Card），不需要截图
                result["image"] = image_url
                result["needs_screenshot"] = False  # 明确设置为 False
                print(f"[OpenGraph] Found image via {image_source}: {image_url[:80]}...")
            else:
                # 所有 HTML 层都没有找到图片，标记需要截图
                result["image"] = ""
                result["needs_screenshot"] = True
                print(f"[OpenGraph] No image found in HTML, marking needs_screenshot=True")
            
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
            # 注意：对于小红书、Pinterest 等需要特殊 headers 的网站，跳过验证，保留 URL 让前端浏览器加载
            if result["image"] and result["image"].startswith(('http://', 'https://')) and (not result["image_width"] or not result["image_height"]):
                # 检查是否为需要跳过验证的网站（这些网站的 CDN 可能对后端 IP 403，但浏览器可以正常加载）
                image_url_lower = result["image"].lower()
                url_lower = url.lower()
                
                is_xhs = ("xiaohongshu.com" in image_url_lower or 
                         "picasso-static.xiaohongshu.com" in image_url_lower or
                         "xhscdn.com" in image_url_lower or
                         "sns-webpic-qc.xhscdn.com" in image_url_lower)
                
                is_pinterest = ("pinterest.com" in url_lower or 
                               "pinimg.com" in image_url_lower or
                               "pinterest" in image_url_lower)
                
                # 对于需要特殊处理的网站，跳过图片尺寸验证，保留 URL 让前端浏览器加载
                if is_xhs:
                    print(f"[OpenGraph] Skipping image size validation for XHS (preserving URL for frontend): {result['image'][:80]}...")
                elif is_pinterest:
                    print(f"[OpenGraph] Skipping image size validation for Pinterest (preserving URL for frontend): {result['image'][:80]}...")
                else:
                    # 其他网站，尝试获取图片尺寸
                    try:
                        from PIL import Image
                        from io import BytesIO
                        
                        # 构建 headers（为 Pinterest 添加 Referer）
                        headers = {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                            "Referer": url,  # 添加 Referer，帮助某些网站（如 Pinterest）正确加载图片
                            "Origin": url.split('/')[0] + '//' + url.split('/')[2] if '/' in url else url,
                        }
                        
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
                        # 重要：不要清空 result["image"]，保留 URL 让前端浏览器加载
                        print(f"[OpenGraph] Failed to fetch image dimensions from URL for {url[:60]}...: {str(e)} (preserving image URL)")
            
            result["site_name"] = og_site_name.get('content', '') if og_site_name else ''
            
            # 如果 OpenGraph 抓取成功且有图片，立即预取 embedding
            if result["image"]:
                result["success"] = True
                # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                await _prefetch_embedding(result)
                return result
            
            # 如果 OpenGraph 抓取成功但无图片，检查是否为文档类
            # 只有文档类才使用文档卡片，普通网页即使没有图片也返回成功
            is_doc_like = _is_doc_like_url(url)
            if is_doc_like:
                print(f"[OpenGraph] No og:image found for doc-like URL, generating doc card: {url[:60]}...")
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
                    result["is_doc_card"] = True
                    result["success"] = True
                    result["doc_type"] = detect_doc_type(url, result["site_name"]).get("type", "网页")
                    # 文档卡片使用固定尺寸（200x150）
                    result["image_width"] = 200
                    result["image_height"] = 150
                    # 立即预取 embedding（等待完成，确保返回时已有 embedding）
                    await _prefetch_embedding(result)
                except Exception as card_error:
                    result["error"] = f"OpenGraph 无图片，卡片生成失败: {str(card_error)}"
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
        # 只有文档类才使用文档卡片，普通网页返回失败
        is_doc_like = _is_doc_like_url(url)
        if is_doc_like:
            print(f"[OpenGraph] OpenGraph fetch failed for doc-like URL, generating doc card: {url[:60]}...")
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
                    description="网页卡片（OpenGraph 抓取失败）",
                )
                
                result["image"] = doc_card_data_uri
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
            except Exception as card_error:
                result["error"] = f"OpenGraph 抓取失败: {str(e)}，卡片生成失败: {str(card_error)}"
    
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
                if isinstance(image, str) and image.startswith("data:image"):
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


