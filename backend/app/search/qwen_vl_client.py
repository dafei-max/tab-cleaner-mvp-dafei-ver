"""
Qwen-VL 客户端
用于调用阿里云 Qwen-VL API 生成图片 Caption 和提取视觉属性
"""
from __future__ import annotations

import httpx
import json
import asyncio
from typing import Optional, Dict, List, Any
from .config import get_api_key, DASHSCOPE_API_URL


# Qwen-VL API 端点
QWEN_VL_ENDPOINT = f"{DASHSCOPE_API_URL}/services/aigc/multimodal-generation/generation"
QWEN_VL_MODEL = "qwen-vl-max"  # 使用性能最好的模型

# 批量处理配置
BATCH_SIZE = 5  # 并发处理数量
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY = 1.0  # 重试延迟（秒）


class QwenVLClient:
    """Qwen-VL API 客户端"""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        初始化客户端
        
        Args:
            api_key: API 密钥，如果为 None 则从环境变量读取
        """
        self.api_key = api_key or get_api_key()
        if not self.api_key:
            raise ValueError("DASHSCOPE_API_KEY not found in environment variables")
        
        self.endpoint = QWEN_VL_ENDPOINT
        self.model = QWEN_VL_MODEL
    
    async def _call_api(
        self,
        prompt: str,
        image_url_or_base64: str,
        max_retries: int = MAX_RETRIES,
    ) -> Optional[Dict[str, Any]]:
        """
        调用 Qwen-VL API
        
        Args:
            prompt: 提示词
            image_url_or_base64: 图片 URL 或 Base64 编码
            max_retries: 最大重试次数
        
        Returns:
            API 响应数据，失败返回 None
        """
        # 构建请求体
        # 根据阿里云文档，支持图片 URL 和 Base64 两种方式
        image_content = image_url_or_base64
        
        # 如果输入是 Base64，确保是完整的 Data URI 格式
        if image_url_or_base64.startswith("data:image"):
            # 已经是 Data URI 格式，直接使用
            image_content = image_url_or_base64
        elif not (image_url_or_base64.startswith("http://") or image_url_or_base64.startswith("https://")):
            # 如果是纯 Base64 字符串，添加 Data URI 前缀
            image_content = f"data:image/jpeg;base64,{image_url_or_base64}"
        
        payload = {
            "model": self.model,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"image": image_content},
                            {"text": prompt}
                        ]
                    }
                ]
            },
            "parameters": {
                # 降低温度，提高输出稳定性
                "temperature": 0.1,
                # 提高 max_tokens，让 Caption 和属性描述更完整、更细致
                "max_tokens": 512,
            }
        }
        
        # 重试机制
        last_error = None
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        self.endpoint,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        return data
                    elif resp.status_code == 429:
                        # 限流，等待后重试
                        wait_time = RETRY_DELAY * (2 ** attempt)
                        print(f"[QwenVL] Rate limited, waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        error_text = resp.text[:500]
                        print(f"[QwenVL] ERROR: HTTP {resp.status_code}, response: {error_text}")
                        last_error = f"HTTP {resp.status_code}: {error_text}"
                        if resp.status_code >= 500:
                            # 服务器错误，重试
                            wait_time = RETRY_DELAY * (2 ** attempt)
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            # 客户端错误，不重试
                            return None
                            
            except httpx.TimeoutException:
                last_error = "Request timeout"
                print(f"[QwenVL] Timeout on attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    wait_time = RETRY_DELAY * (2 ** attempt)
                    await asyncio.sleep(wait_time)
                    continue
            except Exception as e:
                last_error = str(e)
                print(f"[QwenVL] EXCEPTION on attempt {attempt + 1}/{max_retries}: {type(e).__name__}: {str(e)}")
                if attempt < max_retries - 1:
                    wait_time = RETRY_DELAY * (2 ** attempt)
                    await asyncio.sleep(wait_time)
                    continue
        
        print(f"[QwenVL] Failed after {max_retries} attempts. Last error: {last_error}")
        return None
    
    async def generate_caption(
        self,
        image_url_or_base64: str,
        include_attributes: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        生成图片 Caption 和视觉属性
        
        Args:
            image_url_or_base64: 图片 URL 或 Base64 编码
            include_attributes: 是否提取视觉属性（颜色、风格、物体）
        
        Returns:
            结构化 JSON：
            {
                "caption": "A modern blue chair...",
                "dominant_colors": ["blue", "white"],
                "style_tags": ["modern", "minimalist"],
                "object_tags": ["chair", "furniture"]
            }
        """
        # 使用集中的 prompt 配置
        from .ai_prompt_config import get_caption_prompt
        prompt = get_caption_prompt(include_attributes=include_attributes)
        
        response = await self._call_api(prompt, image_url_or_base64)
        
        if not response:
            return None
        
        # 解析响应
        try:
            # Qwen-VL 响应格式：output.choices[0].message.content
            output = response.get("output", {})
            choices = output.get("choices", [])
            if not choices:
                print("[QwenVL] No choices in response")
                return None
            
            raw_content = choices[0].get("message", {}).get("content", "")
            if not raw_content:
                print("[QwenVL] No content in response")
                return None
            
            # 处理 content 可能是列表的情况（多模态响应）
            if isinstance(raw_content, list):
                # 提取列表中的文本内容
                text_parts = []
                for item in raw_content:
                    if isinstance(item, dict):
                        # 如果是对象，提取 text 字段
                        if item.get("type") == "text" and "text" in item:
                            text_parts.append(item["text"])
                        elif "text" in item:
                            text_parts.append(item["text"])
                    elif isinstance(item, str):
                        text_parts.append(item)
                content = "".join(text_parts)
            elif isinstance(raw_content, str):
                content = raw_content
            else:
                print(f"[QwenVL] Unexpected content type: {type(raw_content)}")
                return None
            
            if not content:
                print("[QwenVL] No text content extracted")
                return None
            
            # 尝试解析 JSON（Qwen-VL 可能返回 JSON 或文本）
            if include_attributes:
                # 尝试提取 JSON（可能被 markdown 代码块包裹）
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:].strip()
                if content.startswith("```"):
                    content = content[3:].strip()
                if content.endswith("```"):
                    content = content[:-3].strip()
                
                try:
                    result = json.loads(content)
                    # 验证结构
                    if not isinstance(result, dict):
                        raise ValueError("Result is not a dictionary")
                    
                    # 确保所有字段都存在
                    result.setdefault("caption", "")
                    result.setdefault("dominant_colors", [])
                    result.setdefault("style_tags", [])
                    result.setdefault("object_tags", [])
                    
                    # 类型转换
                    if not isinstance(result["dominant_colors"], list):
                        result["dominant_colors"] = []
                    if not isinstance(result["style_tags"], list):
                        result["style_tags"] = []
                    if not isinstance(result["object_tags"], list):
                        result["object_tags"] = []
                    
                    print(f"[QwenVL] SUCCESS: Caption generated, colors: {len(result['dominant_colors'])}, styles: {len(result['style_tags'])}, objects: {len(result['object_tags'])}")
                    return result
                except json.JSONDecodeError as e:
                    print(f"[QwenVL] WARNING: Failed to parse JSON, treating as plain text: {e}")
                    # 如果解析失败，返回纯文本 Caption
                    return {
                        "caption": content,
                        "dominant_colors": [],
                        "style_tags": [],
                        "object_tags": [],
                    }
            else:
                # 只返回 Caption
                return {
                    "caption": content,
                    "dominant_colors": [],
                    "style_tags": [],
                    "object_tags": [],
                }
                
        except Exception as e:
            print(f"[QwenVL] EXCEPTION parsing response: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    async def batch_generate_caption(
        self,
        images: List[str],
        include_attributes: bool = True,
    ) -> List[Optional[Dict[str, Any]]]:
        """
        批量生成 Caption（并发处理）
        
        Args:
            images: 图片 URL 或 Base64 编码列表
            include_attributes: 是否提取视觉属性
        
        Returns:
            Caption 结果列表（与输入顺序对应，失败为 None）
        """
        if not images:
            return []
        
        # 使用信号量控制并发数
        semaphore = asyncio.Semaphore(BATCH_SIZE)
        
        async def process_one(image: str) -> Optional[Dict[str, Any]]:
            async with semaphore:
                return await self.generate_caption(image, include_attributes)
        
        # 并发处理
        tasks = [process_one(img) for img in images]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理异常
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"[QwenVL] Exception processing image {i}: {type(result).__name__}: {str(result)}")
                final_results.append(None)
            else:
                final_results.append(result)
        
        return final_results

