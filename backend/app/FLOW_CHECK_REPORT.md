# Embedding 流程完整检查报告

## ✅ 1. OpenGraph 信息收集后什么时候请求 Embedding？

### 1.1 主要触发点：OpenGraph 抓取时自动触发 ✅

**位置**: `opengraph.py:411-515` - `_prefetch_embedding()`

**调用位置**（已确认）:
- ✅ `opengraph.py:188` - OpenGraph 成功且有图片
- ✅ `opengraph.py:229` - 文档类使用截图成功
- ✅ `opengraph.py:264` - 文档类使用文档卡片成功
- ✅ `opengraph.py:300` - 文档类截图失败后使用文档卡片成功
- ✅ `opengraph.py:308` - 普通网页无图片但成功
- ✅ `opengraph.py:334` - OpenGraph 失败但文档类截图成功

**流程**:
```
fetch_opengraph(url)
  ↓
解析 OpenGraph 数据成功
  ↓
调用 _prefetch_embedding(result) [异步，不阻塞]
  ↓
1. 检查数据库是否已有 embedding
   - 有 → 直接使用，不重新生成 ✅
   - 无 → 继续
2. 生成 text_embedding（使用 embed_text）✅
3. 生成 image_embedding（使用 embed_image）✅
4. 存储到向量数据库（upsert_opengraph_item）✅
```

**状态**: ✅ **正常** - 所有成功分支都会调用，且会存储到数据库

---

### 1.2 备用触发点：通过 API 手动请求 ⚠️

**位置**: `main.py:166-304` - `/api/v1/search/embedding`

**流程**:
```
POST /api/v1/search/embedding
  ↓
1. 优先从数据库读取（get_opengraph_item）✅
   - 有 → 直接返回 ✅
   - 无 → 继续
2. 调用 process_opengraph_for_search() 生成 embedding ✅
3. ❌ **问题**：生成后没有存储到数据库！
4. 返回结果给前端 ✅
```

**问题发现**: ⚠️ **`/api/v1/search/embedding` API 生成 embedding 后没有存储到数据库**

**影响**: 
- 如果通过 API 生成的 embedding，下次还需要重新生成
- 浪费 API 调用和计算资源
- 数据不一致（OpenGraph 抓取时存储，API 调用时不存储）

**建议修复**: 在 `generate_embeddings()` 函数中，生成 embedding 后添加存储逻辑

---

## ✅ 2. Embedding 数据都存在了哪里？

### 2.1 主要存储：阿里云 AnalyticDB PostgreSQL ✅

**配置**:
- **数据库**: 由 `ADBPG_DBNAME` 环境变量决定（实际运行时可能是 `postgres`）
- **Schema**: `cleantab` (由 `ADBPG_NAMESPACE` 环境变量控制)
- **表名**: `opengraph_items`
- **完整路径**: `{ADBPG_DBNAME}.{ADBPG_NAMESPACE}.opengraph_items`

**表结构**（已确认）:
```sql
CREATE TABLE cleantab.opengraph_items (
    url TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    image TEXT,
    site_name TEXT,
    tab_id INTEGER,
    tab_title TEXT,
    text_embedding vector(1024),      -- 文本 embedding（1024维）
    image_embedding vector(1024),    -- 图像 embedding（1024维）
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**索引**（已确认）:
- ✅ `idx_opengraph_url` - URL 索引
- ✅ `idx_text_embedding_cosine` - 文本向量索引（HNSW，余弦相似度，PQ关闭）
- ✅ `idx_image_embedding_cosine` - 图像向量索引（HNSW，余弦相似度，PQ关闭）

**存储函数**: `vector_db.py:288-354` - `upsert_opengraph_item()`

**状态**: ✅ **正常** - 表结构正确，索引已创建

---

### 2.2 临时存储：内存/前端

**位置**: 
- 前端内存（`background.js`）
- API 响应中临时返回

**状态**: ✅ **正常** - 仅用于临时展示，不持久化

---

## ✅ 3. Search 检索现在是怎么操作的？

### 3.1 API 端点：`/api/v1/search/query` ✅

**位置**: `main.py:304-400` - `search_content()`

**搜索策略**（优先级从高到低）:

#### 第一优先级：向量数据库搜索 ✅

**文本搜索**:
```
1. 生成查询文本的 embedding（embed_text）✅
2. 调用 search_by_text_embedding(query_emb, top_k=20）✅
3. 使用 PostgreSQL 向量相似度搜索（<=> 操作符）✅
4. 返回相似度排序的结果 ✅
```

**图像搜索**:
```
1. 下载并处理查询图像 ✅
2. 生成查询图像的 embedding（embed_image）✅
3. 调用 search_by_image_embedding(query_emb, top_k=20）✅
4. 使用 PostgreSQL 向量相似度搜索 ✅
5. 返回相似度排序的结果 ✅
```

**SQL 查询**（已确认）:
```sql
-- 文本搜索
SELECT url, title, description, image, site_name,
       tab_id, tab_title, text_embedding, image_embedding, metadata,
       1 - (text_embedding <=> $1::vector(1024)) AS similarity
FROM cleantab.opengraph_items
WHERE text_embedding IS NOT NULL
  AND (1 - (text_embedding <=> $1::vector(1024))) >= $2
ORDER BY text_embedding <=> $1::vector(1024)
LIMIT $3;

-- 图像搜索
SELECT url, title, description, image, site_name,
       tab_id, tab_title, text_embedding, image_embedding, metadata,
       1 - (image_embedding <=> $1::vector(1024)) AS similarity
FROM cleantab.opengraph_items
WHERE image_embedding IS NOT NULL
  AND (1 - (image_embedding <=> $1::vector(1024))) >= $2
ORDER BY image_embedding <=> $1::vector(1024)
LIMIT $3;
```

**状态**: ✅ **正常** - 数据库搜索逻辑正确，使用 HNSW 索引加速

---

#### 第二优先级：本地内存搜索（降级方案）✅

**位置**: `search/pipeline.py:169-257` - `search_relevant_items()`

**流程**:
```
如果数据库无结果 或 未配置数据库:
  1. 使用传入的 opengraph_items（前端传入）✅
  2. 调用 search_relevant_items() ✅
  3. 检查 items 是否有 embedding：
     - 有 → 使用向量相似度计算（sort_by_vector_similarity）✅
     - 无 → 使用模糊搜索（fuzzy_score）✅
  4. 返回排序后的结果 ✅
```

**两路融合逻辑**（已确认）:
- ✅ 文本相似度：`cos(query_vec, doc_text_vec)`
- ✅ 图像相似度：`cos(query_vec, doc_img_vec)`
- ✅ 自适应权重融合（根据内容类型）
- ✅ 降级到模糊搜索（无 embedding 时）

**状态**: ✅ **正常** - 降级逻辑完善，支持多种场景

---

## 📊 总结

### ✅ 正常工作的部分

1. **OpenGraph 抓取时自动生成和存储 embedding** ✅
   - 所有成功分支都会调用 `_prefetch_embedding()`
   - 会检查数据库避免重复生成
   - 会存储到数据库

2. **数据库存储** ✅
   - 表结构正确
   - 索引已创建（HNSW，余弦相似度）
   - 存储函数正常工作

3. **搜索功能** ✅
   - 优先使用向量数据库搜索
   - 降级到本地搜索逻辑完善
   - 支持文本和图像两路搜索

### ⚠️ 发现的问题

1. **`/api/v1/search/embedding` API 不存储 embedding** ⚠️
   - **问题**: 生成 embedding 后没有存储到数据库
   - **影响**: 浪费资源，数据不一致
   - **建议**: 在 `generate_embeddings()` 中添加存储逻辑

### 🔧 建议修复

在 `main.py:235-263` 的 `generate_embeddings()` 函数中，生成 embedding 后添加存储逻辑：

```python
# 为没有 embedding 的项生成 embedding
if items_to_process:
    print(f"[API] Generating embeddings for {len(items_to_process)} new items")
    processed_items = await process_opengraph_for_search(items_to_process)
    
    # ✅ 新增：存储到数据库
    db_host = os.getenv("ADBPG_HOST", "")
    if db_host:
        try:
            from vector_db import upsert_opengraph_item
            for item in processed_items:
                if item.get("text_embedding") or item.get("image_embedding"):
                    await upsert_opengraph_item(
                        url=item.get("url"),
                        title=item.get("title"),
                        description=item.get("description"),
                        image=item.get("image"),
                        site_name=item.get("site_name"),
                        tab_id=item.get("tab_id"),
                        tab_title=item.get("tab_title"),
                        text_embedding=item.get("text_embedding"),
                        image_embedding=item.get("image_embedding"),
                        metadata={
                            "is_screenshot": item.get("is_screenshot", False),
                            "is_doc_card": item.get("is_doc_card", False),
                            "success": item.get("success", False),
                        }
                    )
        except Exception as e:
            print(f"[API] Warning: Failed to store embeddings to DB: {e}")
    
    # 添加到结果中
    for item in processed_items:
        # ... 现有代码 ...
```

---

## ✅ 检查清单

- [x] ✅ OpenGraph 抓取时自动生成 embedding
- [x] ✅ OpenGraph 抓取时存储到数据库
- [x] ✅ 数据库表结构正确
- [x] ✅ 数据库索引已创建
- [x] ✅ 搜索优先使用向量数据库
- [x] ✅ 搜索降级逻辑完善
- [ ] ⚠️ `/api/v1/search/embedding` API 存储 embedding（需要修复）




