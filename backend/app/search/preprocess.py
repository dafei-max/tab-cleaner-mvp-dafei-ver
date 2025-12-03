from __future__ import annotations

import httpx
from io import BytesIO
from PIL import Image
import base64
from typing import Optional, Dict

from .config import (
    MIN_IMAGE_DIMENSION,
    TARGET_IMAGE_DIMENSION,
    MAX_IMAGE_DIMENSION,
    MAX_IMAGE_SIZE,
)


async def download_image(image_url: str, timeout: float = 10.0) -> Optional[bytes]:
    """
    下载图片数据
    支持小红书等需要特殊 headers 的网站
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
            resp = await client.get(image_url, headers=headers)
            resp.raise_for_status()
            if len(resp.content) > MAX_IMAGE_SIZE:
                print(f"[Preprocess] Image too large: {len(resp.content)} bytes, skipping")
                return None
            return resp.content
    except Exception as e:
        print(f"[Preprocess] Error downloading image {image_url[:60]}...: {e}")
        return None


def process_image(image_data: bytes, max_dimension: int = TARGET_IMAGE_DIMENSION) -> Optional[str]:
    try:
        img = Image.open(BytesIO(image_data))
        w, h = img.size

        # upscale if too small
        if w < MIN_IMAGE_DIMENSION or h < MIN_IMAGE_DIMENSION:
            scale = max(MIN_IMAGE_DIMENSION / max(w, 1), MIN_IMAGE_DIMENSION / max(h, 1))
            w, h = int(round(w * scale)), int(round(h * scale))
            img = img.resize((w, h), Image.Resampling.LANCZOS)

        # downscale if too large
        if w > max_dimension or h > max_dimension:
            if w > h:
                nw, nh = max_dimension, int(h * (max_dimension / w))
            else:
                nh, nw = max_dimension, int(w * (max_dimension / h))
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)
            w, h = nw, nh

        if w > MAX_IMAGE_DIMENSION or h > MAX_IMAGE_DIMENSION:
            scale = min(MAX_IMAGE_DIMENSION / w, MAX_IMAGE_DIMENSION / h)
            w, h = int(w * scale), int(h * scale)
            img = img.resize((w, h), Image.Resampling.LANCZOS)

        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        out = BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        b = out.getvalue()
        if len(b) > MAX_IMAGE_SIZE:
            for q in (70, 60, 50, 40):
                out = BytesIO()
                img.save(out, format="JPEG", quality=q, optimize=True)
                b = out.getvalue()
                if len(b) <= MAX_IMAGE_SIZE:
                    break
        if len(b) > MAX_IMAGE_SIZE:
            return None

        b64 = base64.b64encode(b).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None


def extract_text_from_item(item: Dict) -> str:
    title = item.get("title") or item.get("tab_title") or ""
    description = item.get("description") or ""
    combined = f"{title} {description}".strip()
    return combined[:32000]


def is_image_focused(item: Dict) -> bool:
    url = (item.get("url") or "").lower()
    site = (item.get("site_name") or "").lower()
    keywords = ["pinterest", "xiaohongshu", "arena", "unsplash", "behance"]
    return any(k in url or k in site for k in keywords)


def is_doc_like(item: Dict) -> bool:
    """
    判断是否是文档类内容（需要过滤掉）
    针对设计师场景，过滤掉技术文档、API文档、会议记录等
    
    同时检查 URL 和 OG title，只要有一个匹配就认为是文档
    """
    url = (item.get("url") or "").lower()
    title = (item.get("title") or item.get("tab_title") or "").lower()
    description = (item.get("description") or "").lower()
    site_name = (item.get("site_name") or "").lower()
    
    # 合并所有文本内容用于检查
    all_text = f"{url} {title} {description} {site_name}".lower()
    
    # 文档类网站关键词（扩展列表）
    doc_domains = [
        "github.com", "readthedocs", "developer.", "dev.", "stackoverflow",
        "reddoc", "redoc", "swagger", "api-docs", "apidocs", "documentation",
        "/docs/", "/doc/", "/documentation/", "/api/", "/reference/",
        "mdn", "w3schools", "developer.mozilla", "docs.microsoft",
        "jupyter", "notebook", "colab", "kaggle",
        "docs.xiaohongshu.com",  # 小红书文档站点
        "docs.",  # 任何 docs. 开头的域名
        # 内部系统 / 工具域名：一律视为“工作内容”
        "hr.xiaohongshu.com",
        "city.xiaohongshu.com",
        "oa.xiaohongshu.com",
        "ai.devops.xiaohongshu.com",
        "muse.devops.xiaohongshu.com",
    ]
    
    # 文档类标题关键词（扩展，包括会议、管理类）
    doc_title_keywords = [
        # 技术文档类
        "api reference", "documentation", "docs", "guide", "tutorial",
        "reference", "manual", "handbook", "specification", "spec",
        "api", "sdk", "framework", "library", "package",
        # 会议、管理类（需要过滤）- 更严格的匹配
        "周会", "会议", "meeting", "管理", "management", "周报", "日报",
        "管理周会", "管理会议", "部门会议", "团队会议", "例会",
        "视觉设计部管理周会", "产品设计部", "管理周报", "设计部管理",
        "社区设计组", "设计组", "设计部",  # 工作群组相关
        "周报收纳", "管理周报收纳",  # 周报收纳相关
        "工作台", "workbench", "dashboard",  # 工作台相关
        "面试官工作台",  # 具体工作台
        "产品设计部-视觉团队",  # 具体部门团队
        "2025", "2024",  # 日期格式（通常出现在会议记录中）
        # 其他文档类
        "readme", "changelog", "license", "contributing",
        "getting started", "quick start", "installation",
        # 内部工作 UI / 系统页：需要强力挡住
        "我的档案", "我的个人资料", "身份验证", "绩效评价", "转正考核",
        "查看我的反馈", "办公网络连接", "redpass", "问卷系统",
        "技能", "中转页", "工单", "我的工单",
        "red名", "redname",
    ]
    
    # 特殊模式：日期 + 会议关键词（如 "20251117视觉设计部管理周会"）
    import re
    date_meeting_pattern = re.compile(r'\d{8}.*(周会|会议|管理|设计部|设计组|周报)', re.IGNORECASE)
    if date_meeting_pattern.search(all_text):
        return True
    
    # 特殊模式：工作台相关（如 "面试官工作台"、"产品设计部-视觉团队_管理周报收纳"）
    workbench_pattern = re.compile(r'(工作台|workbench|dashboard|周报收纳|管理周报收纳|产品设计部.*视觉团队)', re.IGNORECASE)
    if workbench_pattern.search(all_text):
        return True
    
    # 检查URL中的文档关键词
    url_is_doc = any(keyword in url for keyword in doc_domains)
    
    # 检查标题中的文档关键词
    title_is_doc = any(keyword in title for keyword in doc_title_keywords)
    
    # 检查描述中的文档关键词（作为补充）
    desc_is_doc = any(keyword in description for keyword in doc_title_keywords[:10])  # 只检查前10个关键词
    
    # 特殊规则：如果 URL 包含 docs. 或 /docs/，直接认为是文档
    if "docs." in url or "/docs/" in url or "/doc/" in url:
        # 但排除设计师网站（即使有 docs 也可能是设计文档）
        designer_sites = ["pinterest", "behance", "dribbble", "xiaohongshu.com/explore", "站酷", "zcool"]
        if not any(site in url for site in designer_sites):
            return True
    
    # 如果 URL 或标题匹配文档关键词，认为是文档
    if url_is_doc or title_is_doc:
        # 但排除设计师网站（即使标题有"guide"也可能是设计指南）
        designer_sites = ["pinterest", "behance", "dribbble", "xiaohongshu.com/explore", "站酷", "zcool"]
        if not any(site in url or site in site_name for site in designer_sites):
            return True
    
    # 如果描述也匹配，进一步确认
    if desc_is_doc and (url_is_doc or title_is_doc):
        return True
    
    return False




