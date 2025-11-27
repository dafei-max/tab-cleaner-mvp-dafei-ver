# 文档卡片可视化方案

## 问题背景

当后端截图功能失败时（如 Playwright 未安装、网络问题等），文档类网页无法获得可视化锚点。参考 [Starlight](https://github.com/withastro/starlight) 的设计，我们实现了文档卡片生成器作为降级方案。

## 解决方案

### 1. 文档卡片生成器 (`doc_card_generator.py`)

**功能**：
- 自动检测文档类型（代码仓库、文档、协作工具、博客等）
- 生成美观的 SVG 卡片，包含：
  - **图标**：根据类型显示不同 emoji（💻 代码仓库、📚 文档、🤝 协作工具等）
  - **类型标签**：显示文档类型（如"代码仓库"、"文档"、"协作工具"）
  - **标题**：页面标题或 URL 路径
  - **站点名称**：从 URL 提取的域名
  - **描述**：页面描述（如果有）
  - **URL 预览**：显示完整 URL

**设计特点**：
- 渐变背景（根据类型使用不同颜色）
- 圆角卡片（16px 圆角）
- 阴影效果
- 系统字体（-apple-system, BlinkMacSystemFont）
- 响应式布局

### 2. 集成到 OpenGraph 流程

**降级策略**：

```
文档类 URL
    ↓
尝试后端截图
    ├─ 成功 → 使用截图
    └─ 失败 → 生成文档卡片（降级方案）
```

**触发场景**：
1. 文档类 URL 截图失败
2. OpenGraph 抓取成功但无图片，且截图失败
3. OpenGraph 抓取失败，且截图失败

### 3. 文档类型检测

自动识别以下类型：

| 类型 | 关键词 | 图标 | 颜色 |
|------|--------|------|------|
| 代码仓库 | github.com, gitlab.com | 💻 | #0366d6 (GitHub Blue) |
| 文档 | readthedocs.io, docs. | 📚 | #28a745 (Green) |
| 协作工具 | notion.so, feishu, lark | 🤝 | #4ecdc4 (Teal) |
| Google Docs | docs.google.com | 📝 | #4285f4 (Google Blue) |
| 博客 | zhihu.com, juejin.cn, csdn.net | 📝 | #ff6b6b (Red) |
| 微信公众号 | mp.weixin.qq.com | 📰 | #07c160 (WeChat Green) |
| 小红书文档 | docs.xiaohongshu.com | 📚 | #ff2442 (Xiaohongshu Red) |
| 默认 | 其他 | 📄 | #95a5a6 (Gray) |

## 使用示例

### 后端生成文档卡片

```python
from doc_card_generator import generate_doc_card_data_uri, detect_doc_type

# 检测类型
doc_info = detect_doc_type("https://github.com/withastro/starlight", "github.com")
# 返回: {"type": "代码仓库", "icon": "💻", "color": "#0366d6", ...}

# 生成卡片
card_data_uri = generate_doc_card_data_uri(
    title="Starlight",
    url="https://github.com/withastro/starlight",
    site_name="github.com",
    description="Documentation website framework"
)
# 返回: "data:image/svg+xml;base64,..."
```

### 前端显示

文档卡片作为 SVG Data URI 返回，前端可以直接使用：

```javascript
// 在 PersonalSpace.jsx 中
<DraggableImage
  src={og.image}  // 可能是截图或文档卡片 SVG
  alt={og.title}
  // ...
/>
```

## 卡片样式

### 布局结构

```
┌─────────────────────────────────┐
│ 💻 [代码仓库]                    │  ← 图标 + 类型标签
│                                 │
│ Starlight                       │  ← 标题（20px, 粗体）
│ github.com                      │  ← 站点名称（13px）
│ Documentation website framework │  ← 描述（12px，可选）
│                                 │
│ ─────────────────────────────── │  ← 装饰线
│ https://github.com/withastro... │  ← URL 预览（10px, 等宽字体）
└─────────────────────────────────┘
```

### 颜色方案

- **背景**：渐变（类型色 → 白色）
- **边框**：类型色，2px
- **阴影**：轻微阴影效果
- **文字**：
  - 标题：#1a1a1a（深灰）
  - 站点名称：#666666（中灰）
  - 描述：#888888（浅灰）
  - URL：#999999（更浅灰）

## 优势

1. **无需依赖**：不依赖 Playwright 或网络，纯 Python 生成
2. **快速**：SVG 生成速度极快（< 1ms）
3. **美观**：参考 Starlight 设计，现代化 UI
4. **信息丰富**：包含标题、类型、站点名称、URL 等关键信息
5. **类型识别**：自动识别文档类型，使用对应颜色和图标

## 测试

### 测试 Playwright 安装

```bash
cd backend/app
uv run python test_playwright.py
```

### 测试文档卡片生成

```bash
cd backend/app
uv run python -c "from doc_card_generator import generate_doc_card_data_uri; print(generate_doc_card_data_uri('Starlight', 'https://github.com/withastro/starlight', 'github.com', 'Documentation website framework')[:100])"
```

## 未来优化

1. **更多类型**：支持更多文档平台（如 GitBook、Notion、Confluence 等）
2. **自定义样式**：允许用户自定义卡片颜色和样式
3. **图标优化**：使用 SVG 图标替代 emoji（更专业）
4. **响应式尺寸**：根据内容自动调整卡片大小
5. **缓存机制**：缓存生成的卡片，避免重复生成

## 相关文件

- `backend/app/doc_card_generator.py` - 文档卡片生成器
- `backend/app/opengraph.py` - OpenGraph 抓取（集成文档卡片降级）
- `backend/app/screenshot.py` - 截图功能
- `frontend/src/screens/PersonalSpace/DraggableImage.jsx` - 前端显示组件






