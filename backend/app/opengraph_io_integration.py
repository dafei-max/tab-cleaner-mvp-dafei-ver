"""
OpenGraph.io API 集成
作为 OpenGraph 抓取的备选方案，解决风控问题
参考：https://www.opengraph.io/
"""
import httpx
import os
from typing import Dict, Optional, List
import asyncio

# OpenGraph.io API 配置
OPENGRAPH_IO_API_KEY = os.getenv("OPENGRAPH_IO_API_KEY", "")
OPENGRAPH_IO_API_URL = "https://opengraph.io/api/1.1/site"


async def fetch_opengraph_via_api(url: str, timeout: float = 10.0) -> Dict:
    """
    使用 OpenGraph.io API 抓取 OpenGraph 数据
    
    Args:
        url: 要抓取的网页 URL
        timeout: 请求超时时间（秒）
    
    Returns:
        {
            "url": str,
            "title": str,
            "description": str,
            "image": str,
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
    }
    
    if not OPENGRAPH_IO_API_KEY:
        result["error"] = "OPENGRAPH_IO_API_KEY not configured"
        return result
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            # OpenGraph.io API 请求
            # 文档：https://www.opengraph.io/docs
            response = await client.get(
                OPENGRAPH_IO_API_URL,
                params={
                    "app_id": OPENGRAPH_IO_API_KEY,
                    "site": url,
                },
                headers={
                    "Accept": "application/json",
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # 解析 OpenGraph.io 响应
            # 响应格式参考：https://www.opengraph.io/docs
            if data.get("hybridGraph"):
                og = data["hybridGraph"]
                result["title"] = og.get("title", "") or og.get("siteName", "")
                result["description"] = og.get("description", "")
                result["image"] = og.get("image", "")
                result["site_name"] = og.get("siteName", "")
                result["success"] = True
            elif data.get("openGraph"):
                og = data["openGraph"]
                result["title"] = og.get("title", "") or og.get("siteName", "")
                result["description"] = og.get("description", "")
                result["image"] = og.get("image", "")
                result["site_name"] = og.get("siteName", "")
                result["success"] = True
            else:
                result["error"] = "No OpenGraph data in response"
                
    except httpx.HTTPStatusError as e:
        result["error"] = f"HTTP {e.response.status_code}: {e.response.text[:100]}"
    except Exception as e:
        result["error"] = str(e)
    
    return result


async def fetch_multiple_opengraph_via_api(urls: List[str], max_concurrent: int = 5) -> List[Dict]:
    """
    批量使用 OpenGraph.io API 抓取多个 URL
    
    Args:
        urls: URL 列表
        max_concurrent: 最大并发数（避免超过 API 限制）
    
    Returns:
        OpenGraph 数据列表
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_with_semaphore(url: str):
        async with semaphore:
            return await fetch_opengraph_via_api(url)
    
    tasks = [fetch_with_semaphore(url) for url in urls]
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
            })
        else:
            processed_results.append(result)
    
    return processed_results


