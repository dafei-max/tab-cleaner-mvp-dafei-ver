# 后端依赖使用情况分析

## 📋 依赖列表

根据 `pyproject.toml` 和 `requirements.txt`，当前依赖包括：

1. `fastapi>=0.120.3` ✅ **使用中**
2. `uvicorn[standard]>=0.38.0` ✅ **使用中**
3. `sqlalchemy>=2.0.44` ⚠️ **未使用**
4. `httpx>=0.27.0` ✅ **使用中**
5. `beautifulsoup4>=4.12.0` ⚠️ **未使用**
6. `dashscope>=1.17.0` ✅ **使用中**
7. `aiofiles>=25.1.0` ✅ **使用中**
8. `pillow>=10.0.0` ✅ **使用中**
9. `numpy>=1.24.0` ✅ **使用中**
10. `scikit-learn>=1.3.0` ✅ **使用中**
11. `python-dotenv>=1.0.0` ✅ **使用中**
12. `alibabacloud-gpdb20160503==3.5.0` ⚠️ **仅用于初始化脚本**
13. `alibabacloud-tea-openapi==0.3.8` ⚠️ **仅用于初始化脚本**
14. `asyncpg>=0.30.0` ✅ **使用中**
15. `jieba>=0.42.1` ✅ **使用中**

---

## ⚠️ 未使用的依赖

### 1. **SQLAlchemy** (`sqlalchemy>=2.0.44`)

**状态**: ❌ **未使用**

**检查结果**:
- 代码中没有任何 `import sqlalchemy` 或 `from sqlalchemy` 语句
- 数据库操作全部使用 `asyncpg`（原生 PostgreSQL 驱动）
- 没有使用 ORM 框架

**建议**: 
- ✅ **可以移除** - 当前使用 `asyncpg` 进行数据库操作，不需要 SQLAlchemy
- **节省空间**: 约 2-3 MB

**移除方法**:
```bash
# 从 pyproject.toml 中移除
# "sqlalchemy>=2.0.44",

# 从 requirements.txt 中移除
# sqlalchemy>=2.0.44
```

---

### 2. **BeautifulSoup4** (`beautifulsoup4>=4.12.0`)

**状态**: ❌ **未使用**

**检查结果**:
- 代码中没有任何 `import bs4` 或 `from bs4` 语句
- 没有使用 HTML/XML 解析功能
- OpenGraph 数据由前端 Chrome Extension 抓取，后端只接收数据

**建议**: 
- ✅ **可以移除** - 后端不负责网页抓取，不需要 HTML 解析
- **节省空间**: 约 100-200 KB

**移除方法**:
```bash
# 从 pyproject.toml 中移除
# "beautifulsoup4>=4.12.0",

# 从 requirements.txt 中移除
# beautifulsoup4>=4.12.0
```

---

### 3. **AlibabaCloud GPDB SDK** (`alibabacloud-gpdb20160503==3.5.0` 和 `alibabacloud-tea-openapi==0.3.8`)

**状态**: ✅ **保留**（用户要求）

**检查结果**:
- 在 `init_vector.py` 中使用（创建 namespace）
- 不在运行时使用
- 数据库操作使用 `asyncpg`，不依赖这些 SDK

**建议**: 
- ✅ **保留** - 用于初始化脚本，用户要求保留
- 如果将来需要创建新的 namespace，需要这些 SDK

---

### 4. **aiohttp** (未在依赖列表中，但在测试脚本中使用)

**状态**: ⚠️ **仅在测试脚本中使用**

**检查结果**:
- 只在 `test_search_with_images.py` 中使用（下载图片）
- 主要代码使用 `httpx` 作为 HTTP 客户端
- 不在运行时使用

**建议**: 
- ✅ **不需要添加到依赖** - 测试脚本可以单独安装
- 或者使用 `httpx` 替代（主要代码已使用）

---

## ✅ 正在使用的依赖

### 核心依赖（必需）

1. **FastAPI** - Web 框架
2. **Uvicorn** - ASGI 服务器
3. **httpx** - HTTP 客户端（调用 DashScope API）
4. **asyncpg** - PostgreSQL 异步驱动
5. **dashscope** - 阿里云通义千问 SDK
6. **python-dotenv** - 环境变量管理

### AI/ML 相关

7. **numpy** - 向量计算（相似度计算）
8. **scikit-learn** - K-means 聚类（颜色提取、聚类）
9. **jieba** - 中文分词（Caption 搜索）

### 文件/图片处理

10. **pillow** - 图片处理（缩放、压缩）
11. **aiofiles** - 异步文件操作

---

## 📊 依赖大小估算

| 依赖 | 大小 | 状态 | 建议 |
|------|------|------|------|
| sqlalchemy | ~2-3 MB | ❌ 未使用 | 可移除 |
| beautifulsoup4 | ~100-200 KB | ❌ 未使用 | 可移除 |
| alibabacloud-* | ~100-200 KB | ⚠️ 仅初始化 | 可选移除 |
| **总计可节省** | **~2.5-3.5 MB** | - | - |

---

## 🛠️ 清理建议

### 方案1：完全清理（推荐）

移除所有未使用的依赖：

```toml
# pyproject.toml
dependencies = [
    "fastapi>=0.120.3",
    "uvicorn[standard]>=0.38.0",
    # ❌ 移除: "sqlalchemy>=2.0.44",
    "httpx>=0.27.0",
    # ❌ 移除: "beautifulsoup4>=4.12.0",
    "dashscope>=1.17.0",
    "aiofiles>=25.1.0",
    "pillow>=10.0.0",
    "numpy>=1.24.0",
    "scikit-learn>=1.3.0",
    "python-dotenv>=1.0.0",
    # ❌ 移除: "alibabacloud-gpdb20160503==3.5.0",
    # ❌ 移除: "alibabacloud-tea-openapi==0.3.8",
    "asyncpg>=0.30.0",
    "jieba>=0.42.1",
]
```

### 方案2：保留初始化脚本依赖（如果还需要）

如果将来可能需要运行 `init_vector.py`，可以：
- 保留 `alibabacloud-*` 依赖
- 或者创建单独的初始化环境

---

## ✅ 正在使用的依赖详情

### 1. FastAPI + Uvicorn
- **用途**: Web 框架和服务器
- **使用位置**: `main.py`
- **必需**: ✅ 是

### 2. httpx
- **用途**: 异步 HTTP 客户端
- **使用位置**: 
  - `search/embed.py` - 调用 DashScope API
  - `search/qwen_vl_client.py` - 调用 Qwen-VL API
  - `search/preprocess.py` - 下载图片
- **必需**: ✅ 是

### 3. asyncpg
- **用途**: PostgreSQL 异步驱动
- **使用位置**: `vector_db.py` - 所有数据库操作
- **必需**: ✅ 是

### 4. dashscope
- **用途**: 阿里云通义千问 SDK
- **使用位置**: 
  - `search/ai_intent_enhance.py` - AI 意图分析
  - `ai_insight.py` - AI 分析
- **必需**: ✅ 是

### 5. numpy
- **用途**: 数值计算
- **使用位置**: 
  - `vector_db.py` - 向量操作
  - `search/caption.py` - 颜色提取
- **必需**: ✅ 是

### 6. scikit-learn
- **用途**: K-means 聚类
- **使用位置**: 
  - `search/caption.py` - 颜色聚类
  - `clustering/ai_discover.py` - 聚类发现
- **必需**: ✅ 是

### 7. jieba
- **用途**: 中文分词
- **使用位置**: 
  - `search/funnel_search.py` - Caption 关键词搜索
- **必需**: ✅ 是

### 8. pillow
- **用途**: 图片处理
- **使用位置**: 
  - `search/preprocess.py` - 图片压缩和缩放
  - `search/caption.py` - 图片处理
- **必需**: ✅ 是

### 9. aiofiles
- **用途**: 异步文件操作
- **使用位置**: 
  - `test_search_with_images.py` - 测试脚本（保存结果）
- **必需**: ⚠️ 仅在测试中使用，运行时不需要

### 10. python-dotenv
- **用途**: 环境变量管理
- **使用位置**: 所有脚本文件开头
- **必需**: ✅ 是

---

## 🎯 总结

### 可以安全移除的依赖

1. ✅ **sqlalchemy** - 完全未使用
2. ✅ **beautifulsoup4** - 完全未使用

### 已保留的依赖（用户要求）

3. ✅ **alibabacloud-gpdb20160503** - 保留（用于初始化脚本）
4. ✅ **alibabacloud-tea-openapi** - 保留（用于初始化脚本）

### 建议操作

**已移除**:
- ✅ `sqlalchemy`
- ✅ `beautifulsoup4`

**已保留**（用户要求）:
- ✅ `alibabacloud-gpdb20160503`
- ✅ `alibabacloud-tea-openapi`

**预期效果**:
- 减少依赖体积：约 2.2-3.2 MB（保留 alibabacloud SDK）
- 加快安装速度
- 减少潜在的安全漏洞

---

**最后更新**: 2025-12-03

