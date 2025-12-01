# 截图模式使用指南

## 📸 功能概述

截图模式是 Tab Cleaner 的增强功能，用于应对特殊渲染场景，如：
- **Canvas 绘制内容**（Figma、Canva、Excalidraw 等）
- **视频帧捕获**（YouTube、Bilibili 等）
- **动态效果**（hover 才显示的图片）
- **需要精确裁剪的图片**（去除周围干扰）

## 🎯 使用方法

### 方式 1: Alt + 拖拽（推荐）

1. **按住 Alt 键**
2. **拖拽选择区域**（鼠标左键按住并拖动）
3. **释放鼠标**完成截图
4. **按 ESC 取消**

### 方式 2: 自动提示

当检测到页面包含 Canvas/Video 元素时，右下角会自动显示提示：
```
📸 需要截图？
按 Alt + 拖拽选择区域
```

## 🎨 适用场景

### 1. Figma/Canva 设计稿

**问题**：Canvas 内容无法通过普通图片抓取

**解决**：
1. 打开 Figma/Canva 设计稿
2. 按 `Alt` + 拖拽选择设计区域
3. 自动截图并保存

### 2. 视频帧捕获

**问题**：视频播放器的某一帧需要保存

**解决**：
1. 暂停视频到目标帧
2. 按 `Alt` + 拖拽选择视频区域
3. 截图当前帧

### 3. 动态效果

**问题**：hover 才显示的图片无法抓取

**解决**：
1. 鼠标悬停显示图片
2. 按 `Alt` + 拖拽选择图片区域
3. 截图保存

### 4. 精确裁剪

**问题**：页面图片周围有干扰元素

**解决**：
1. 按 `Alt` + 拖拽精确选择图片区域
2. 只保存选中部分

## 🔧 技术实现

### 工作流程

```
用户按 Alt + 拖拽
  ↓
显示框选覆盖层
  ↓
用户选择区域
  ↓
发送消息到 background.js
  ↓
background.js 调用 captureVisibleTab
  ↓
返回全屏截图
  ↓
content script 裁剪指定区域
  ↓
保存到 Tab Cleaner
```

### 关键代码

**框选检测**：
```javascript
// Alt 键按下
if (e.key === 'Alt') {
  startSelectionMode();
}

// 拖拽选择
document.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);
```

**截图请求**：
```javascript
// content script 发送请求
const response = await chrome.runtime.sendMessage({
  action: 'capture-screenshot-selection',
  bounds: { x, y, width, height },
});

// background.js 截图
const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
  format: 'png',
  quality: 100,
});
```

**图片裁剪**：
```javascript
// 使用 Canvas API 裁剪
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');
ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
const cropped = canvas.toDataURL('image/png');
```

## 📊 性能优化

### 1. 延迟加载

截图模式只在检测到需要时才加载：
- 检测到 Canvas/Video 元素
- 访问 Figma/Canva 等网站

### 2. 智能提示

- 自动检测需要截图的场景
- 显示友好的提示信息
- 5秒后自动隐藏

### 3. 高质量截图

- 使用 PNG 格式（无损）
- quality: 100（最高质量）
- 支持高DPI屏幕

## 🐛 故障排查

### Q1: Alt + 拖拽没反应？

**检查**：
1. 确保扩展已加载（检查 Console）
2. 检查是否有其他扩展占用 Alt 键
3. 尝试刷新页面

### Q2: 截图区域不准确？

**解决**：
1. 确保选择区域足够大（至少 10x10 像素）
2. 检查页面是否有滚动
3. 尝试重新选择

### Q3: 截图保存失败？

**检查**：
1. 检查 Console 错误信息
2. 确保 background.js 正常运行
3. 检查权限设置

## 🚀 未来优化

### 1. 快捷键自定义

允许用户自定义快捷键（默认 Alt）

### 2. 全页截图

支持滚动截图整个页面

### 3. 批量截图

支持一次选择多个区域

### 4. 截图编辑

支持截图后编辑（标注、裁剪等）

## 📝 总结

截图模式是 Tab Cleaner 的重要补充功能，解决了：
- ✅ Canvas 内容无法抓取
- ✅ 视频帧无法保存
- ✅ 动态效果无法捕获
- ✅ 需要精确裁剪的场景

**使用简单**：Alt + 拖拽即可完成截图！

