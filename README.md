# CleanTab MVP

一个基于 Chrome 扩展的标签页管理工具，使用 Shadow DOM 技术实现圆角卡片 UI，并集成桌面宠物功能。

## 功能特性

- 🎨 **圆角卡片 UI**：使用 Shadow DOM 技术，突破 Chrome Popup 圆角限制
- 🖱️ **可拖动卡片**：点击并拖动卡片上方的拖拽区域可移动卡片位置
- 📍 **智能定位**：卡片默认出现在浏览器右上角，插件图标下方
- 🎯 **交互按钮**：三个功能按钮（Home、Clean、Details）和关闭按钮
- 🖼️ **完整背景**：支持背景图片和所有装饰元素
- 📊 **详情显示**：点击 Details 按钮可显示/隐藏插件状态信息（开启时间等）
- 💡 **Tooltip 提示**：所有按钮都有悬停提示，显示功能说明
- 🐵 **桌面宠物**：
  - 点击 Window Button 在浏览器中央召唤桌面宠物
  - 宠物可以拖动到任意位置（拖动整个宠物容器）
  - 点击宠物头像显示操作菜单（隐藏、桌宠设置、清理当前页Tab、一键清理）
  - 宠物具有完整动画效果和交互体验
- 🏠 **个人空间**：
  - 点击卡片上的 Home Button 打开个人空间页面
  - 使用 React + Vite 构建的现代化界面
  - 支持标签页收藏、聚类、搜索等功能
  - 自适应布局，保持 Anima 原始设计风格
  - 🎨 **画布工具**：
    - **绘画工具**：自由绘制蓝色线条（8px 粗细），支持多段路径
    - **套索工具**：自由形状圈选多个图片，松开鼠标后自动选中
    - **文字工具**：点击画布任意位置添加文字，支持中英文自动切换字体
    - **图片拖拽**：所有图片都可以拖动，选中后显示蓝色外发光
    - **刷新清空**：刷新页面时自动清空绘画历史（保留文字元素）

## 目录结构

```
tab-cleaner-mvp/
├─ backend/
│  └─ app/
│     ├─ __init__.py
│     ├─ api/
│     │  └─ __init__.py
│     ├─ main.py              # FastAPI 应用入口
│     ├─ pyproject.toml        # 依赖配置
│     ├─ uv.lock              # 依赖锁定文件
│     ├─ services/             # 业务逻辑服务
│     └─ static/               # 静态资源
└─ frontend/
   ├─ src/
   │   ├─ background/          # Service Worker（未使用，已迁移到 public）
   │   ├─ shared/              # 共享逻辑（API 调用、工具函数等）
   │   │   └─ utils.js         # 资源路径工具函数（getImageUrl 等）
   │   ├─ screens/             # Anima 组件（React 版本）
   │   │   ├─ Card/            # 卡片组件（参考）
   │   │   └─ PersonalSpace/   # 个人空间组件
   │   ├─ components/          # React 组件
   │   │   └─ Component/       # 侧边栏组件（个人空间使用）
   │   ├─ personalspace/      # 个人空间入口文件
   │   │   └─ index.jsx        # React 应用入口
   │   └─ icons/               # SVG 图标
   ├─ public/                  # 静态资源（构建时会复制到 dist/）
   │   ├─ assets/
   │   │   ├─ background.js    # Service Worker：监听图标点击，处理消息传递
   │   │   ├─ content.js       # Content Script：创建 Shadow DOM 卡片
   │   │   ├─ pet.js           # 宠物模块：独立处理桌面宠物功能
   │   │   ├─ card.html        # 卡片 HTML 模板
   │   │   ├─ style.css        # 卡片样式
   │   │   └─ styleguide.css   # 设计规范样式
   │   ├─ static/
   │   │   └─ img/             # 图片资源
   │   │       ├─ background-2.png    # 卡片背景
   │   │       ├─ window.png           # 窗口装饰
   │   │       ├─ draggable-2.svg      # 拖拽图标
   │   │       ├─ home-button-2.png    # 首页按钮
   │   │       ├─ clean-button.png     # 清理按钮
   │   │       ├─ details-button.svg   # 详情按钮
   │   │       ├─ 洗衣机详情.png        # 详情显示图片（插件状态信息）
   │   │       ├─ avatar.png            # 宠物头像
   │   │       ├─ chatbubble-bg.png     # 对话气泡背景
   │   │       ├─ props.svg             # 宠物道具（风扇）
   │   │       ├─ vector-665.svg        # 按钮图标
   │   │       └─ vector-*.svg          # 装饰向量图
   │   ├─ manifest.json        # Chrome 扩展清单
   │   ├─ popup.html           # Popup 页面（备用）
   │   └─ sidepanel.html       # Side Panel 页面（备用）
   ├─ personalspace.html       # 个人空间 HTML 入口（项目根目录）
   ├─ dist/                    # 构建输出（Chrome 扩展目录）
   ├─ package.json
   └─ vite.config.js           # Vite 构建配置（包含个人空间入口）
```

## 快速开始

### 后端（FastAPI）

1. **安装 uv**（若尚未在 PATH）：
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source "$HOME/.local/bin/env"
   ```

2. **同步依赖并创建虚拟环境**：
   ```bash
   cd backend/app
   uv sync
   ```

3. **启动开发服务器**：
   ```bash
   # 方式一（推荐）：使用 uv 运行
   uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload

   # 方式二：直接用 venv 可执行文件
   ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. **访问**：
   - 健康检查: `http://127.0.0.1:8000/`（应返回 `{ "ok": true }`）
   - API 文档: `http://127.0.0.1:8000/docs`

### 前端（Chrome 扩展 - Shadow DOM + Vite）

#### 实现方式

本项目使用 **Shadow DOM** 技术实现卡片 UI，解决了 Chrome Popup 无法设置圆角的问题：

1. **点击插件图标** → `background.js` 监听点击事件
2. **注入 Content Script** → `content.js` 被注入到当前网页
3. **创建 Shadow DOM** → 在页面中创建隔离的卡片容器
4. **加载样式和模板** → 动态加载 CSS 和 HTML 模板
5. **显示可拖动卡片** → 卡片出现在右上角，支持拖动

#### 桌面宠物实现

桌面宠物功能通过以下架构实现：

1. **Content Script** → 点击 Window Button 发送消息给 Background Script
2. **Background Script** → 使用 `chrome.scripting.executeScript` 在页面上下文中：
   - 设置扩展 ID（用于资源路径）
   - 加载 `pet.js` 模块
   - 调用 `toggle()` 方法显示/隐藏宠物
3. **Pet Module** → 在页面上下文中创建 Shadow DOM，渲染宠物 UI
4. **拖动功能** → 在宠物容器上添加鼠标事件监听，实现拖动

#### 个人空间实现

个人空间功能通过以下架构实现：

1. **点击 Home Button** → `content.js` 发送 `open-personalspace` 消息给 Background Script
2. **Background Script** → 使用 `chrome.tabs.create()` 打开新标签页
3. **个人空间页面** → 独立的 HTML 页面（`personalspace.html`），使用 React + Vite 构建
4. **资源路径适配** → 使用 `src/shared/utils.js` 中的 `getImageUrl()` 函数，通过 `chrome.runtime.getURL()` 获取扩展资源路径
5. **样式自适应** → CSS 使用 `max()`、`calc()` 和 `transform` 实现响应式布局，保持 Anima 原始设计

#### 开发流程

1. **安装依赖**：
   ```bash
   cd frontend
   npm install
   ```

2. **开发模式**（监听文件变化并自动构建）：
   ```bash
   npm run dev
   ```
   > **注意**：开发时建议直接使用 `public/` 目录加载扩展，修改后只需"重新加载"扩展，无需重新构建。

3. **生产构建**：
   ```bash
   npm run build
   ```
   构建输出在 `dist/` 目录。
   - 卡片和宠物功能：直接使用 `public/` 目录的文件（无需构建）
   - 个人空间页面：需要构建 React 应用，生成 `dist/personalspace.html` 和 `dist/assets/personalspace.js`

4. **加载扩展到 Chrome**：
   - 打开 Chrome → 扩展程序 → 开发者模式
   - 点击"加载已解压的扩展"
   - 选择 `frontend/public/` 或 `frontend/dist/` 目录
   - 修改 `public/` 中的代码后，点击扩展的"重新加载"按钮即可生效

#### 核心文件说明

- **`public/assets/background.js`**：
  - Service Worker，监听插件图标点击，注入 content script
  - 处理来自 content script 的 "toggle-pet" 消息
  - 使用 `chrome.scripting.executeScript` 在页面上下文中加载和执行 pet.js

- **`public/assets/content.js`**：
  - Content Script，创建 Shadow DOM 并渲染卡片
  - 处理 Window Button 点击，发送消息给 background script
  - 使用 IIFE 模式，避免模块冲突

- **`public/assets/pet.js`**：
  - 宠物模块，独立处理桌面宠物功能
  - 在页面上下文中执行，创建 Shadow DOM 渲染宠物
  - 实现拖动功能、按钮菜单交互
  - 使用多种降级方案获取扩展资源 URL

- **`public/assets/card.html`**：卡片 HTML 模板，使用 `{{PLACEHOLDER}}` 占位符

- **`public/assets/style.css`**：卡片样式，包含按钮布局和定位

- **`public/manifest.json`**：扩展清单，配置权限和资源访问

- **`personalspace.html`**：个人空间页面入口（项目根目录）
  - 使用 React + Vite 构建
  - 引用 `src/personalspace/index.jsx` 作为入口

- **`src/personalspace/index.jsx`**：个人空间 React 应用入口

- **`src/screens/PersonalSpace/PersonalSpace.jsx`**：个人空间主组件
  - 使用 `getImageUrl()` 工具函数获取图片资源
  - 保持 Anima 原始设计风格
  - 管理图片状态、选中状态、工具状态
  - 实现套索工具的多选检测逻辑（点在多边形内、路径相交、边界相交）

- **`src/screens/PersonalSpace/CanvasTools.jsx`**：画布工具组件
  - 绘画工具：SVG 路径绘制，支持多段路径保存
  - 套索工具：自由形状绘制，鼠标松开时检测选中图片
  - 文字工具：输入框组件，支持拖拽定位和删除
  - 使用 localStorage 持久化绘画路径和文字元素

- **`src/screens/PersonalSpace/DraggableImage.jsx`**：可拖拽图片组件
  - 实现图片的拖拽功能
  - 支持选中状态（蓝色外发光）
  - 支持多选（Shift + 点击）

- **`src/components/Component/Component.jsx`**：侧边栏组件
  - 支持展开/收起状态
  - 鼠标悬停自动展开

- **`src/shared/utils.js`**：工具函数
  - `getAssetUrl(path)`: 获取扩展资源 URL
  - `getImageUrl(imageName)`: 获取图片资源 URL（自动添加 `static/img/` 前缀）

## 前后端联调

- 前端 API 端点：`http://localhost:8000/api/v1/...`
- 当前后端仅实现 `/` 健康检查，需要补充以下路由：
  - `POST /api/v1/sessions` - 创建会话
  - `POST /api/v1/tabs` - 添加标签页
  - `POST /api/v1/share` - 生成分享链接

## 后续扩展

### React Three Fiber（3D 可视化）

如需在 sidepanel 中使用 3D 渲染：

```bash
cd frontend
npm install @react-three/fiber @react-three/drei three
```

然后在 `src/sidepanel/SidePanelApp.jsx` 中使用。

## 常见问题

### 后端
- **无法导入 `fastapi`**：未执行 `uv sync` 或未在项目虚拟环境内运行
- **静态资源路径**：若将入口文件移动位置，注意更新 `StaticFiles(directory=...)` 的相对路径

### 前端

#### 扩展加载问题
- **扩展加载失败**：
  - 确保 `manifest.json` 中所有文件路径正确
  - 检查 `web_accessible_resources` 是否包含所需资源
  - 使用 `public/` 目录加载时，确保文件结构完整

#### 卡片显示问题
- **卡片不显示**：
  - 检查 Console 是否有错误（`chrome://extensions` → 扩展详情 → Service worker）
  - 确认 `content.js` 已正确注入（检查页面 Console）
  - 某些页面（如 `chrome://`、PDF）无法注入，这是正常限制

- **背景图片不显示**：
  - 确认 `background-2.png` 在 `static/img/` 目录中
  - 检查 `web_accessible_resources` 是否包含 `static/img/*`
  - 查看 Console 中图片加载错误

- **按钮无法点击**：
  - 检查 `pointer-events` 样式是否被覆盖
  - 确认 `z-index` 设置足够高
  - 查看是否有其他元素遮挡按钮

#### 桌面宠物问题
- **宠物不显示**：
  - 检查控制台是否有错误信息
  - 确认 `pet.js` 已正确加载（查看 `[Tab Cleaner Pet] Module loaded successfully!` 日志）
  - 检查扩展 ID 是否正确设置（查看 `[Tab Cleaner Background] Extension ID` 日志）

- **图片不显示**：
  - 检查图片文件是否在 `dist/static/img/` 目录中
  - 查看控制台中的图片 URL 是否正确
  - 确认 `web_accessible_resources` 包含 `static/img/*`
  - 检查扩展 ID 是否正确传递到页面上下文

- **拖动功能不工作**：
  - 确认鼠标事件监听器已正确添加
  - 检查是否有其他元素阻止了事件传播
  - 查看控制台是否有 JavaScript 错误

#### 个人空间问题
- **个人空间页面无法打开**：
  - 确认已执行 `npm run build` 构建 React 应用
  - 检查 `dist/personalspace.html` 和 `dist/assets/personalspace.js` 是否存在
  - 查看 Background Script 的控制台日志（`chrome://extensions` → Service worker）

- **图片不显示**：
  - 确认图片文件在 `public/static/img/` 目录中
  - 检查 `web_accessible_resources` 是否包含 `static/img/*`
  - 查看浏览器控制台中的图片 URL 是否正确（应该是 `chrome-extension://...` 格式）
  - 确认 `src/shared/utils.js` 中的 `getImageUrl()` 函数正常工作

- **样式布局错乱**：
  - 检查浏览器窗口大小是否小于最小宽度（1440px）
  - 查看 CSS 中的 `max()` 和 `calc()` 函数是否正确
  - 确认 `transform: translate(-50%, -50%)` 是否正确应用

- **构建失败**：
  - 确认 `personalspace.html` 在项目根目录（不在 `public/` 目录）
  - 检查 `vite.config.js` 中的入口配置是否正确
  - 查看构建错误信息，确认是否有语法错误或缺少依赖

#### 画布工具问题
- **绘画工具痕迹不显示**：
  - 检查 SVG 元素是否正确渲染（查看控制台 `[Draw]` 日志）
  - 确认 `drawPaths` 状态是否正确保存
  - 检查 SVG 的 `pointerEvents` 是否设置为 `none`（不应阻挡事件）

- **套索工具无法选中图片**：
  - 检查控制台 `[Lasso]` 日志，确认路径是否被记录
  - 确认路径长度大于 2 个点
  - 检查碰撞检测逻辑（点是否在多边形内、路径是否相交）

- **文字工具无法输入**：
  - 确认输入框的 z-index 足够高（1000）
  - 检查是否有其他元素阻挡输入框
  - 查看控制台是否有事件冲突错误
  - 确认输入框已自动聚焦（检查 `autoFocus` 属性）

- **图片无法拖动**：
  - 确认没有激活工具（工具激活时图片无法拖动）
  - 检查 `DraggableImage` 组件的事件处理
  - 查看是否有其他元素阻挡鼠标事件

#### 开发调试
- **修改代码后不生效**：
  - 如果使用 `public/` 目录：点击扩展的"重新加载"按钮
  - 如果使用 `dist/` 目录：执行 `npm run build` 后重新加载扩展
  - 刷新当前网页标签页

- **调试 Content Script**：
  - 在网页中右键 → 检查 → Console（不是扩展的 Service Worker Console）
  - 查看 `content.js` 的日志输出

- **调试 Service Worker**：
  - 在 `chrome://extensions` → 扩展详情 → Service worker（Inspect views）

- **调试宠物模块**：
  - 在页面 Console 中查看 `[Tab Cleaner Pet]` 开头的日志
  - 检查 `window.__TAB_CLEANER_PET` 对象是否存在
  - 查看图片 URL 是否正确生成

## Git 工作流

```bash
# 初始化（首次）
git init
git add .
git commit -m "chore: initial commit"

# 关联远端并推送
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 技术栈

- **后端**：FastAPI + Python 3.13+ + uv
- **前端**：
  - Chrome Extension Manifest V3
  - Shadow DOM API（卡片和宠物隔离渲染）
  - Content Script（页面注入）
  - Service Worker（后台脚本）
  - `chrome.scripting.executeScript`（在页面上下文中执行代码）
  - Vite 6（构建工具）
  - React 18（参考组件，当前使用原生 JS）
- **设计**：Anima 生成组件

## 工作原理

### Shadow DOM 实现

1. **隔离渲染**：Shadow DOM 创建完全隔离的样式和作用域，不受页面 CSS 影响
2. **圆角支持**：在 Shadow DOM 中可以自由设置 `border-radius`，不受 Chrome Popup 限制
3. **资源访问**：通过 `chrome.runtime.getURL()` 获取扩展资源路径
4. **动态加载**：CSS 和 HTML 模板通过 `fetch` 动态加载，替换图片路径占位符

### 消息通信架构

#### 卡片显示流程
- **Background → Content**：`chrome.tabs.sendMessage()` 发送显示/隐藏命令
- **Content → Background**：`chrome.runtime.sendMessage()` 发送按钮点击事件
- **自动注入**：如果页面在扩展安装前已打开，点击图标时会自动注入 content script

#### 桌面宠物流程
- **Content → Background**：点击 Window Button 时，content script 发送 `{ action: "toggle-pet" }` 消息
- **Background → Page Context**：
  - 使用 `chrome.scripting.executeScript` 设置扩展 ID
  - 加载 `pet.js` 文件到页面上下文
  - 调用 `window.__TAB_CLEANER_PET.toggle()` 方法
- **Pet Module**：在页面上下文中创建 Shadow DOM，渲染宠物 UI

### 资源路径获取

由于 `pet.js` 在页面上下文中执行，无法直接访问 `chrome.runtime.getURL()`，因此使用以下降级方案：

1. **优先方案**：Background script 通过 `executeScript` 的 `args` 参数传递扩展 ID
2. **备用方案**：从脚本 URL 中推断扩展 ID
3. **降级方案**：使用已知的扩展 ID（如果之前访问过）

## 开发注意事项

1. **文件路径一致性**：确保 `manifest.json`、`content.js`、`background.js` 中的路径一致
2. **资源可访问性**：所有需要从页面访问的资源必须在 `web_accessible_resources` 中声明
3. **模块类型**：
   - `content.js` 使用 IIFE 格式，确保可以通过 `executeScript` 注入
   - `pet.js` 使用 IIFE 格式，在页面上下文中执行
4. **样式隔离**：Shadow DOM 内的样式不会影响页面，页面的样式也不会影响 Shadow DOM
5. **上下文隔离**：
   - Content Script 运行在隔离上下文，无法直接访问页面的 `window` 对象
   - 使用 `chrome.scripting.executeScript` 可以在页面上下文中执行代码
   - 页面上下文中的代码可以访问页面的 `window` 对象，但无法访问扩展 API
6. **CSP 合规**：
   - 避免使用内联脚本（`script.textContent = ...`），会被 CSP 阻止
   - 使用 `chrome.scripting.executeScript` 的 `files` 或 `func` 参数
7. **图片资源同步**：
   - 开发时确保 `public/static/img/` 中的图片文件完整
   - 构建时确保图片文件被复制到 `dist/static/img/`
   - 可以使用 `cp -r public/static/img/* dist/static/img/` 手动同步

## 更新日志

### v0.0.2
- ✅ 实现画布工具功能
  - 绘画工具：自由绘制蓝色线条，支持多段路径
  - 套索工具：自由形状圈选图片，支持多选
  - 文字工具：添加文字，支持中英文自动切换字体
  - 图片拖拽：所有图片可拖动，选中后显示蓝色外发光
  - 刷新清空：页面刷新时自动清空绘画历史
  - 工具光标：根据激活的工具动态切换光标样式
  - 事件处理：优化事件冒泡和冲突处理

### v0.0.1
- ✅ 实现 Shadow DOM 卡片 UI
- ✅ 添加拖动功能（卡片和宠物）
- ✅ 实现桌面宠物功能
- ✅ 修复图片路径问题
- ✅ 优化消息传递架构
- ✅ 添加 Tooltip 提示
- ✅ 实现详情显示功能
- ✅ 实现个人空间功能
  - 集成 React + Vite 构建流程
  - 适配扩展资源路径（使用 `chrome.runtime.getURL`）
  - 实现响应式布局，保持 Anima 原始设计
  - 添加侧边栏组件和完整 UI 交互
