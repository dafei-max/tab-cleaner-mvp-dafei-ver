"""
AI Prompt 配置中心
集中管理所有 AI 相关的 prompt，方便调整和优化

使用方式：
    from search.ai_prompt_config import (
        get_caption_prompt,
        get_intent_analysis_prompt,
        get_result_validation_prompt,
        get_vl_validation_prompt,
    )
"""


# ========== Caption 生成 Prompt ==========

def get_caption_prompt(include_attributes: bool = True) -> str:
    """
    获取图片 Caption 生成的 Prompt
    
    Args:
        include_attributes: 是否提取视觉属性（颜色、风格、物体）
    
    Returns:
        Prompt 字符串
    """
    if include_attributes:
        return """你是一位专业的设计师和图片描述专家，擅长准确识别和描述视觉内容。

**你的任务**：详细分析这张图片，准确提取所有视觉信息，并以 JSON 格式返回。

**角色定位**：
- 你是一位经验丰富的设计师，对颜色、形状、材质、风格有敏锐的观察力
- 你是一位专业的图片描述者，能够准确识别图片中的主体内容、背景、细节

**描述要求**：

1. **Caption（图片描述）**：
   - 用一句话（不超过 100 字）详细描述图片的主要内容
   - **必须准确描述主要物体的颜色**（例如："一个黄色的烤奶酪三明治"而不是"一个烤奶酪三明治"）
   - 必须描述主体内容（主要物体是什么）以及它的特征颜色和主要印象
   - 必须描述物体的形状、材质、状态（如：圆形、方形、木质、金属、融化、拉丝等）
   - 适当描述背景颜色和主要背景元素
   - 必须描述整体风格和氛围
   - **颜色描述要具体**：使用准确的颜色名称（如：yellow, red, blue, green, white, black, orange, pink, purple, gray, brown, golden, amber, lemon, crimson, navy, emerald 等）
   - **不要遗漏主要物体的颜色**：如果主体是黄色的，必须在描述中明确提到"黄色"

2. **主要颜色（dominant_colors）**：
   - 提取图片中的主要颜色，**优先提取主体物体的颜色**
   - 使用英文颜色名称（如：yellow, red, green, blue, white, black, orange, pink, purple, gray, brown, golden, amber, lemon, crimson, navy, emerald）
   - **必须包含主体物体的颜色**（如果主体是黄色，必须包含 yellow）
   - 可以包含背景的主要颜色（但主体颜色优先）
   - 返回 2-5 个主要颜色

3. **风格标签（style_tags）**：
   - 识别图片的设计风格，从以下选项中选择（可多选）：
     modern, minimalist, vintage, industrial, scandinavian, japanese, classic, contemporary, rustic, luxury, casual, elegant, bohemian, art-deco, mid-century, retro, futuristic, natural, organic, geometric, abstract, realistic, artistic, professional, playful, sophisticated, cozy, spacious, warm, cool, bright, dark
   - 返回 2-5 个风格标签

4. **物体标签（object_tags）**：
   - 识别图片中的主要物体或元素（用英文）
   - 包括：主要物体、装饰元素、背景元素等
   - 常见物体：chair, table, plant, lamp, sofa, bed, desk, shelf, mirror, rug, pillow, curtain, vase, painting, sculpture, sandwich, food, drink, book, computer, phone, car, building, tree, flower, animal, person, etc.
   - 返回 2-8 个物体标签

**重要提示**：
- **颜色准确性至关重要**：如果图片中的主体物体有明显的颜色（如黄色三明治、红色椅子、蓝色背景），必须在 caption 和 dominant_colors 中准确反映
- **主体优先**：优先描述和提取主体物体的颜色、形状、材质等信息
- **细节观察**：注意物体的细节特征（如：拉丝的奶酪、融化的状态、纹理、光泽等）
- **整体与局部**：既要描述整体风格，也要描述主要物体的具体特征

**输出格式**：请严格按照以下 JSON 格式返回（不要添加任何其他文字）：
{
  "caption": "图片描述（必须包含主体物体的颜色）",
  "dominant_colors": ["主体颜色1", "主体颜色2", "背景颜色1"],
  "style_tags": ["风格1", "风格2"],
  "object_tags": ["物体1", "物体2"]
}

**示例**：
- 如果图片是一个黄色烤奶酪三明治，caption 应该是："一个黄色的烤奶酪三明治，融化的奶酪拉出长长的丝，背景为蓝色。"
- dominant_colors 应该包含：["yellow", "blue"]
- 如果图片是一个红色现代椅子，caption 应该是："一把红色的现代风格椅子，采用简约设计，背景为白色。"
- dominant_colors 应该包含：["red", "white"]"""
    else:
        return """你是一位专业的设计师和图片描述专家。

请用一句话详细描述这张图片的主要内容（不超过 100 字）。

**要求**：
- 必须准确描述主要物体的颜色（例如："一个黄色的烤奶酪三明治"而不是"一个烤奶酪三明治"）
- 必须描述主体内容（主要物体是什么）
- 必须描述物体的形状、材质、状态
- 必须描述背景颜色和主要背景元素
- 颜色描述要具体和准确（使用准确的颜色名称，如：yellow, red, blue, green, white, black, orange, pink, purple, gray, brown, golden, amber 等）
- **不要遗漏主要物体的颜色**"""


# ========== 意图分析 Prompt ==========

def get_intent_analysis_prompt(query: str) -> str:
    """
    获取用户意图分析的 Prompt（思维链版本）
    
    Args:
        query: 用户查询文本
    
    Returns:
        Prompt 字符串
    """
    return f"""你是一位经验丰富的设计师，正在帮助用户搜索设计灵感和视觉内容。请按照以下思维链逐步分析用户的搜索意图。

**用户查询**："{query}"

**思维链（请逐步思考）**：

**步骤 1：理解用户真实意图**
- 用户想要找什么？是颜色、物体、风格，还是整体视觉概念？
- 用户的使用场景是什么？（例如：室内设计、平面设计、UI设计等）
- 用户的隐含需求是什么？（例如："绿色植物"可能意味着用户想要自然、清新的设计风格）

**步骤 2：提取关键信息**
- **颜色**：查询中明确提到的颜色（如"绿色"、"蓝色"、"红色"等）
- **物体/物品**：查询中提到的具体物品（如"植物"、"椅子"、"海报"等）
- **风格**：查询中提到的设计风格（如"简约"、"现代"、"复古"等）
- **概念/情感**：查询中隐含的情感或概念（如"温暖"、"科技感"、"自然"等）

**步骤 3：生成10个相关词条**
- 必须包含原始查询词条
- 扩展同义词、相关词、上下位词
- 添加设计师常用词汇（如"design", "visual", "inspiration", "style"）
- 优先使用英文词汇（用于向量搜索）
- 确保词条与用户意图高度相关

**步骤 4：确定过滤规则**
- 明确排除：技术文档、API文档、代码仓库、工作台、管理系统、会议记录等
- 优先保留：设计师网站（Pinterest、Behance、Dribbble、小红书等）、视觉内容、设计灵感

**步骤 5：生成增强查询**
- 将10个相关词条组合成增强查询
- 保持用户原始意图不变
- 格式：用空格分隔的英文关键词

**输出格式**：请以 JSON 格式返回，格式如下：
{{
    "thinking_chain": {{
        "user_intent": "用户想要找什么（一句话描述）",
        "use_case": "使用场景（如：室内设计、平面设计等）",
        "implicit_needs": "隐含需求（如果有）"
    }},
    "extracted_info": {{
        "colors": ["green"],  // 准确提取的颜色，如果没有则为 []
        "objects": ["plant", "tree"],  // 准确提取的物体，如果没有则为 []
        "styles": ["minimalist"],  // 准确提取的风格，如果没有则为 []
        "concepts": ["natural", "fresh"]  // 提取的概念/情感，如果没有则为 []
    }},
    "related_keywords": [
        "原始查询词条",
        "相关词1",
        "相关词2",
        // ... 共10个词条
    ],
    "enhanced_query": "green plant tree foliage vegetation natural fresh design visual inspiration style",  // 10个词条组合的增强查询
    "filter_rules": {{
        "exclude_types": ["documentation", "api", "code", "workbench", "management", "meeting"],  // 必须排除的内容类型
        "prioritize_sites": ["pinterest", "behance", "dribbble", "xiaohongshu"]  // 优先返回的网站
    }},
    "query_type": "visual"  // 查询类型：visual, object, color, style, concept, general
}}

**重要要求**：
1. related_keywords 必须恰好包含10个词条（包含原始查询）
2. enhanced_query 必须包含这10个词条，用空格分隔
3. 颜色提取必须准确，不能遗漏或错误
4. 必须明确排除文档类、技术类、工作台类内容
5. 返回纯 JSON，不要包含 markdown 代码块标记"""


# ========== 结果验证 Prompt ==========

def get_result_validation_prompt(query: str, results: list) -> str:
    """
    获取搜索结果验证的 Prompt（优化版：更清晰的指令）
    
    Args:
        query: 原始查询
        results: 搜索结果列表（前N个）
    
    Returns:
        Prompt 字符串
    """
    # 构建结果摘要（包含更多信息）
    results_summary = []
    for i, item in enumerate(results[:12], 1):  # 验证前12个
        title = item.get("title") or item.get("tab_title", "无标题")[:60]
        url = item.get("url", "")[:70]
        similarity = item.get("similarity", 0.0)
        site_name = item.get("site_name", "")[:20]
        description = (item.get("description") or "")[:80]
        
        # 提取视觉属性（如果有）
        colors = item.get("dominant_colors", [])
        objects = item.get("object_tags", [])
        styles = item.get("style_tags", [])
        visual_info = ""
        if colors:
            visual_info += f"颜色: {', '.join(str(c) for c in colors[:3])} | "
        if objects:
            visual_info += f"物体: {', '.join(str(o) for o in objects[:3])} | "
        if styles:
            visual_info += f"风格: {', '.join(str(s) for s in styles[:3])}"
        
        results_summary.append(
            f"{i}. 标题: {title}\n"
            f"   相似度: {similarity:.3f} | 网站: {site_name}\n"
            f"   描述: {description}\n"
            f"   视觉属性: {visual_info if visual_info else '无'}\n"
            f"   URL: {url}"
        )
    
    return f"""你是一个专业的设计师搜索助手。请验证搜索结果是否与用户查询匹配。

**用户查询**："{query}"

**搜索结果**（共 {len(results)} 个）：
{chr(10).join(results_summary)}

**任务**：
1. **识别相关结果**：哪些结果与查询高度相关？（返回索引列表，从1开始）
2. **识别不相关结果**：哪些结果应该被过滤掉？（如：文档类、技术文档、不相关的内容）
3. **识别优质结果**：哪些结果应该提升优先级？（如：设计师网站Pinterest/Behance/Dribbble、高质量视觉内容）

**重要规则**：
- 如果查询包含颜色（如"绿色植物"），结果必须匹配该颜色，否则应过滤
- 如果查询包含物体（如"椅子"），结果应包含该物体，否则应过滤
- 文档类、技术文档、API文档、工作台等应被过滤
- 设计师网站（Pinterest、Behance、Dribbble）应优先保留

**输出格式**：请以 JSON 格式返回，格式如下：
{{
    "relevant_indices": [1, 2, 3],  // 相关结果的索引（从1开始）
    "filter_out_indices": [5, 7],  // 应该过滤的结果索引（从1开始）
    "boost_indices": [1, 2],  // 应该提升优先级的结果索引（从1开始）
    "reasoning": "分析原因：结果1和2是绿色植物图片，符合查询；结果5是技术文档，应过滤..."
}}

**注意**：请确保返回的是有效的 JSON 格式，索引必须是从1开始的整数，且不能超出结果数量。"""


# ========== VL 验证 Prompt ==========

def get_vl_validation_prompt(query: str) -> str:
    """
    获取视觉语言模型验证的 Prompt（简化版：只判断图片中是否有查询内容）
    
    Args:
        query: 用户查询
    
    Returns:
        Prompt 字符串
    """
    return f"""请查看这张图片，判断图片中是否包含用户查询的内容。

**用户查询**："{query}"

**任务**：只需要判断图片中是否包含查询的内容。
- 例如：查询"椅子"，图片中有椅子就返回 is_relevant: true
- 例如：查询"绿色植物"，图片中有绿色植物就返回 is_relevant: true
- 例如：查询"黄色三明治"，图片中有黄色三明治就返回 is_relevant: true
- 如果图片中明显没有查询的内容，返回 is_relevant: false

**注意**：
- 只要图片中有相关内容就保留，不需要判断质量、风格等其他因素
- 只过滤明显不相关的结果（例如：查询"椅子"但图片中完全没有椅子）
- **颜色匹配很重要**：如果查询包含颜色（如"黄色三明治"），图片中的物体必须匹配该颜色

**输出格式**：请以 JSON 格式返回，格式如下：
{{
    "is_relevant": true,  // 图片中是否包含查询的内容
    "reasoning": "图片中有黄色三明治"  // 简单说明原因
}}

**注意**：请确保返回的是有效的 JSON 格式，不要包含任何 markdown 代码块标记。"""

