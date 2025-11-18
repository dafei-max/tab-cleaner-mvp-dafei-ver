# 文档类网站可视化方案

## 概述

本文档说明了对各种文档类网站的可视化处理方案。由于这些网站通常没有合适的 OpenGraph 图片，我们使用网页截图作为可视化内容。

## 支持的文档类网站

### 1. 代码托管和文档平台
- **GitHub** (`github.com`)
- **GitLab** (`gitlab.com`)
- **ReadTheDocs** (`readthedocs.io`)
- **Stack Overflow** (`stackoverflow.com`)
- **Stack Exchange** (`stackexchange.com`)

### 2. 协作和文档工具
- **Notion** (`notion.so`, `notion.site`)
- **飞书** (`feishu.cn`, `feishuapp.com`, `larkoffice.com`)
- **Google Docs** (`docs.google.com`)
- **Confluence** (`confluence.*`, `atlassian.net`)
- **Jira** (`jira.*`)

### 3. 中文文档平台
- **小红书文档** (`docs.xiaohongshu.com`)
- **微信公众号** (`mp.weixin.qq.com`)
- **知乎** (`zhihu.com`)
- **掘金** (`juejin.cn`)
- **CSDN** (`csdn.net`)
- **SegmentFault** (`segmentfault.com`)

### 4. 其他文档平台
- **Medium** (`medium.com`)
- **Dev.to** (`dev.to`)
- **Hashnode** (`hashnode.com`)
- **Reddit** (`reddit.com/r/`)

## 处理流程

### 自动识别

系统会自动识别文档类 URL，识别规则在 `screenshot.py` 的 `is_doc_like_url()` 函数中定义。

### 截图策略

1. **直接截图**：如果识别为文档类 URL，直接使用截图，跳过 OpenGraph 抓取
2. **后备方案**：如果 OpenGraph 抓取失败，自动使用截图作为后备
3. **无图片后备**：如果 OpenGraph 抓取成功但没有图片，使用截图

### 特殊处理

不同网站可能需要不同的等待时间以确保内容完全加载：

- **协作工具**（Notion、飞书、Google Docs）：等待 3 秒
- **中文平台**（微信公众号、小红书文档）：等待 2.5 秒
- **其他文档**：等待 2 秒

## 截图配置

- **视口大小**：1920x1080
- **超时时间**：30 秒
- **图片质量**：85% JPEG
- **最大尺寸**：1024px（自动缩放）
- **格式**：Base64 JPEG（`data:image/jpeg;base64,xxx`）

## 测试

使用测试脚本验证截图功能：

```bash
# 完整测试所有 URL
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app
uv run python test_screenshot.py

# 快速测试（仅测试部分 URL）
uv run python test_screenshot.py --quick
```

测试结果会保存到 `screenshot_test_results_*.json` 文件中。

## 已知问题和限制

### 1. 需要登录的页面
某些网站（如 Notion 私有页面、飞书私有文档）可能需要登录才能访问。这些页面可能无法正常截图。

**解决方案**：
- 对于需要登录的页面，可以尝试使用 OpenGraph 数据（如果有）
- 或者显示占位图片

### 2. 动态内容加载
某些网站使用大量 JavaScript 动态加载内容，可能需要更长的等待时间。

**解决方案**：
- 根据网站类型调整等待时间
- 使用 `wait_for_load_state("networkidle")` 等待网络空闲

### 3. 反爬虫机制
某些网站可能有反爬虫机制，阻止自动化访问。

**解决方案**：
- 使用真实的 User-Agent
- 设置合理的请求间隔
- 如果被阻止，回退到 OpenGraph 数据

## 性能优化

1. **批量处理**：多个 URL 可以并发处理，但需要控制并发数量
2. **缓存机制**：相同 URL 的截图可以缓存，避免重复生成
3. **异步处理**：所有截图操作都是异步的，不会阻塞主流程

## 未来改进

1. **智能等待**：根据页面加载情况动态调整等待时间
2. **截图优化**：针对不同网站使用不同的截图策略（如只截取首屏）
3. **OCR 支持**：对截图进行 OCR，提取文本内容用于搜索
4. **预览图生成**：为长文档生成多个预览图（首屏、中间、结尾）



