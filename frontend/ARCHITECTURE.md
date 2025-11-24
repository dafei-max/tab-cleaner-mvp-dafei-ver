# Frontend 架构说明

## 📐 目录结构

```
frontend/
├── public/                    # ⚡ 运行时文件（无需构建，Chrome 扩展直接使用）
│   ├── assets/
│   │   ├── background.js     # Service Worker（后台脚本）
│   │   ├── content.js         # Content Script（卡片功能 - Shadow DOM）
│   │   ├── pet.js             # 宠物模块（桌面宠物 - Shadow DOM）
│   │   ├── card.html          # 卡片 HTML 模板
│   │   ├── style.css          # 卡片样式
│   │   └── styleguide.css     # 设计规范样式
│   ├── static/img/            # 图片资源（卡片、宠物、个人空间共用）
│   ├── manifest.json          # Chrome 扩展清单
│   └── *.html                 # 其他页面（popup, sidepanel, blank）
│
├── src/                       # ⚛️ React 源码（需要构建）
│   ├── personalspace/
│   │   └── index.jsx          # 个人空间入口
│   ├── screens/
│   │   └── PersonalSpace/     # 个人空间主组件
│   ├── components/
│   │   └── Component/         # 侧边栏组件
│   └── shared/
│       ├── utils.js           # 工具函数（getImageUrl 等）
│       └── api.js             # API 调用（预留）
│
├── personalspace.html         # 个人空间 HTML 入口（Vite 构建入口）
├── vite.config.js             # Vite 构建配置
└── package.json               # 项目依赖
```

## 🏗️ 架构设计

### 混合架构

项目采用混合架构，根据功能需求选择不同的技术栈：

#### 1. 卡片功能（Shadow DOM）
- **技术栈**：原生 JavaScript + Shadow DOM
- **位置**：`public/assets/content.js`
- **特点**：
  - 无需构建，直接运行
  - 使用 Shadow DOM 实现样式隔离
  - 突破 Chrome Popup 圆角限制
- **开发流程**：
  1. 修改 `public/assets/content.js` 或 `public/assets/card.html`
  2. 在 Chrome 扩展管理页面点击"重新加载"
  3. 刷新网页查看效果

#### 2. 桌面宠物功能（Shadow DOM）
- **技术栈**：原生 JavaScript + Shadow DOM（页面上下文）
- **位置**：`public/assets/pet.js`
- **特点**：
  - 在页面上下文中执行（通过 `chrome.scripting.executeScript`）
  - 可以访问页面的 `window` 对象
  - 独立模块，支持拖动等功能
- **开发流程**：
  1. 修改 `public/assets/pet.js`
  2. 重新加载扩展
  3. 刷新网页查看效果

#### 3. 个人空间功能（React）
- **技术栈**：React 18 + Vite 6
- **位置**：`src/screens/PersonalSpace/` + `src/components/Component/`
- **特点**：
  - 需要构建（`npm run build`）
  - 使用 React 组件化开发
  - 支持复杂交互和状态管理
- **开发流程**：
  1. 修改 `src/` 中的 React 组件
  2. 执行 `npm run build`
  3. 重新加载扩展
  4. 打开个人空间页面查看效果

## 🔄 构建流程

### Vite 构建配置

```javascript
// vite.config.js
{
  input: {
    blank: "public/blank.html",           // 占位页面
    personalspace: "personalspace.html"  // 个人空间页面
  },
  output: {
    entryFileNames: "assets/[name].js",   // React 应用打包为 JS
    assetFileNames: "assets/[name].[ext]" // 其他资源
  }
}
```

### 构建输出

- `public/` → 原样复制到 `dist/`（路径不变）
- `src/` → 通过 Vite 构建，打包为 `dist/assets/personalspace.js`
- `personalspace.html` → 构建后输出为 `dist/personalspace.html`

## 📦 资源管理

### 图片资源

所有图片资源统一放在 `public/static/img/` 目录：

- **卡片图片**：`background-2.png`, `window.png`, `home-button-2.png` 等
- **宠物图片**：`avatar.png`, `chatbubble-bg.png`, `props.svg` 等
- **个人空间图片**：`clipboard-*.png`, `image-*.png`, `vector-*.svg` 等

### 资源路径获取

- **卡片/宠物**：直接在代码中使用 `chrome.runtime.getURL('static/img/xxx.png')`
- **个人空间**：使用 `src/shared/utils.js` 中的 `getImageUrl()` 函数

```javascript
// src/shared/utils.js
export function getImageUrl(imageName) {
  return chrome.runtime.getURL(`static/img/${imageName}`);
}
```

## 🚀 开发工作流

### 开发卡片/宠物功能

```bash
# 1. 修改 public/assets/ 中的文件
vim public/assets/content.js

# 2. 在 Chrome 扩展管理页面点击"重新加载"

# 3. 刷新网页查看效果
```

### 开发个人空间功能

```bash
# 1. 修改 src/ 中的 React 组件
vim src/screens/PersonalSpace/PersonalSpace.jsx

# 2. 构建 React 应用
npm run build

# 3. 在 Chrome 扩展管理页面点击"重新加载"

# 4. 打开个人空间页面查看效果
```

## 📝 代码规范

### 文件命名

- **JavaScript 文件**：使用 camelCase（如 `content.js`, `background.js`）
- **React 组件**：使用 PascalCase（如 `PersonalSpace.jsx`, `Component.jsx`）
- **CSS 文件**：使用 kebab-case（如 `style.css`, `styleguide.css`）

### 目录结构

- `public/` - 运行时文件，无需构建
- `src/` - 源码文件，需要构建
- 每个功能模块独立目录，便于维护

## 🔍 调试指南

### 调试卡片功能

1. 打开网页的开发者工具（F12）
2. 在 Console 中查看 `[Tab Cleaner]` 开头的日志
3. 检查 Shadow DOM 是否正确创建

### 调试宠物功能

1. 打开网页的开发者工具（F12）
2. 在 Console 中查看 `[Tab Cleaner Pet]` 开头的日志
3. 检查 `window.__TAB_CLEANER_PET` 对象是否存在

### 调试个人空间

1. 打开个人空间页面（新标签页）
2. 打开开发者工具（F12）
3. 在 Console 中查看 React 相关日志
4. 使用 React DevTools 检查组件状态

### 调试 Service Worker

1. 打开 `chrome://extensions`
2. 找到扩展，点击"Service worker"链接
3. 在 Service Worker 控制台中查看日志

## 🎯 未来扩展

### 可能的功能扩展

1. **Side Panel 功能**：使用 React 开发侧边栏
2. **Popup 功能**：使用 React 开发弹窗
3. **更多 React 页面**：根据需要添加新的页面组件

### 扩展建议

- 新功能优先考虑使用 React（如果交互复杂）
- 简单功能可以直接使用原生 JavaScript + Shadow DOM
- 保持目录结构清晰，每个功能模块独立





