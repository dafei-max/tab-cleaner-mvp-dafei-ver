# 截图功能设置指南

## 功能说明

当 OpenGraph 抓取失败或识别为文档类网页时，系统会自动使用网页截图作为后备方案。

## 安装步骤

### 1. 安装 Playwright 依赖

```bash
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app
uv add playwright
```

### 2. 安装 Chromium 浏览器

```bash
playwright install chromium
```

或者使用 Python API：

```bash
python -m playwright install chromium
```

## 使用说明

### 自动截图场景

1. **文档类网页**：自动识别并使用截图
   - GitHub (`github.com`)
   - ReadTheDocs (`readthedocs.io`)
   - 包含 `/docs/` 的 URL
   - 包含 `developer.` 或 `dev.` 的 URL
   - 其他文档站点

2. **OpenGraph 抓取失败**：自动使用截图作为后备

3. **OpenGraph 无图片**：如果抓取成功但没有 `og:image`，使用截图

### 截图格式

- 截图以 Base64 格式存储（`data:image/jpeg;base64,xxx`）
- 自动压缩和调整大小（最大 1024px）
- 可直接用于 embedding 生成

## 故障排除

### Playwright 未安装

如果看到警告：
```
[OpenGraph] WARNING: Screenshot module not available. Screenshot fallback disabled.
```

请按照上述步骤安装 Playwright。

### 截图生成失败

- 检查网络连接
- 确认目标 URL 可访问
- 查看后端日志了解详细错误信息

## 性能考虑

- 截图生成需要启动无头浏览器，比 OpenGraph 抓取慢
- 建议优先使用 OpenGraph，截图作为后备
- 文档类网页会直接使用截图，跳过 OpenGraph 抓取

