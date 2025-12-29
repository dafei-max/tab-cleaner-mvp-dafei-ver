# 向量数据库集成说明

## 概述

已集成阿里云 Analytics Database (ADB PostgreSQL) 向量数据库，用于：
1. **存储 OpenGraph 数据的 embedding**：在抓取 OpenGraph 数据时立即计算并存储 embedding
2. **加速搜索**：搜索时直接从数据库读取 embedding，避免重复计算
3. **持久化存储**：embedding 数据持久化，不会因为用户刷新而丢失

## 环境变量配置

在 `.env` 文件或环境变量中配置以下参数：

```bash
# 阿里云 ADB PostgreSQL 连接配置
ADBPG_HOST=gp-xxxx-master.gpdb.rds.aliyuncs.com
ADBPG_PORT=5432
ADBPG_DBNAME=postgres
ADBPG_USER=cleantab_db
ADBPG_PASSWORD=CleanTabV5
ADBPG_NAMESPACE=cleantab

# 阿里云 Access Key（用于初始化数据库）
ALIBABA_ACCESS_KEY_ID=your_access_key_id
ALIBABA_ACCESS_KEY_SECRET=your_access_key_secret
ADBPG_INSTANCE_ID=your_instance_id
ADBPG_INSTANCE_REGION=cn-hangzhou  # 或其他区域
```

## 数据库初始化

首次使用前，需要初始化数据库 schema：

```bash
cd backend/app
python init_vector.py
```

这会：
1. 创建 namespace（如果不存在）
2. 创建 `opengraph_items` 表
3. 创建向量索引（用于快速相似度搜索）

## 工作流程

### 1. OpenGraph 抓取时自动存储 Embedding

当用户点击"一键清理"时：
1. 后端抓取 OpenGraph 数据
2. **立即计算 embedding**（文本和图像）
3. **存储到向量数据库**
4. 返回给前端（包含 embedding）

**优势**：
- Embedding 只计算一次
- 即使前端刷新，数据也不会丢失
- 搜索时可以直接使用

### 2. 搜索时优先从数据库读取

当用户在搜索框输入内容时：
1. 生成查询文本/图像的 embedding
2. **从向量数据库搜索**（使用 PostgreSQL 的向量相似度搜索）
3. 如果没有结果，才使用传入的 `opengraph_items` 进行本地搜索

**优势**：
- 搜索速度更快（数据库索引优化）
- 可以搜索所有历史数据，不仅仅是当前 session
- 减少 API 调用（不需要重新计算 embedding）

### 3. Embedding API 优化

`/api/v1/search/embedding` API 现在：
1. 先检查数据库是否已有该 URL 的 embedding
2. 如果有，直接返回（不重新计算）
3. 如果没有，才生成新的 embedding 并存储

## 性能提升

### 之前的问题：
- ❌ 每次搜索都要重新计算 embedding（慢）
- ❌ 用户等待时间长
- ❌ 重复计算浪费资源

### 现在的改进：
- ✅ Embedding 在抓取时就计算并存储
- ✅ 搜索时直接从数据库读取（快）
- ✅ 每个 URL 的 embedding 只计算一次
- ✅ 可以搜索所有历史数据

## 数据库 Schema

```sql
-- 注意：阿里云 ADB PostgreSQL 要求多个 PRIMARY KEY/UNIQUE 约束必须有共同列
-- 因此使用 url 作为 PRIMARY KEY，不需要额外的 id 列
CREATE TABLE cleantab.opengraph_items (
    url TEXT PRIMARY KEY,              -- 使用 url 作为主键
    title TEXT,
    description TEXT,
    image TEXT,
    site_name TEXT,
    tab_id INTEGER,
    tab_title TEXT,
    text_embedding vector(1024),      -- 文本 embedding（1024维）
    image_embedding vector(1024),      -- 图像 embedding（1024维）
    metadata JSONB,                   -- 其他元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引（url 已经是 PRIMARY KEY，自动有索引）
CREATE INDEX idx_text_embedding ON cleantab.opengraph_items USING ivfflat (text_embedding vector_cosine_ops);
CREATE INDEX idx_image_embedding ON cleantab.opengraph_items USING ivfflat (image_embedding vector_cosine_ops);
```

## 注意事项

1. **首次使用**：需要运行 `init_vector.py` 初始化数据库
2. **环境变量**：确保所有环境变量都已正确配置
3. **连接池**：使用连接池管理数据库连接，提高性能
4. **错误处理**：如果数据库连接失败，会自动降级到本地搜索（不影响功能）
5. **数据迁移**：现有的 OpenGraph 数据会在下次抓取时自动存储到数据库

## 故障排查

### 问题：数据库连接失败
- 检查环境变量是否正确
- 检查网络连接
- 检查数据库实例是否运行

### 问题：索引创建失败
- 可能是表中有数据但索引创建需要时间
- 可以手动创建索引或等待自动创建

### 问题：搜索没有结果
- 检查数据库中是否有数据
- 检查 embedding 是否正确生成
- 查看日志了解详细错误

