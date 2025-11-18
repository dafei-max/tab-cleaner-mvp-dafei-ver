# 聚类功能模块

## 概述

聚类功能模块提供了三种聚类方式：
1. **用户自定义聚类**：用户手动选择卡片并命名
2. **AI 按标签分类**：根据用户定义的标签，使用 embedding 相似度进行分类
3. **AI 自发现聚类**：使用 K-means 算法自动发现聚类，并生成聚类名称

## 模块结构

```
clustering/
├── __init__.py          # 导出主要接口
├── config.py            # 配置（聚类数量、模型等）
├── manual.py            # 用户自定义聚类逻辑
├── ai_classify.py       # AI 按标签分类
├── ai_discover.py       # AI 自发现聚类（K-means + AI 生成名称）
├── layout.py            # 圆形布局计算
├── storage.py           # 聚类结果保存（本地文件）
└── results/             # 聚类结果保存目录（自动创建）
```

## API 端点

### 1. 用户自定义聚类

**端点**: `POST /api/v1/clustering/manual`

**请求体**:
```json
{
  "item_ids": ["og-1", "og-2", "og-3"],
  "cluster_name": "我的设计参考",
  "items_data": [...],  // 所有卡片数据
  "center_x": 720,      // 可选，默认 720
  "center_y": 512       // 可选，默认 512
}
```

**响应**:
```json
{
  "ok": true,
  "cluster": {
    "id": "cluster-xxx",
    "name": "我的设计参考",
    "type": "manual",
    "items": [...],      // 带位置信息的卡片列表
    "center": {"x": 720, "y": 512},
    "radius": 200,
    "created_at": "2025-11-06T...",
    "item_count": 3
  }
}
```

### 2. AI 按标签分类

**端点**: `POST /api/v1/clustering/ai-classify`

**请求体**:
```json
{
  "labels": ["设计", "工作文档"],
  "items_data": [...],  // 需要包含 text_embedding 和 image_embedding
  "exclude_item_ids": ["og-1"]  // 可选，排除已聚类的卡片
}
```

**响应**:
```json
{
  "ok": true,
  "clusters": [
    {
      "id": "cluster-xxx",
      "name": "设计",
      "type": "ai-classify",
      "items": [...],
      "center": {"x": 720, "y": 512},
      "radius": 200,
      "label": "设计"
    },
    {
      "id": "cluster-yyy",
      "name": "其他",
      "type": "ai-classify",
      "items": [...],
      "label": "其他"
    }
  ],
  "total_items": 20,
  "classified_items": 20
}
```

**说明**:
- 标签最多3个
- 每个卡片只属于最符合的标签（单一分类）
- 相似度低于 0.3 的卡片归入"其他"

### 3. AI 自发现聚类

**端点**: `POST /api/v1/clustering/ai-discover`

**请求体**:
```json
{
  "items_data": [...],  // 需要包含 text_embedding 和 image_embedding
  "exclude_item_ids": ["og-1"],  // 可选，排除已聚类的卡片
  "n_clusters": 4       // 可选，如果不指定，自动确定3-5组
}
```

**响应**:
```json
{
  "ok": true,
  "clusters": [
    {
      "id": "cluster-xxx",
      "name": "设计灵感收集",  // AI 生成的名称（6-8个字）
      "type": "ai-discover",
      "items": [...],
      "center": {"x": 720, "y": 312},
      "radius": 200
    },
    ...
  ],
  "total_items": 20,
  "clustered_items": 20
}
```

**说明**:
- 使用 K-means 算法进行无监督聚类
- 聚类数量自动确定（3-5组，根据数据量调整）
- 聚类名称由 AI 自动生成（6-8个字）

## 配置

在 `config.py` 中可以调整以下参数：

- `MAX_LABELS = 3`: 用户自定义标签最多3个
- `MIN_DISCOVER_CLUSTERS = 3`: 自发现聚类最少3组
- `MAX_DISCOVER_CLUSTERS = 5`: 自发现聚类最多5组
- `CLUSTER_NAME_MAX_LENGTH = 8`: 聚类名称最大长度
- `CLUSTER_NAME_MIN_LENGTH = 6`: 聚类名称最小长度
- `DEFAULT_IMAGE_SIZE = 120`: 图片大小
- `DEFAULT_SPACING = 150`: 每圈之间的间距

## 结果保存

聚类结果会自动保存到 `clustering/results/` 目录，文件名格式：
- `clustering_manual_YYYYMMDD_HHMMSS.json`
- `clusters_ai-classify_YYYYMMDD_HHMMSS.json`
- `clusters_ai-discover_YYYYMMDD_HHMMSS.json`

## 依赖

- `numpy`: 数值计算
- `scikit-learn`: K-means 聚类算法
- `httpx`: HTTP 客户端（用于 AI 生成名称）

## 注意事项

1. **Embedding 要求**：
   - AI 分类和自发现聚类需要卡片数据包含 `text_embedding` 和 `image_embedding`
   - 建议先调用 `/api/v1/search/embedding` 生成 embedding

2. **性能考虑**：
   - 大量卡片（100+）时，AI 自发现聚类可能需要较长时间
   - 建议分批处理或使用异步调用

3. **聚类位置**：
   - 多个聚类会自动计算位置，避免重叠
   - 可以在前端通过拖拽调整位置

4. **排除已聚类卡片**：
   - 使用 `exclude_item_ids` 参数可以排除已经手动聚类的卡片
   - 确保不会重复聚类



