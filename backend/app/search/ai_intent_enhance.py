"""
AI 用户意图强化模块（RAG 增强）
使用 LLM 来理解和增强用户搜索意图，提高搜索准确性

工作流程：
1. 用户输入查询 → AI 分析意图 → 增强查询（扩展同义词、明确意图）
2. 基于增强后的查询进行搜索
3. 搜索结果 → AI 二次验证和排序调整
"""
from typing import Dict, List, Optional, Any
import json
import asyncio
from .config import get_api_key


# ========== AI Prompt 配置 ==========
# 注意：prompt 已迁移到 ai_prompt_config.py，这里保留向后兼容
from .ai_prompt_config import (
    get_intent_analysis_prompt as _get_intent_analysis_prompt,
    get_result_validation_prompt as _get_result_validation_prompt,
    get_vl_validation_prompt as _get_vl_validation_prompt,
)

def get_intent_analysis_prompt(query: str) -> str:
    """
    获取用户意图分析的 Prompt（思维链版本）
    
    Args:
        query: 用户查询文本
    
    Returns:
        Prompt 字符串
    """
    # 使用集中的 prompt 配置
    return _get_intent_analysis_prompt(query)


def get_result_validation_prompt(query: str, results: List[Dict]) -> str:
    """
    获取搜索结果验证的 Prompt（优化版：更清晰的指令）
    
    Args:
        query: 原始查询
        results: 搜索结果列表（前N个）
    
    Returns:
        Prompt 字符串
    """
    # 使用集中的 prompt 配置
    return _get_result_validation_prompt(query, results)


# ========== AI 调用接口 ==========

async def call_llm_for_intent(prompt: str) -> Optional[Dict[str, Any]]:
    """
    调用 LLM 进行意图分析（优化版：增强错误处理和稳定性）
    
    Args:
        prompt: Prompt 文本
    
    Returns:
        LLM 返回的 JSON 解析结果，如果失败返回 None
    """
    content = ""  # 初始化，避免未定义变量错误
    try:
        import dashscope
        from dashscope import Generation
        
        api_key = get_api_key()
        if not api_key:
            print("[AI Intent] No API key found, skipping AI enhancement")
            return None
        
        dashscope.api_key = api_key
        
        # 调用通义千问（尝试两种格式：先尝试 messages，如果失败则用 prompt）
        try:
            # 方式1：使用 messages 格式（推荐）
            response = Generation.call(
                model="qwen-turbo",
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.2,
                max_tokens=1500,
            )
        except Exception as e1:
            # 方式2：如果 messages 格式失败，尝试 prompt 格式（旧版API）
            try:
                print(f"[AI Intent] Messages format failed, trying prompt format: {e1}")
                response = Generation.call(
                    model="qwen-turbo",
                    prompt=prompt,
                    temperature=0.2,
                    max_tokens=1500,
                )
            except Exception as e2:
                print(f"[AI Intent] Both formats failed: messages={e1}, prompt={e2}")
                return None
        
        # 检查响应状态
        if response.status_code != 200:
            error_msg = getattr(response, 'message', 'Unknown error')
            print(f"[AI Intent] API call failed: status_code={response.status_code}, message={error_msg}")
            # 尝试打印更多调试信息
            if hasattr(response, 'request_id'):
                print(f"[AI Intent] Request ID: {response.request_id}")
            return None
        
        # ✅ 检查 response.output 是否存在
        if not hasattr(response, 'output') or response.output is None:
            print(f"[AI Intent] API returned no output")
            print(f"[AI Intent] Response attributes: {dir(response)}")
            return None
        
        # ✅ 检查 choices 是否存在（兼容不同的响应格式）
        content = None
        
        # 方式1：检查 response.output.choices（标准格式）
        if hasattr(response.output, 'choices') and response.output.choices:
            if len(response.output.choices) > 0:
                choice = response.output.choices[0]
                if hasattr(choice, 'message') and choice.message:
                    if hasattr(choice.message, 'content'):
                        content = str(choice.message.content).strip()
        
        # 方式2：检查 response.output.text（某些版本的API可能使用这个）
        if not content and hasattr(response.output, 'text'):
            content = str(response.output.text).strip()
        
        # 方式3：检查 response.output（直接是文本）
        if not content and isinstance(response.output, str):
            content = response.output.strip()
        
        if not content:
            print(f"[AI Intent] API returned no content")
            print(f"[AI Intent] Response output attributes: {dir(response.output) if hasattr(response, 'output') else 'N/A'}")
            return None
        if not content:
            print(f"[AI Intent] API returned empty content")
            return None
        
        # ✅ 清理内容：移除 markdown 代码块标记
        # 处理 ```json ... ``` 格式
        if "```json" in content:
            parts = content.split("```json")
            if len(parts) > 1:
                content = parts[1].split("```")[0].strip()
        elif "```" in content:
            # 处理 ``` ... ``` 格式
            parts = content.split("```")
            if len(parts) > 1:
                content = parts[1].strip()
        
        # ✅ 移除可能的 JSON 前后空白字符和换行
        content = content.strip()
        
        # ✅ 尝试解析 JSON
        try:
            result = json.loads(content)
            print(f"[AI Intent] ✅ Successfully analyzed intent")
            return result
        except json.JSONDecodeError as json_err:
            # 如果直接解析失败，尝试提取 JSON 部分
            print(f"[AI Intent] ⚠️  JSON decode error: {json_err}")
            print(f"[AI Intent] Raw content (first 300 chars): {content[:300]}")
            
            # 尝试提取 JSON 对象（查找第一个 { 到最后一个 }）
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            if start_idx >= 0 and end_idx > start_idx:
                json_str = content[start_idx:end_idx + 1]
                try:
                    result = json.loads(json_str)
                    print(f"[AI Intent] ✅ Successfully extracted JSON from content")
                    return result
                except:
                    pass
            
            return None
            
    except ImportError as e:
        print(f"[AI Intent] ⚠️  dashscope not installed: {e}")
        return None
    except Exception as e:
        print(f"[AI Intent] ❌ Error calling LLM: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None


# ========== 意图增强函数 ==========

async def enhance_query_intent_with_ai(
    query: str,
    use_cache: bool = True,
    cache: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    使用 AI 增强用户查询意图（RAG 增强）
    
    Args:
        query: 用户查询文本
        use_cache: 是否使用缓存（避免重复调用）
        cache: 缓存字典（外部传入，用于跨调用缓存）
    
    Returns:
        {
            "original_query": str,
            "enhanced_query": str,
            "query_type": str,
            "extracted_info": dict,
            "search_suggestions": dict,
            "ai_enhanced": bool,  # 是否成功使用AI增强
        }
    """
    # 检查缓存
    if use_cache and cache is not None and query in cache:
        print(f"[AI Intent] Using cached result for: {query}")
        return cache[query]
    
    # 默认结果（如果AI调用失败，使用规则式方法）
    default_result = {
        "original_query": query,
        "enhanced_query": query,
        "query_type": "general",
        "extracted_info": {
            "colors": [],
            "objects": [],
            "styles": [],
            "concepts": []
        },
        "search_suggestions": {
            "prioritize_sites": [],
            "filter_types": ["documentation", "api"],
            "similarity_threshold": 0.3
        },
        "ai_enhanced": False,
    }
    
    # 如果查询太短，跳过AI增强
    if len(query.strip()) < 2:
        return default_result
    
    try:
        # 构建 Prompt
        prompt = get_intent_analysis_prompt(query)
        
        # 调用 LLM
        ai_result = await call_llm_for_intent(prompt)
        
        if ai_result:
            # ✅ 验证和清理 AI 返回的结果（新格式）
            extracted_info = ai_result.get("extracted_info", {})
            if not isinstance(extracted_info, dict):
                extracted_info = {}
            
            # ✅ 确保 extracted_info 包含所有必需字段
            extracted_info = {
                "colors": extracted_info.get("colors", []),
                "objects": extracted_info.get("objects", []),
                "styles": extracted_info.get("styles", []),
                "concepts": extracted_info.get("concepts", []),
            }
            
            # ✅ 确保所有列表都是字符串列表
            for key in ["colors", "objects", "styles", "concepts"]:
                if not isinstance(extracted_info[key], list):
                    extracted_info[key] = []
                # 过滤掉非字符串元素
                extracted_info[key] = [str(item) for item in extracted_info[key] if item]
            
            # ✅ 处理相关词条（新格式）
            related_keywords = ai_result.get("related_keywords", [])
            if not isinstance(related_keywords, list):
                related_keywords = []
            # 确保是字符串列表
            related_keywords = [str(kw) for kw in related_keywords if kw]
            
            # ✅ 验证 enhanced_query（优先使用 related_keywords 生成，如果没有则使用返回的 enhanced_query）
            enhanced_query = query
            if related_keywords:
                # 使用相关词条生成增强查询
                enhanced_query = " ".join(related_keywords)
            else:
                # 回退到返回的 enhanced_query
                enhanced_query = ai_result.get("enhanced_query", query)
            
            if not enhanced_query or not isinstance(enhanced_query, str):
                enhanced_query = query
            
            # ✅ 处理过滤规则（新格式）
            filter_rules = ai_result.get("filter_rules", {})
            if not isinstance(filter_rules, dict):
                filter_rules = {}
            
            # 转换为 search_suggestions 格式（兼容旧代码）
            search_suggestions = {
                "prioritize_sites": filter_rules.get("prioritize_sites", []),
                "filter_types": filter_rules.get("exclude_types", ["documentation", "api", "tutorial"]),
                "similarity_threshold": 0.3,  # 默认阈值
            }
            
            # ✅ 处理思维链信息（可选，用于调试）
            thinking_chain = ai_result.get("thinking_chain", {})
            
            # 成功使用AI增强
            result = {
                "original_query": query,
                "enhanced_query": enhanced_query,
                "query_type": ai_result.get("query_type", "general"),
                "extracted_info": extracted_info,
                "related_keywords": related_keywords,  # 新增：10个相关词条
                "search_suggestions": search_suggestions,
                "thinking_chain": thinking_chain,  # 新增：思维链信息
                "ai_enhanced": True,
            }
            
            # 缓存结果
            if use_cache and cache is not None:
                cache[query] = result
            
            print(f"[AI Intent] ✅ AI enhanced query: '{query}' → '{result['enhanced_query']}'")
            print(f"[AI Intent]    相关词条 ({len(related_keywords)}个): {', '.join(related_keywords[:5])}{'...' if len(related_keywords) > 5 else ''}")
            print(f"[AI Intent]    提取信息: colors={extracted_info['colors']}, objects={extracted_info['objects']}, styles={extracted_info['styles']}")
            if thinking_chain:
                print(f"[AI Intent]    用户意图: {thinking_chain.get('user_intent', 'N/A')}")
            return result
        else:
            # AI调用失败，使用默认结果
            print(f"[AI Intent] ⚠️  AI enhancement failed, using default")
            return default_result
            
    except Exception as e:
        print(f"[AI Intent] Error in enhance_query_intent_with_ai: {e}")
        return default_result


async def validate_search_results_with_vl(
    query: str,
    results: List[Dict],
    top_n: int = 10
) -> Dict[str, Any]:
    """
    使用视觉语言模型（VL）验证搜索结果（看图片内容判断是否符合用户意图）
    
    Args:
        query: 原始查询
        results: 搜索结果列表
        top_n: 验证前N个结果
    
    Returns:
        {
            "relevant_indices": List[int],  # 相关结果的索引
            "filter_out_indices": List[int],  # 应该过滤的结果索引
            "boost_indices": List[int],  # 应该提升优先级的结果索引
            "ai_validated": bool,  # 是否成功使用AI验证
        }
    """
    if not results or len(results) == 0:
        return {
            "relevant_indices": [],
            "filter_out_indices": [],
            "boost_indices": [],
            "ai_validated": False,
        }
    
    try:
        from .qwen_vl_client import QwenVLClient
        from .preprocess import download_image, process_image
        
        qwen_client = QwenVLClient()
        
        # 只验证前 top_n 个结果（节省成本）
        items_to_validate = results[:top_n]
        
        relevant_indices = []
        filter_out_indices = []
        boost_indices = []
        
        # 使用集中的 prompt 配置
        validation_prompt = _get_vl_validation_prompt(query)
        
        # 并发验证多个图片
        validation_tasks = []
        for idx, item in enumerate(items_to_validate):
            image_url = item.get("image") or item.get("screenshot_image")
            if not image_url:
                # 没有图片，标记为不相关
                filter_out_indices.append(idx)
                continue
            
            # 下载并压缩图片（节省token）
            async def validate_one_image(img_url: str, item_idx: int):
                try:
                    # 下载图片
                    image_data = await download_image(img_url, timeout=5.0)
                    if not image_data:
                        return {"idx": item_idx, "is_relevant": False, "reason": "failed_to_download"}
                    
                    # 压缩图片（使用较小的尺寸，节省token）
                    # 设置为512px最大尺寸（足够VL识别内容，但节省token）
                    from .preprocess import process_image
                    compressed_img = process_image(image_data, max_dimension=512)
                    if not compressed_img:
                        return {"idx": item_idx, "is_relevant": False, "reason": "failed_to_compress"}
                    
                    # 调用VL API
                    vl_result = await qwen_client._call_api(validation_prompt, compressed_img)
                    if not vl_result:
                        return {"idx": item_idx, "is_relevant": False, "reason": "vl_api_failed"}
                    
                    # 解析VL返回的JSON（兼容不同的响应格式）
                    import json
                    content = None
                    
                    # 方式1：标准格式 output.choices[0].message.content
                    if isinstance(vl_result, dict):
                        output = vl_result.get("output", {})
                        if isinstance(output, dict):
                            choices = output.get("choices", [])
                            if choices and len(choices) > 0:
                                message = choices[0].get("message", {})
                                raw_content = message.get("content", "")
                                
                                # ✅ 修复：处理 content 可能是列表的情况（多模态响应）
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
                                    print(f"[AI Intent] Unexpected content type: {type(raw_content)}")
                                    content = None
                    
                    # 方式2：直接是文本
                    if not content and isinstance(vl_result, str):
                        content = vl_result
                    
                    if not content:
                        return {"idx": item_idx, "is_relevant": False, "reason": "no_content"}
                    
                    # ✅ 确保 content 是字符串（如果不是，尝试转换）
                    if not isinstance(content, str):
                        try:
                            content = str(content)
                        except:
                            return {"idx": item_idx, "is_relevant": False, "reason": "content_not_string"}
                    
                    # 清理内容（移除markdown代码块）
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0].strip()
                    
                    try:
                        result = json.loads(content)
                        # ✅ 简化：只判断 is_relevant，不再判断质量等其他因素
                        return {
                            "idx": item_idx,
                            "is_relevant": result.get("is_relevant", True),  # 默认保留，除非明确标记为不相关
                            "is_high_quality": True,  # 不再判断质量，默认保留
                            "should_boost": result.get("should_boost", False),
                            "reasoning": result.get("reasoning", ""),
                        }
                    except (json.JSONDecodeError, TypeError) as e:
                        # 如果JSON解析失败，尝试从文本中提取信息
                        content_lower = content.lower() if isinstance(content, str) else str(content).lower()
                        is_relevant = "relevant" in content_lower and "false" not in content_lower
                        return {
                            "idx": item_idx,
                            "is_relevant": is_relevant,
                            "is_high_quality": True,
                            "should_boost": False,
                            "reasoning": str(content)[:100] if content else "",
                        }
                except Exception as e:
                    print(f"[AI Intent] Error validating image {item_idx}: {e}")
                    return {"idx": item_idx, "is_relevant": False, "reason": str(e)}
            
            validation_tasks.append(validate_one_image(image_url, idx))
        
        # 并发执行验证（限制并发数，避免API限流）
        import asyncio
        semaphore = asyncio.Semaphore(3)  # 最多3个并发
        
        async def validate_with_limit(task):
            async with semaphore:
                return await task
        
        validation_results = await asyncio.gather(*[validate_with_limit(task) for task in validation_tasks], return_exceptions=True)
        
        # 处理验证结果
        for result in validation_results:
            if isinstance(result, Exception):
                print(f"[AI Intent] Validation task failed: {result}")
                continue
            
            idx = result.get("idx")
            if idx is None:
                continue
            
            if result.get("is_relevant", False):
                relevant_indices.append(idx)
                if result.get("should_boost", False):
                    boost_indices.append(idx)
            else:
                filter_out_indices.append(idx)
        
        print(f"[AI Intent] ✅ VL validated: {len(relevant_indices)} relevant, {len(filter_out_indices)} to filter, {len(boost_indices)} to boost")
        
        return {
            "relevant_indices": relevant_indices,
            "filter_out_indices": filter_out_indices,
            "boost_indices": boost_indices,
            "ai_validated": len(validation_results) > 0,
        }
        
    except Exception as e:
        print(f"[AI Intent] Error in validate_search_results_with_vl: {e}")
        import traceback
        traceback.print_exc()
        return {
            "relevant_indices": list(range(len(results))),
            "filter_out_indices": [],
            "boost_indices": [],
            "ai_validated": False,
        }


async def validate_search_results_with_ai(
    query: str,
    results: List[Dict],
    top_n: int = 10
) -> Dict[str, Any]:
    """
    使用 AI 验证搜索结果（二次验证和排序调整）
    
    Args:
        query: 原始查询
        results: 搜索结果列表
        top_n: 验证前N个结果
    
    Returns:
        {
            "relevant_indices": List[int],  # 相关结果的索引
            "filter_out_indices": List[int],  # 应该过滤的结果索引
            "boost_indices": List[int],  # 应该提升优先级的结果索引
            "ai_validated": bool,  # 是否成功使用AI验证
        }
    """
    if not results or len(results) == 0:
        return {
            "relevant_indices": [],
            "filter_out_indices": [],
            "boost_indices": [],
            "ai_validated": False,
        }
    
    try:
        # 构建 Prompt
        prompt = get_result_validation_prompt(query, results[:top_n])
        
        # 调用 LLM
        ai_result = await call_llm_for_intent(prompt)
        
        if ai_result:
            # ✅ 安全转换索引（从1-based转为0-based）
            def safe_convert_indices(indices, max_index):
                """安全转换索引，过滤无效值"""
                if not isinstance(indices, list):
                    return []
                converted = []
                for i in indices:
                    try:
                        idx = int(i) - 1  # 转为0-based
                        if 0 <= idx < max_index:
                            converted.append(idx)
                    except (ValueError, TypeError):
                        continue
                return list(set(converted))  # 去重
            
            max_index = len(results)
            relevant_indices = safe_convert_indices(ai_result.get("relevant_indices", []), max_index)
            filter_out_indices = safe_convert_indices(ai_result.get("filter_out_indices", []), max_index)
            boost_indices = safe_convert_indices(ai_result.get("boost_indices", []), max_index)
            
            # ✅ 确保 relevant_indices 和 filter_out_indices 不冲突
            # 如果某个索引既在 relevant 又在 filter_out 中，优先保留（不过滤）
            filter_out_indices = [i for i in filter_out_indices if i not in relevant_indices]
            
            print(f"[AI Intent] ✅ AI validated: {len(relevant_indices)} relevant, {len(filter_out_indices)} to filter, {len(boost_indices)} to boost")
            
            return {
                "relevant_indices": relevant_indices,
                "filter_out_indices": filter_out_indices,
                "boost_indices": boost_indices,
                "ai_validated": True,
            }
        else:
            # AI验证失败，返回默认值（保留所有结果）
            return {
                "relevant_indices": list(range(len(results))),
                "filter_out_indices": [],
                "boost_indices": [],
                "ai_validated": False,
            }
            
    except Exception as e:
        print(f"[AI Intent] Error in validate_search_results_with_ai: {e}")
        return {
            "relevant_indices": list(range(len(results))),
            "filter_out_indices": [],
            "boost_indices": [],
            "ai_validated": False,
        }


# ========== 混合策略（规则式 + AI） ==========

async def hybrid_intent_detection(
    query: str,
    use_ai: bool = True,
    ai_timeout: float = 2.0,  # AI调用超时时间（秒）
    cache: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    混合意图检测：规则式 + AI增强
    
    策略：
    1. 先使用规则式方法快速检测（毫秒级）
    2. 如果启用AI，异步调用AI增强（不阻塞）
    3. 如果AI调用成功，使用AI结果；否则使用规则式结果
    
    Args:
        query: 用户查询
        use_ai: 是否使用AI增强
        ai_timeout: AI调用超时时间
        cache: 缓存字典
    
    Returns:
        意图检测结果
    """
    # 先使用规则式方法（快速）
    from .query_enhance import enhance_visual_query
    from .smart_filter import detect_query_intent
    
    rule_based_intent = detect_query_intent(query)
    visual_attrs = enhance_visual_query(query)
    
    result = {
        "original_query": query,
        "enhanced_query": visual_attrs.get("enhanced", query),
        "query_type": "visual" if rule_based_intent["is_visual_query"] else "general",
        "extracted_info": {
            "colors": rule_based_intent.get("colors", []),
            "objects": rule_based_intent.get("objects", []),
            "styles": rule_based_intent.get("styles", []),
            "concepts": []
        },
        "search_suggestions": {
            "prioritize_sites": [],
            "filter_types": ["documentation", "api"],
            "similarity_threshold": 0.3
        },
        "ai_enhanced": False,
        "rule_based": True,
    }
    
    # 如果启用AI，尝试异步增强（不阻塞）
    if use_ai:
        try:
            # 使用超时控制，避免AI调用太慢
            ai_result = await asyncio.wait_for(
                enhance_query_intent_with_ai(query, cache=cache),
                timeout=ai_timeout
            )
            
            if ai_result and ai_result.get("ai_enhanced"):
                # ✅ AI增强成功，智能合并结果
                # 优先使用AI提取的信息（更准确），但保留规则式方法的补充信息
                ai_extracted = ai_result.get("extracted_info", {})
                rule_extracted = result.get("extracted_info", {})
                
                # 合并提取信息：AI优先，但规则式方法可以补充
                merged_extracted = {
                    "colors": ai_extracted.get("colors", []) or rule_extracted.get("colors", []),
                    "objects": ai_extracted.get("objects", []) or rule_extracted.get("objects", []),
                    "styles": ai_extracted.get("styles", []) or rule_extracted.get("styles", []),
                    "concepts": ai_extracted.get("concepts", []),  # 只有AI能提取概念
                }
                
                # 合并搜索建议：AI优先
                ai_suggestions = ai_result.get("search_suggestions", {})
                merged_suggestions = {
                    "prioritize_sites": ai_suggestions.get("prioritize_sites", result["search_suggestions"].get("prioritize_sites", [])),
                    "filter_types": ai_suggestions.get("filter_types", result["search_suggestions"].get("filter_types", [])),
                    "similarity_threshold": ai_suggestions.get("similarity_threshold", result["search_suggestions"].get("similarity_threshold", 0.3)),
                }
                
                result.update({
                    "enhanced_query": ai_result.get("enhanced_query", result["enhanced_query"]),
                    "query_type": ai_result.get("query_type", result["query_type"]),
                    "extracted_info": merged_extracted,
                    "search_suggestions": merged_suggestions,
                    "ai_enhanced": True,
                })
                print(f"[AI Intent] ✅ Hybrid: AI enhanced successfully")
                print(f"[AI Intent]    Merged extracted: colors={merged_extracted['colors']}, objects={merged_extracted['objects']}, styles={merged_extracted['styles']}")
            else:
                print(f"[AI Intent] ⚠️  Hybrid: AI enhancement failed or timeout, using rule-based")
                
        except asyncio.TimeoutError:
            print(f"[AI Intent] ⚠️  Hybrid: AI call timeout ({ai_timeout}s), using rule-based")
        except Exception as e:
            print(f"[AI Intent] ⚠️  Hybrid: AI error: {type(e).__name__}: {e}, using rule-based")
    
    return result

