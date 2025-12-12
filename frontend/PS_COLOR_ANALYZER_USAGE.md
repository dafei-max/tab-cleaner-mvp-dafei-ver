# PersonalSpace 颜色分析器使用指南

## 📋 概述

`ps_color_analyzer.js` 是一个 Eagle 式颜色搜索实现，用于在 PersonalSpace 中自动提取和分析图片的主色调。

## 🎯 核心功能

1. **自动颜色提取**：PersonalSpace 加载时，自动扫描所有卡片并提取颜色
2. **智能缓存**：使用 `chrome.storage.local` 缓存颜色数据，7天过期
3. **批量处理**：分批处理图片，避免阻塞 UI
4. **Delta E 算法**：使用 Delta E 颜色距离算法进行颜色匹配

## 📦 文件位置

- **脚本文件**：`public/assets/ps_color_analyzer.js`
- **HTML 加载**：`personalspace.html` 中已自动加载

## 🔧 API 使用

### 访问全局 API

颜色分析器在全局对象上暴露了 API：

```javascript
const colorAnalyzer = window.__TAB_CLEANER_PS_COLOR_ANALYZER;
```

### 主要方法

#### 1. `analyzeSessions(sessions, options)`

批量分析所有 session 中的卡片颜色。

**参数：**
- `sessions` (Array): Session 数组，每个 session 包含 `opengraphData`
- `options` (Object): 选项
  - `onProgress` (Function): 进度回调 `(current, total) => void`
  - `onCardComplete` (Function): 卡片完成回调 `(card, analyzed, total) => void`
  - `onUpdateSession` (Function): **必需** - 更新 session 的回调 `(sessionId, updates) => void`
  - `forceReanalyze` (boolean): 是否强制重新分析（默认 false）

**返回值：**
```javascript
{
  success: true,
  analyzed: 10,  // 成功分析的数量
  failed: 2,     // 失败的数量
  total: 12      // 总数
}
```

**示例：**
```javascript
const colorAnalyzer = window.__TAB_CLEANER_PS_COLOR_ANALYZER;

// 在 PersonalSpace 组件中使用
useEffect(() => {
  if (!sessions || sessions.length === 0) return;
  if (!colorAnalyzer) {
    console.warn('[PersonalSpace] Color analyzer not loaded');
    return;
  }

  colorAnalyzer.analyzeSessions(sessions, {
    onProgress: (current, total) => {
      console.log(`颜色分析进度: ${current}/${total}`);
    },
    onCardComplete: (card, analyzed, total) => {
      console.log(`完成分析: ${card.title} (${analyzed}/${total})`);
    },
    onUpdateSession: (sessionId, updates) => {
      // 更新 session 数据
      updateSession(sessionId, updates);
    },
    forceReanalyze: false, // 不强制重新分析
  }).then(result => {
    console.log('颜色分析完成:', result);
  });
}, [sessions, updateSession]);
```

#### 2. `extractColorsFromUrl(imageUrl)`

从单个图片 URL 提取颜色。

**参数：**
- `imageUrl` (string): 图片 URL（必须是 HTTP/HTTPS URL，不支持 base64）

**返回值：**
```javascript
{
  success: true,
  colors: [
    { hex: '#FF5733', rgb: [255, 87, 51], percentage: 45.2 },
    { hex: '#33FF57', rgb: [51, 255, 87], percentage: 30.1 },
    // ...
  ]
}
```

**示例：**
```javascript
const result = await colorAnalyzer.extractColorsFromUrl('https://example.com/image.jpg');
if (result.success) {
  console.log('提取的颜色:', result.colors);
}
```

#### 3. 缓存管理

```javascript
// 加载缓存
const cache = await colorAnalyzer.loadColorCache();

// 保存缓存（通常由 analyzeSessions 自动处理）
await colorAnalyzer.saveColorCache(cache);

// 清理过期缓存
await colorAnalyzer.clearExpiredCache();
```

## 🔄 工作流程

### 1. PersonalSpace 加载时

```javascript
// 在 PersonalSpace.jsx 中
useEffect(() => {
  const colorAnalyzer = window.__TAB_CLEANER_PS_COLOR_ANALYZER;
  if (!colorAnalyzer || !sessions) return;

  // 自动分析所有 session
  colorAnalyzer.analyzeSessions(sessions, {
    onUpdateSession: updateSession,
    onProgress: (current, total) => {
      // 可选：显示进度
    },
  });
}, [sessions, updateSession]);
```

### 2. 颜色搜索时

颜色搜索功能已经在 `PersonalSpace.jsx` 的 `handleColorFilter` 中实现，使用 `dominant_colors` 字段和 Delta E 算法。

## 📊 数据结构

### Session 结构

```javascript
{
  id: 'session-123',
  name: 'My Session',
  opengraphData: [
    {
      id: 'og-123',
      url: 'https://example.com',
      title: 'Example',
      image: 'https://example.com/image.jpg',  // 或 base64
      thumbnail: 'data:image/png;base64,...',  // base64
      screenshot_image: 'data:image/png;base64,...',  // base64
      dominant_colors: ['#FF5733', '#33FF57', ...],  // 颜色数组（hex 字符串）
    }
  ]
}
```

### 颜色数据格式

分析器返回的颜色格式：
```javascript
{
  hex: '#FF5733',        // Hex 颜色值
  rgb: [255, 87, 51],    // RGB 数组
  percentage: 45.2       // 占比（百分比）
}
```

但存储到 `dominant_colors` 时，只保存 hex 字符串数组：
```javascript
dominant_colors: ['#FF5733', '#33FF57', '#3357FF']
```

## ⚙️ 配置

可以通过 `colorAnalyzer.config` 访问和修改配置：

```javascript
const config = colorAnalyzer.config;
console.log(config);
// {
//   batchSize: 5,           // 每批处理 5 张图
//   batchDelay: 300,        // 批次间隔 300ms
//   maxColors: 5,           // 最多 5 个主色
//   sampleRate: 10,         // 采样率（每 10 个像素取 1 个）
//   cacheKey: 'color_cache',
//   cacheExpiry: 604800000  // 7天过期（毫秒）
// }
```

## ⚠️ 注意事项

1. **CORS 限制**：某些网站可能不允许跨域加载图片，会导致颜色提取失败
2. **Base64 图片**：`extractColorsFromUrl` 只处理 HTTP/HTTPS URL，base64 图片需要使用 `colorUtils.js` 中的 `extractColorsFromBase64`
3. **缓存键**：使用图片 URL 作为缓存键，相同的 URL 会复用缓存
4. **性能**：批量处理会自动控制并发和延迟，避免阻塞 UI

## 🐛 调试

启用详细日志：

```javascript
// 在浏览器控制台中
const colorAnalyzer = window.__TAB_CLEANER_PS_COLOR_ANALYZER;
console.log('[PS Color Analyzer]', colorAnalyzer);
```

查看缓存：

```javascript
const cache = await colorAnalyzer.loadColorCache();
console.log('颜色缓存:', cache);
```

## 🔗 相关文件

- `src/utils/colorUtils.js` - 颜色工具函数（Delta E、颜色转换等）
- `src/screens/PersonalSpace/PersonalSpace.jsx` - PersonalSpace 主组件
- `public/assets/ps_color_analyzer.js` - 颜色分析器脚本


