"""
网页截图工具
用于抓取 OpenGraph 失败或文档类网页时生成截图
"""
from __future__ import annotations

import asyncio
import base64
from io import BytesIO
from typing import Optional, Dict
from PIL import Image

# Playwright 导入（延迟导入，避免未安装时出错）
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("[Screenshot] WARNING: Playwright not installed. Screenshot feature disabled.")
    print("[Screenshot] Install with: uv add playwright && playwright install chromium")

# 截图配置
SCREENSHOT_WIDTH = 1920
SCREENSHOT_HEIGHT = 1080
SCREENSHOT_TIMEOUT = 30000  # 30秒超时
SCREENSHOT_QUALITY = 85  # JPEG 质量


def is_doc_like_url(url: str) -> bool:
    """
    判断 URL 是否为文档类网页（应使用截图而非 OpenGraph）
    
    Args:
        url: 网页 URL
    
    Returns:
        是否为文档类网页
    """
    url_lower = url.lower()
    doc_keywords = [
        "github.com",
        "readthedocs.io",
        "/docs/",
        "developer.",
        "dev.",
        "documentation",
        "wiki",
        "stackoverflow.com",
        "stackexchange.com",
        "jira",
        "confluence",
        "notion.so",
        "gitlab.com",
    ]
    return any(keyword in url_lower for keyword in doc_keywords)


async def take_screenshot(url: str, timeout: int = SCREENSHOT_TIMEOUT) -> Optional[bytes]:
    """
    使用 Playwright 截取网页截图
    
    Args:
        url: 要截图的网页 URL
        timeout: 超时时间（毫秒）
    
    Returns:
        截图的二进制数据（PNG 格式），失败返回 None
    """
    if not PLAYWRIGHT_AVAILABLE:
        print(f"[Screenshot] Playwright not available, cannot take screenshot for {url}")
        return None
    
    try:
        async with async_playwright() as p:
            # 启动浏览器（无头模式）
            browser = await p.chromium.launch(headless=True)
            try:
                # 创建新页面
                context = await browser.new_context(
                    viewport={"width": SCREENSHOT_WIDTH, "height": SCREENSHOT_HEIGHT},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                page = await context.new_page()
                
                # 导航到页面并等待加载
                await page.goto(url, wait_until="networkidle", timeout=timeout)
                
                # 等待页面完全加载（额外等待 1 秒，确保动态内容加载）
                await asyncio.sleep(1)
                
                # 截取整页截图
                screenshot_bytes = await page.screenshot(
                    type="png",
                    full_page=True,  # 截取整页
                    timeout=timeout
                )
                
                await context.close()
                return screenshot_bytes
            finally:
                await browser.close()
    except Exception as e:
        print(f"[Screenshot] Failed to take screenshot for {url}: {type(e).__name__}: {str(e)}")
        return None


def process_screenshot_to_base64(screenshot_bytes: bytes, max_dimension: int = 1024) -> Optional[str]:
    """
    处理截图：调整大小、压缩并转换为 Base64
    
    Args:
        screenshot_bytes: 截图的二进制数据
        max_dimension: 目标最大尺寸（保持宽高比）
    
    Returns:
        Base64 编码的图片字符串（data:image/jpeg;base64,xxx 格式），失败返回 None
    """
    try:
        img = Image.open(BytesIO(screenshot_bytes))
        w, h = img.size
        
        # 如果太大，进行缩放
        if w > max_dimension or h > max_dimension:
            if w > h:
                nw, nh = max_dimension, int(h * (max_dimension / w))
            else:
                nh, nw = max_dimension, int(w * (max_dimension / h))
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)
            w, h = nw, nh
        
        # 转换为 RGB（PNG 可能是 RGBA）
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # 压缩为 JPEG
        out = BytesIO()
        img.save(out, format="JPEG", quality=SCREENSHOT_QUALITY, optimize=True)
        b = out.getvalue()
        
        # 如果还是太大，进一步降低质量
        max_size = 5 * 1024 * 1024  # 5MB
        if len(b) > max_size:
            for q in (70, 60, 50, 40):
                out = BytesIO()
                img.save(out, format="JPEG", quality=q, optimize=True)
                b = out.getvalue()
                if len(b) <= max_size:
                    break
        
        # 转换为 Base64
        b64 = base64.b64encode(b).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception as e:
        print(f"[Screenshot] Failed to process screenshot: {type(e).__name__}: {str(e)}")
        return None


async def get_screenshot_as_base64(url: str) -> Optional[str]:
    """
    获取网页截图并转换为 Base64 格式
    
    Args:
        url: 要截图的网页 URL
    
    Returns:
        Base64 编码的图片字符串，失败返回 None
    """
    screenshot_bytes = await take_screenshot(url)
    if not screenshot_bytes:
        return None
    
    return process_screenshot_to_base64(screenshot_bytes)

