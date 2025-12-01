# 图片采集功能完整实现

## ✅ 已实现的功能

### 1. 拖拽图片到桌宠 (Eagle 式交互) ✅

**文件**: `image_capture_enhanced.js`

**功能**:
- ✅ 用户拖拽任意图片到桌宠区域即可保存
- ✅ 自动提取页面元数据 (标题、描述)
- ✅ 卡片图像 = 用户拖拽的图像
- ✅ 拖拽时高亮桌宠区域

**实现原理**:
```javascript
// 监听图片拖拽开始
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG' && isValidImage(e.target)) {
    draggedImage = { url: getImageUrl(e.target) };
    highlightPet(); // 高亮桌宠区域
  }
});

// 检测是否拖到桌宠
document.addEventListener('dragend', (e) => {
  if (isOverPet(e.clientX, e.clientY)) {
    captureImage(draggedImage.url);
  }
});
```

**使用方法**:
1. 鼠标按住任意图片
2. 拖动到右下角桌宠区域（桌宠会高亮）
3. 松开鼠标 → 自动保存

### 2. 图片悬停标记 (精确抓图) ✅

**文件**: `image_capture_enhanced.js`

**功能**:
- ✅ 鼠标悬停在图片上时，右上角出现"保存"按钮
- ✅ 点击即可精确采集该图片
- ✅ 自动过滤小图标/Logo
- ✅ 平滑的显示/隐藏动画

**实现原理**:
```javascript
// 鼠标悬停显示标记
document.addEventListener('mouseover', (e) => {
  if (e.target.tagName === 'IMG' && isValidImage(e.target)) {
    showMarker(e.target); // 显示保存按钮
  }
});

// 点击标记保存
marker.addEventListener('click', () => {
  captureImage(getImageUrl(img));
});
```

**使用方法**:
1. 鼠标移到图片上
2. 右上角出现"保存"按钮
3. 点击按钮 → 自动保存

### 3. 右键菜单 - 收藏到 Tab Cleaner ✅

**文件**: `background.js` + `image_capture_enhanced.js`

**功能**:
- ✅ 右键任意图片 → "收藏到 Tab Cleaner"
- ✅ Chrome 原生菜单，体验流畅
- ✅ 自动提取页面元数据

**实现原理**:
```javascript
// 创建右键菜单
chrome.contextMenus.create({
  id: 'save-image-to-tab-cleaner',
  title: '收藏到 Tab Cleaner',
  contexts: ['image'],
});

// 处理点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-image-to-tab-cleaner') {
    saveImage(info.srcUrl, tab);
  }
});
```

**使用方法**:
1. 右键点击任意图片
2. 选择"收藏到 Tab Cleaner"
3. 自动保存

### 4. 智能首图检测 (针对特殊网站) ✅

**文件**: `opengraph_local_v2.js`

**功能**:
- ✅ 花瓣、优设、站酷等网站的特定规则
- ✅ 智能评分算法选择最佳图片
- ✅ 综合考虑位置、尺寸、宽高比、上下文

**网站规则**:
```javascript
siteRules: {
  'huaban.com': {
    name: '花瓣',
    imageSelector: '.pin-img img, .board-pin img',
    preferFirstVisible: true,
  },
  'uisdc.com': {
    name: '优设',
    imageSelector: 'article img, .post-thumbnail img',
    preferFeaturedImage: true,
  },
  // ... 更多网站
}
```

**评分算法**:
```javascript
图片得分 = 
  位置权重(35%) +  // 越靠前越好
  尺寸权重(35%) +  // 越大越好
  宽高比权重(20%) + // 接近 16:9 更好
  上下文权重(10%)  // 在主内容区更好
```

**使用方法**:
- 自动工作，无需手动操作
- 点击"一键清理"时自动选择最佳图片

### 5. SPA 路由监听 (小红书等) ✅

**文件**: `opengraph_local_v2.js`

**功能**:
- ✅ 监听 URL 变化 (pushState/replaceState/popstate)
- ✅ 自动触发重新提取
- ✅ 清除旧缓存，等待新内容加载

**实现原理**:
```javascript
// 拦截 History API
const originalPushState = history.pushState;
history.pushState = function(...args) {
  originalPushState.apply(this, args);
  handleURLChange(); // URL 变了，清除缓存，重新提取
};

function handleURLChange() {
  clearCache();
  setTimeout(() => {
    extractOpenGraph();
  }, 1500); // 等待小红书内容加载
}
```

**使用方法**:
- 自动工作，无需手动操作
- 在小红书等 SPA 网站中，URL 变化时自动更新图片

## 📊 功能对比

| 功能 | 实现状态 | 文件 | 使用场景 |
|------|---------|------|----------|
| 拖拽到桌宠 | ✅ | `image_capture_enhanced.js` | 快速保存，Eagle 式交互 |
| 悬停标记 | ✅ | `image_capture_enhanced.js` | 精确选择，避免误操作 |
| 右键菜单 | ✅ | `background.js` | 快速保存，符合用户习惯 |
| 智能首图 | ✅ | `opengraph_local_v2.js` | 自动选择，无需手动操作 |
| SPA 监听 | ✅ | `opengraph_local_v2.js` | 自动更新，实时跟随 |

## 🎯 使用建议

### 场景 1: 快速保存单张图片
**推荐**: 右键菜单
- 最快速度
- 符合用户习惯

### 场景 2: 精确选择图片
**推荐**: 悬停标记
- 精确控制
- 避免误操作

### 场景 3: 批量保存
**推荐**: 拖拽到桌宠
- 连续操作
- 直观交互

### 场景 4: 自动抓取
**推荐**: 智能首图 + 一键清理
- 无需手动操作
- 自动选择最佳图片

## 🔧 技术细节

### 图片过滤规则

**排除条件**:
- 尺寸 < 200x200px
- 包含关键词：icon, logo, avatar, favicon, sprite, button, arrow, badge, ad, banner
- 在 alt 或 className 中包含排除关键词

**通过条件**:
- 尺寸 >= 200x200px
- 不在排除列表中
- 有有效的 src 或 data-src

### 桌宠检测

**多个选择器**:
```javascript
petSelectors: [
  '#tab-cleaner-pet-container',
  '.window-button-wrapper',
  '#tc-card',
  '[id*="pet"]',
  '[class*="pet"]',
]
```

**检测逻辑**:
- 按顺序尝试每个选择器
- 找到第一个匹配的元素
- 缓存结果，避免重复查找

### 元数据提取

**优先级**:
1. OpenGraph 标签 (og:title, og:description)
2. 页面标题 (document.title)
3. URL (window.location.href)

**自动提取**:
- 标题
- 描述
- 站点名称
- 图片 URL

## 🚀 未来优化

### 1. 批量拖拽
- 支持一次拖拽多张图片
- 显示进度提示

### 2. 预览功能
- 保存前显示预览
- 允许编辑标题/描述

### 3. 智能分类
- 自动识别图片类型
- 自动打标签

### 4. 快捷键支持
- 自定义快捷键
- 快速保存当前图片

## 📝 总结

所有 5 个功能都已完整实现：

✅ **拖拽图片到桌宠** - Eagle 式交互，直观快速
✅ **图片悬停标记** - 精确选择，避免误操作
✅ **右键菜单** - 符合用户习惯，快速保存
✅ **智能首图检测** - 自动选择，无需手动操作
✅ **SPA 路由监听** - 实时更新，自动跟随

现在 Tab Cleaner 提供了多种图片采集方式，满足不同场景的需求！🎉

