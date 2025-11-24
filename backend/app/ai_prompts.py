"""
AI 提示词配置模块
管理所有 AI 洞察相关的提示词模板
"""
from typing import List, Dict


# 支持的图片为主平台
IMAGE_FOCUSED_PLATFORMS = ["pinterest", "xiaohongshu", "arena", "instagram", "pixiv"]


def is_image_focused_platform(url: str, site_name: str = None) -> bool:
    """
    判断是否为图片为主的平台
    """
    url_lower = url.lower()
    site_name_lower = (site_name or "").lower()
    
    for platform in IMAGE_FOCUSED_PLATFORMS:
        if platform in url_lower or platform in site_name_lower:
            return True
    return False


def get_system_prompt() -> str:
    """
    获取系统提示词
    """
    return """你是一个专业的内容分析师。请分析用户提供的网页信息，生成简洁准确的总结。
要求：
1. 总结字数不超过150字
2. 如果网页是图片为主的平台（如Pinterest、小红书、Arena、Behance、Dribble等），重点分析图片内容，生成图片描述和对设计师有帮助的内容信息
3. 其他网页重点关注title和description来确定网页内容
4. 使用中文回答
5. 如果信息不清晰，可以说明需要更多信息"""


def build_user_content_from_opengraph(opengraph_items: List[Dict]) -> str:
    """
    从 OpenGraph 数据构建用户消息内容
    
    Args:
        opengraph_items: OpenGraph 数据列表，每个元素包含 url, title, description, image, site_name 等
    
    Returns:
        格式化的用户消息内容字符串
    """
    user_content_parts = []
    
    for item in opengraph_items:
        # 从 OpenGraph 数据中提取信息
        url = item.get("url", "")
        title = item.get("title") or item.get("tab_title", "")
        description = item.get("description", "")
        image = item.get("image", "")
        site_name = item.get("site_name", "")
        
        # 判断是否为图片为主的平台
        is_image_focused = is_image_focused_platform(url, site_name)
        
        # 构建每个网页的 OpenGraph 信息
        item_info = [f"网页URL: {url}"]
        if site_name:
            item_info.append(f"网站名称: {site_name}")
        if title:
            item_info.append(f"标题: {title}")
        if description:
            item_info.append(f"描述: {description}")
        if image:
            item_info.append(f"图片URL: {image}")
        
        # 如果是图片为主的平台，添加图片分析提示
        if is_image_focused:
            item_info.append("【重点】这是一个图片为主的平台（如Pinterest、小红书、Arena），请重点分析图片内容")
        else:
            item_info.append("【重点】请根据标题和描述来确定网页内容")
        
        user_content_parts.append("\n".join(item_info))
    
    # 合并所有网页的 OpenGraph 信息
    user_content = "\n\n---\n\n".join(user_content_parts)
    user_content += "\n\n请根据以上OpenGraph数据，为这些网页生成一个综合总结（不超过150字）："
    
    return user_content


def build_messages(opengraph_items: List[Dict]) -> List[Dict]:
    """
    构建完整的消息列表（system + user）
    
    Args:
        opengraph_items: OpenGraph 数据列表
    
    Returns:
        消息列表，格式：[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
    """
    return [
        {"role": "system", "content": get_system_prompt()},
        {"role": "user", "content": build_user_content_from_opengraph(opengraph_items)}
    ]





