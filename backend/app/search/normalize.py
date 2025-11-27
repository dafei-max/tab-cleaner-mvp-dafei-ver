"""
OpenGraph 数据规范化模块
确保前端发送的数据与后端期望的格式完全一致
"""
from typing import Dict, List, Optional, Any, Union


def normalize_opengraph_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化单个 OpenGraph 项，确保所有字段类型正确
    
    规则：
    - url: str (required)
    - title: str | None
    - description: str | None
    - image: str | None (必须是字符串，不能是数组)
    - site_name: str | None
    - tab_id: int | None
    - tab_title: str | None
    - text_embedding: List[float] | None (1024维)
    - image_embedding: List[float] | None (1024维)
    - metadata: Dict | None
    - is_doc_card: bool
    - is_screenshot: bool
    - success: bool
    
    处理：
    - 将 undefined/None 转换为 None
    - 将数组转换为字符串（对于 image 字段）
    - 确保字符串字段不是数组
    - 验证向量维度
    """
    if not item or not isinstance(item, dict):
        raise ValueError("Item must be a non-empty dictionary")
    
    normalized = {}
    
    # 1. url (required, string)
    url = item.get("url")
    if not url:
        raise ValueError("url is required")
    normalized["url"] = str(url).strip()
    
    # 2. title (string | None)
    title = item.get("title") or item.get("og:title") or item.get("tab_title")
    normalized["title"] = str(title).strip() if title else None
    
    # 3. description (string | None)
    description = item.get("description") or item.get("og:description")
    normalized["description"] = str(description).strip() if description else None
    
    # 4. image (string | None) - 关键：不能是数组
    image = item.get("image") or item.get("og:image") or item.get("thumbnail_url")
    if image:
        if isinstance(image, list):
            # 如果是数组，取第一个元素
            if len(image) > 0:
                normalized["image"] = str(image[0]).strip()
            else:
                normalized["image"] = None
        elif isinstance(image, str):
            normalized["image"] = image.strip() if image.strip() else None
        else:
            normalized["image"] = str(image).strip() if image else None
    else:
        normalized["image"] = None
    
    # 5. site_name (string | None)
    site_name = item.get("site_name") or item.get("og:site_name")
    normalized["site_name"] = str(site_name).strip() if site_name else None
    
    # 6. tab_id (int | None)
    tab_id = item.get("tab_id")
    if tab_id is not None:
        try:
            normalized["tab_id"] = int(tab_id)
        except (ValueError, TypeError):
            normalized["tab_id"] = None
    else:
        normalized["tab_id"] = None
    
    # 7. tab_title (string | None)
    tab_title = item.get("tab_title")
    normalized["tab_title"] = str(tab_title).strip() if tab_title else None
    
    # 8. text_embedding (List[float] | None)
    text_embedding = item.get("text_embedding")
    if text_embedding and isinstance(text_embedding, list) and len(text_embedding) > 0:
        try:
            # 验证是数字列表
            normalized["text_embedding"] = [float(x) for x in text_embedding]
            # 验证维度（应该是1024）
            if len(normalized["text_embedding"]) != 1024:
                print(f"[Normalize] Warning: text_embedding has {len(normalized['text_embedding'])} dims, expected 1024")
        except (ValueError, TypeError):
            normalized["text_embedding"] = None
    else:
        normalized["text_embedding"] = None
    
    # 9. image_embedding (List[float] | None)
    image_embedding = item.get("image_embedding")
    if image_embedding and isinstance(image_embedding, list) and len(image_embedding) > 0:
        try:
            normalized["image_embedding"] = [float(x) for x in image_embedding]
            if len(normalized["image_embedding"]) != 1024:
                print(f"[Normalize] Warning: image_embedding has {len(normalized['image_embedding'])} dims, expected 1024")
        except (ValueError, TypeError):
            normalized["image_embedding"] = None
    else:
        normalized["image_embedding"] = None
    
    # 10. metadata (Dict | None)
    metadata = item.get("metadata")
    if metadata and isinstance(metadata, dict):
        normalized["metadata"] = metadata
    else:
        normalized["metadata"] = {}
    
    # 11. 布尔字段
    normalized["is_doc_card"] = bool(item.get("is_doc_card", False))
    normalized["is_screenshot"] = bool(item.get("is_screenshot", False))
    normalized["success"] = bool(item.get("success", True))
    
    # 12. 其他字段（保留但不强制）
    if "image_width" in item:
        try:
            normalized["image_width"] = int(item["image_width"]) if item["image_width"] else None
        except (ValueError, TypeError):
            normalized["image_width"] = None
    
    if "image_height" in item:
        try:
            normalized["image_height"] = int(item["image_height"]) if item["image_height"] else None
        except (ValueError, TypeError):
            normalized["image_height"] = None
    
    return normalized


def normalize_opengraph_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    批量规范化 OpenGraph 项列表
    """
    normalized = []
    for item in items:
        try:
            normalized.append(normalize_opengraph_item(item))
        except Exception as e:
            print(f"[Normalize] Failed to normalize item: {e}")
            # 跳过无效项，继续处理其他项
            continue
    return normalized




