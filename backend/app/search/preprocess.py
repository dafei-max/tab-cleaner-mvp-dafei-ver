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
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(
                image_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            )
            resp.raise_for_status()
            if len(resp.content) > MAX_IMAGE_SIZE:
                return None
            return resp.content
    except Exception:
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
    url = (item.get("url") or "").lower()
    doc_keys = ["github.com", "readthedocs", "/docs/", "developer.", "dev."]
    return any(k in url for k in doc_keys)




