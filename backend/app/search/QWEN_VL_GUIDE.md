# Qwen-VL Caption 生成模块使用指南

## 概述

本模块实现了基于阿里云 Qwen-VL 的图片 Caption 生成和视觉属性提取功能，用于升级 Tab Cleaner 搜索系统。

## 功能特性

1. **图片 Caption 生成**：使用 Qwen-VL 生成详细的图片描述
2. **颜色提取**：使用 K-Means 聚类提取主要颜色（3 个）
3. **风格识别**：识别图片风格（modern, minimalist, vintage 等）
4. **物体识别**：识别图片中的主要物体（chair, table, plant 等）
5. **批量处理**：支持并发批量处理（默认 5 个并发）

## 模块结构

### 1. `qwen_vl_client.py` - Qwen-VL 客户端

**QwenVLClient 类**：
- `generate_caption()`: 生成单个图片的 Caption 和视觉属性
- `batch_generate_caption()`: 批量生成 Caption（并发处理）

**API 配置**：
- 模型：`qwen-vl-max`（性能最好）
- 端点：`https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- 支持图片 URL 和 Base64 两种输入方式

### 2. `caption.py` - Caption 生成模块

**主要函数**：
- `enrich_item_with_caption()`: 为单个 OpenGraph 项生成 Caption
- `batch_enrich_items()`: 批量生成 Caption（支持并发）

**混合方案**：
- **Qwen-VL**：生成 Caption 和初步标签
- **K-Means**：提取精确颜色（更准确）
- **规则式提取**：从 Caption 中提取风格和物体标签（作为补充）

## 使用方法

### 基本使用

```python
from search.qwen_vl_client import QwenVLClient
from search.caption import enrich_item_with_caption, batch_enrich_items

# 创建客户端
client = QwenVLClient()

# 生成单个图片的 Caption
result = await client.generate_caption(
    image_url_or_base64="https://example.com/image.jpg",
    include_attributes=True,
)

# 结果格式
{
    "caption": "A modern blue chair in a minimalist living room...",
    "dominant_colors": ["blue", "white", "gray"],
    "style_tags": ["modern", "minimalist"],
    "object_tags": ["chair", "furniture", "room"]
}
```

### 增强单个项

```python
item = {
    "url": "https://example.com",
    "title": "Example",
    "image": "https://example.com/image.jpg",
}

# 增强项（包含 K-Means 颜色提取）
enriched = await enrich_item_with_caption(
    item,
    use_kmeans_colors=True,  # 使用 K-Means 提取颜色（更准确）
)

# enriched 现在包含：
# - caption: 图片描述
# - dominant_colors: 主要颜色列表
# - style_tags: 风格标签列表
# - object_tags: 物体标签列表
```

### 批量处理

```python
items = [
    {"url": "...", "image": "https://..."},
    {"url": "...", "image": "https://..."},
    # ...
]

# 批量增强（并发处理，默认 5 个并发）
enriched_items = await batch_enrich_items(
    items,
    use_kmeans_colors=True,
)
```

## 配置

### 环境变量

```bash
DASHSCOPE_API_KEY=your_api_key_here
```

### 批量处理配置

在 `config.py` 中配置：

```python
BATCH_SIZE = 5  # 并发处理数量
```

### 重试配置

在 `qwen_vl_client.py` 中配置：

```python
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY = 1.0  # 重试延迟（秒）
```

## 返回数据结构

### QwenVLClient.generate_caption() 返回格式

```json
{
    "caption": "图片描述文本（不超过 100 字）",
    "dominant_colors": ["blue", "white", "gray"],
    "style_tags": ["modern", "minimalist"],
    "object_tags": ["chair", "furniture", "room"]
}
```

### enrich_item_with_caption() 返回格式

原始项 + 以下字段：

```json
{
    "url": "...",
    "title": "...",
    "image": "...",
    "caption": "图片描述",
    "dominant_colors": ["blue", "white"],
    "style_tags": ["modern"],
    "object_tags": ["chair"]
}
```

## 颜色提取

### K-Means 颜色提取

- 使用 `sklearn.cluster.KMeans` 对图片像素进行聚类
- 提取 3 个主要颜色
- 将 RGB 值转换为颜色名称（blue, red, green 等）

### 支持的颜色

- **蓝色系**：blue, dodgerblue, steelblue, lightblue
- **红色系**：red, crimson, firebrick, tomato
- **绿色系**：green, forestgreen, limegreen, lightgreen
- **黄色系**：yellow, gold, orange
- **黑色/灰色系**：black, gray, darkgray, silver
- **白色系**：white, whitesmoke, snow
- **紫色系**：purple, blueviolet, mediumpurple
- **粉色系**：pink, deeppink, hotpink
- **棕色系**：brown, saddlebrown, sienna

## 风格标签

支持以下风格标签：

- `modern` - 现代
- `minimalist` - 简约
- `vintage` - 复古
- `industrial` - 工业
- `scandinavian` - 北欧
- `japanese` - 日式
- `luxury` - 奢华
- `casual` - 休闲
- `bohemian` - 波西米亚
- `art-deco` - 装饰艺术
- `mid-century` - 中世纪现代

## 错误处理

### 重试机制

- 自动重试最多 3 次
- 指数退避策略（1s, 2s, 4s）
- 处理限流（429）和服务器错误（5xx）

### 异常处理

- 网络错误：自动重试
- API 错误：记录错误并返回 None
- 图片处理错误：返回原始项（不增强）

## 性能优化

### 并发处理

- 默认并发数：5
- 使用 `asyncio.Semaphore` 控制并发
- 避免 API 限流

### 图片预处理

- 自动下载图片（如果是 URL）
- 自动压缩和转换格式
- 支持 Base64 和 URL 两种输入

## 测试

运行测试脚本：

```bash
cd backend/app
python test_qwen_vl.py
```

测试内容：
1. 单个图片 Caption 生成
2. 单个项增强（包含 K-Means 颜色提取）
3. 批量增强（并发处理）

## 注意事项

1. **API 限制**：
   - 图片大小：不超过 10MB
   - Base64 编码后：不超过 10MB
   - 图片尺寸：宽高都大于 10 像素
   - 宽高比：不超过 200

2. **成本考虑**：
   - Qwen-VL API 按 token 计费
   - 建议批量处理时控制并发数
   - 可以缓存结果避免重复调用

3. **图片格式**：
   - 支持 URL（HTTP/HTTPS）
   - 支持 Base64（Data URI 格式：`data:image/jpeg;base64,...`）

## 下一步

1. 集成到 `pipeline.py` 中，在生成 embedding 时同时生成 Caption
2. 将 Caption 和视觉属性保存到数据库
3. 在搜索时使用视觉属性进行匹配
4. 实现三阶段漏斗搜索（Caption → 视觉属性 → Embedding）

