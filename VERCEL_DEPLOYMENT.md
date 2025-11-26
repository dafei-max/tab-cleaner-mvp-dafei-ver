# Vercel 部署指南

## 问题：Serverless Function 超过 250MB 限制

**原因：** Playwright 包含 Chromium 浏览器，体积超过 200MB，导致部署失败。

**解决方案：** 已移除 Playwright 依赖，截图功能由前端 Chrome Extension 处理。

## 已完成的优化

1. ✅ **移除 Playwright**
   - 从 `requirements.txt` 和 `pyproject.toml` 中移除
   - 移除所有 screenshot 相关代码

2. ✅ **创建 Vercel 配置**
   - `vercel.json` - 指定构建配置
   - `.vercelignore` - 排除不必要的文件

3. ✅ **简化代码逻辑**
   - 移除后端截图功能
   - 保留文档卡片生成（轻量级）

## Vercel 部署步骤

### 1. 在 Vercel Dashboard 配置

**Root Directory:** `backend/app`

**Build Command:** （留空，Vercel 会自动检测）

**Output Directory:** （留空）

**Install Command:** `pip install -r requirements.txt`

### 2. 环境变量设置

在 Vercel Dashboard → Settings → Environment Variables 中添加：

```
ADBPG_HOST=你的数据库地址
ADBPG_PORT=5432
ADBPG_USER=你的用户名
ADBPG_PASSWORD=你的密码
ADBPG_DBNAME=postgres
ADBPG_SCHEMA=cleantab
DASHSCOPE_API_KEY=你的API密钥（如果需要）
```

### 3. 部署

Vercel 会自动：
- 检测 Python 项目
- 安装 `requirements.txt` 中的依赖
- 运行 FastAPI 应用

## 依赖大小对比

**移除前（包含 Playwright）：**
- Playwright + Chromium: ~200MB
- 其他依赖: ~50MB
- **总计: ~250MB+** ❌

**移除后（不包含 Playwright）：**
- FastAPI + Uvicorn: ~10MB
- NumPy + Scikit-learn: ~30MB
- Pillow: ~5MB
- 其他依赖: ~5MB
- **总计: ~50MB** ✅

## 注意事项

1. **截图功能**：现在由前端 Chrome Extension 的 `chrome.tabs.captureVisibleTab` 处理
2. **文档卡片**：后端仍会为文档类 URL 生成 SVG 卡片
3. **OpenGraph**：所有 OpenGraph 抓取逻辑保持不变

## 如果仍然超过限制

如果部署后仍然超过 250MB，可以进一步优化：

1. **移除 NumPy/Scikit-learn**（如果不需要向量搜索）
2. **使用更轻量的图片处理库**（如果不需要 Pillow）
3. **使用 Vercel Pro**（支持更大的 Serverless Function）



