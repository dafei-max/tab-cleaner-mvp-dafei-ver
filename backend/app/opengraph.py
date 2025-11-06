"""
OpenGraph 抓取工具
支持截图功能：当 OpenGraph 抓取失败或识别为文档类网页时，使用截图
"""
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional
import asyncio

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

    # 检查是否为文档类网页（应使用截图）
    should_use_screenshot = SCREENSHOT_AVAILABLE and is_doc_like_url(url)
    
    if should_use_screenshot:
        print(f"[OpenGraph] URL identified as doc-like, using screenshot: {url[:60]}...")
        # 直接使用截图，跳过 OpenGraph 抓取
        try:
            screenshot_b64 = await get_screenshot_as_base64(url)
            if screenshot_b64:
                result["image"] = screenshot_b64
                result["is_screenshot"] = True
                result["success"] = True
                result["title"] = url  # 使用 URL 作为标题
                result["description"] = "网页截图"
                # 尝试从 URL 提取站点名称
                from urllib.parse import urlparse
                parsed = urlparse(url)
                result["site_name"] = parsed.netloc or ""
            else:
                result["error"] = "截图生成失败"
                result["success"] = False
        except Exception as e:
            result["error"] = f"截图生成异常: {str(e)}"
            result["success"] = False
        return result

    # 尝试抓取 OpenGraph
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 提取 OpenGraph 标签
            og_title = soup.find('meta', property='og:title')
            og_description = soup.find('meta', property='og:description')
            og_image = soup.find('meta', property='og:image')
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
            
            # 处理相对路径的图片 URL
            if result["image"] and not result["image"].startswith(('http://', 'https://')):
                from urllib.parse import urljoin
                result["image"] = urljoin(url, result["image"])
            
            result["site_name"] = og_site_name.get('content', '') if og_site_name else ''
            
            # 如果 OpenGraph 抓取成功但没有图片，且启用截图后备，则使用截图
            if result["image"]:
                result["success"] = True
            elif use_screenshot_fallback and SCREENSHOT_AVAILABLE:
                print(f"[OpenGraph] No og:image found, using screenshot fallback: {url[:60]}...")
                screenshot_b64 = await get_screenshot_as_base64(url)
                if screenshot_b64:
                    result["image"] = screenshot_b64
                    result["is_screenshot"] = True
                    result["success"] = True
                else:
                    result["success"] = False
                    result["error"] = "OpenGraph 抓取成功但无图片，且截图生成失败"
            else:
                result["success"] = True  # 即使没有图片，也算成功
            
    except Exception as e:
        result["error"] = str(e)
        result["success"] = False
        
        # 如果 OpenGraph 抓取失败，且启用截图后备，则使用截图
        if use_screenshot_fallback and SCREENSHOT_AVAILABLE:
            print(f"[OpenGraph] OpenGraph fetch failed, using screenshot fallback: {url[:60]}...")
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
                else:
                    result["error"] = f"OpenGraph 抓取失败且截图生成失败: {str(e)}"
            except Exception as screenshot_error:
                result["error"] = f"OpenGraph 抓取失败: {str(e)}，截图生成异常: {str(screenshot_error)}"
    
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
                "error": str(result)
            })
        else:
            processed_results.append(result)
    
    return processed_results


