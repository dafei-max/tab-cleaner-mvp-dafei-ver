# 本地 OpenGraph 卡片预览功能

## 功能概述

现在可以在**客户端本地**实时预览和渲染 OpenGraph 卡片，无需等待后端响应！

## 优势

1. **实时预览**：用户可以看到卡片效果，确认后再保存
2. **更快响应**：不需要等待后端 API 调用
3. **减少后端负载**：预览阶段不需要后端参与
4. **更好的 UX**：类似 Notion Web Clipper 的体验

## 工作流程

```
用户访问网页
  ↓
Content Script 自动抓取 OpenGraph（本地）
  ↓
显示预览卡片（可选）
  ↓
用户点击"保存" → 发送到后端生成 embedding
  ↓
保存到 Chrome Storage → 显示在个人空间
```

## 已实现的组件

### 1. `opengraph_local.js`
- ✅ 本地抓取 OpenGraph 数据
- ✅ 从页面 DOM 提取 meta 标签
- ✅ 支持 Pinterest、小红书等特殊处理

### 2. `opengraph_preview.js`（新增）
- ✅ 实时预览卡片组件
- ✅ 显示图片、标题、描述
- ✅ 保存/忽略按钮
- ✅ 自动定位（右上角）

## 使用方法

### 方法 1：自动预览（推荐）

在 `content.js` 中启用自动预览：

```javascript
// 在 opengraph_local.js 加载完成后
const ogData = window.__TAB_CLEANER_GET_OPENGRAPH();
if (ogData && ogData.success) {
  // 加载预览卡片组件
  const previewScript = document.createElement('script');
  previewScript.src = chrome.runtime.getURL('assets/opengraph_preview.js');
  previewScript.onload = () => {
    window.__TAB_CLEANER_SHOW_PREVIEW(ogData);
  };
  document.head.appendChild(previewScript);
}
```

### 方法 2：手动触发

在 Console 中：

```javascript
// 1. 抓取 OpenGraph
const ogData = window.__TAB_CLEANER_GET_OPENGRAPH();

// 2. 显示预览
window.__TAB_CLEANER_SHOW_PREVIEW(ogData);

// 3. 隐藏预览
window.__TAB_CLEANER_HIDE_PREVIEW();
```

## 预览卡片功能

### 显示内容
- **图片**：OpenGraph 图片或页面首图
- **标题**：页面标题
- **描述**：页面描述（如果有）
- **站点名称**：来源网站

### 操作按钮
- **保存**：保存到 Chrome Storage，发送到后端生成 embedding
- **忽略**：关闭预览卡片

## 集成到现有流程

### 当前流程
1. 用户点击"一键清理"
2. Background Script 调用后端 API
3. 后端返回 OpenGraph 数据
4. 保存到 Chrome Storage
5. 显示在个人空间

### 新流程（本地预览）
1. Content Script 自动抓取 OpenGraph（本地）
2. **显示预览卡片**（可选）
3. 用户确认后保存
4. 发送到后端生成 embedding（异步）
5. 保存到 Chrome Storage
6. 显示在个人空间

## 下一步优化

1. **自动显示预览**：页面加载完成后自动显示预览卡片
2. **键盘快捷键**：`Cmd+S` 保存，`Esc` 关闭
3. **拖拽保存**：拖拽卡片到个人空间
4. **批量预览**：多个标签页时显示多个预览卡片
5. **编辑功能**：允许用户编辑标题、描述

## 测试

1. 打开任意网页（如 https://example.com）
2. 打开 Console（F12）
3. 运行：
   ```javascript
   const og = window.__TAB_CLEANER_GET_OPENGRAPH();
   window.__TAB_CLEANER_SHOW_PREVIEW(og);
   ```
4. 应该看到右上角出现预览卡片

## 注意事项

- 预览卡片只在当前页面显示
- 保存后会自动关闭预览
- 预览卡片不会影响页面原有功能
- 可以同时显示多个预览（如果需要）



