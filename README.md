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
  - 点击 Window Button 切换宠物显示/隐藏状态
  - 宠物状态全局同步：在任何标签页召唤宠物，所有标签页都会显示
  - 宠物位置同步：拖动宠物到新位置，所有标签页的位置都会更新
  - 宠物可以拖动到任意位置（拖动整个宠物容器）
  - 点击宠物头像显示操作菜单（隐藏、桌宠设置、清理当前页Tab、一键清理）
  - 宠物具有完整动画效果和交互体验
  - 新标签页自动恢复宠物状态和位置
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
    - **撤销/重做**：支持撤销和重做操作（图片移动、删除、选择、绘画、文字等）
  - 🤖 **AI 洞察**：
    - 使用通义千问（阿里云）分析选中的 OpenGraph 数据
    - 智能识别图片为主平台（Pinterest、小红书、Arena 等）
    - 生成不超过 150 字的综合总结
    - 支持环境变量配置 API Key（.env）
  - 📊 **选中面板**：
    - 选中图片时在右侧显示操作面板
    - 显示选中数量和分组名称（可编辑）
    - 支持删除、命名分组、打开、下载链接、AI洞察等操作
  - 🗑️ **删除功能**：从画布移除选中的图片（支持撤销/重做）
  - 📥 **下载链接**：导出选中图片的 URL 列表为 JSON 文件
  - 🔍 **OpenGraph 数据**：
    - **客户端优先提取**：使用 `opengraph_local.js` 在浏览器本地提取 OpenGraph 数据（支持动态内容）
    - **缓存机制**：提取的数据自动保存到 Chrome Storage 的 `recent_opengraph` 缓存
    - **一键清理流程**：
      1. 从每个标签页的缓存读取 OpenGraph 数据（优先使用缓存，避免重复提取）
      2. 收集所有数据并保存到 `sessions`（Chrome Storage）
      3. 关闭所有标签页
      4. 打开个人空间并立即渲染卡片（不等待后端处理）
      5. 异步发送数据到后端进行 embedding 向量化和数据库存储
    - **后端处理**：
      - 接收 OpenGraph 数据并生成文本和图像 embedding（使用阿里云通义千问多模态 API）
      - 保存到向量数据库（Alibaba Cloud AnalyticDB PostgreSQL）
      - 支持后续的语义搜索和相关性检索
    - **个人空间展示**：
      - 以放射状布局展示 OpenGraph 图片
      - 点击图片显示完整的 OpenGraph 信息卡片
      - OpenGraph 图片支持拖拽、选中、套索、绘画、文字等所有画布工具
  - 🔎 **智能搜索功能**：
    - 使用阿里云通义千问多模态Embedding API实现语义搜索
    - 支持文本和图片的模糊搜索（语义相关性检索）
    - 搜索结果按相关性圆形排列（最相关在内环，向外递减）
    - 图片自动归一化处理（缩放、压缩）以节省token成本
    - 支持批量处理，避免API过载
    - **数据持久化**：所有 OpenGraph 数据和 embedding 向量都保存到向量数据库，支持跨会话搜索
    - **用户隔离搜索**：每个用户只会搜索到自己收藏的卡片记录
  - 🗑️ **软删除机制**：
    - 支持删除单个 tab 或整个 session（洗衣筐）
    - 软删除：数据不会立即物理删除，只是标记为已删除
    - 前端-后端同步：删除操作会同步更新数据库和本地存储
    - 自动过滤：已删除的记录不会出现在搜索结果中
    - 定时清理：30 天后自动清理或匿名化已删除的数据

## 数据流程

### OpenGraph 提取与处理流程

```
1. 页面加载
   ↓
   opengraph_local.js 自动提取 OpenGraph 数据
   ↓
   保存到 Chrome Storage (recent_opengraph 缓存)

2. 用户点击"一键清理"
   ↓
   background.js 收集所有标签页的 OpenGraph 数据
   ├─ content.js 从缓存读取（优先）
   └─ 如果缓存没有，fallback 到重新提取
   ↓
   保存到 Chrome Storage (sessions)
   ↓
   关闭所有标签页
   ↓
   打开个人空间并立即渲染（不等待后端）

3. 异步后端处理（不阻塞 UI）
   ↓
   background.js 批量发送数据到 /api/v1/search/embedding
   ↓
   后端处理：
   ├─ 检查数据库是否已有 embedding
   ├─ 如果没有，生成新的 embedding（文本 + 图像）
   ├─ 保存到向量数据库（Alibaba Cloud AnalyticDB PostgreSQL）
   │  ├─ 存储时包含 user_id 和 session_id（用于软删除）
   │  ├─ status 默认为 'active'
   │  └─ 搜索时严格携带 user_id，保证只返回自己的数据
   └─ 返回 embedding 数据
   ↓
   background.js 更新 sessions 中的 embedding 数据
   ↓
   个人空间自动刷新显示（通过 storage.onChanged 监听）

4. 删除操作（软删除）
   ↓
   用户在个人空间删除 tab 或 session
   ↓
   前端调用 DELETE API（/api/v1/tabs/{id} 或 /api/v1/sessions/{id}）
   ↓
   后端软删除：
   ├─ 更新数据库：status = 'deleted', deleted_at = NOW()
   ├─ 已删除的记录不会出现在搜索结果中
   └─ 返回删除结果
   ↓
   前端同步更新 chrome.storage.local 中的 sessions 数据
   ↓
   30 天后定时任务清理（匿名化或物理删除）
```

### 数据存储位置

- **Chrome Storage (Local)**：
  - `recent_opengraph`: 最近提取的 OpenGraph 数据缓存（按 URL 索引）
  - `sessions`: 所有清理会话的数据（包含 OpenGraph 数据和 embedding）
  - `opengraph_cache_*`: 按 URL 的缓存键

- **向量数据库 (Alibaba Cloud AnalyticDB PostgreSQL)**：
  - `opengraph_items` 表：存储所有 OpenGraph 数据、文本 embedding、图像 embedding
  - 支持语义搜索和相关性检索
  - 使用 HNSW 索引（FastANN）进行快速向量搜索

## 目录结构

```
tab-cleaner-mvp/
├─ backend/
│  └─ app/
│     ├─ __init__.py
│     ├─ api/
│     │  └─ __init__.py
│     ├─ main.py              # FastAPI 应用入口
│     ├─ opengraph.py          # OpenGraph 数据抓取模块
│     ├─ ai_insight.py         # AI 洞察模块（调用通义千问）
│     ├─ ai_prompts.py         # AI 提示词配置模块
│     ├─ search.py             # 搜索功能模块（多模态Embedding和相关性检索）
│     ├─ .env.example          # 环境变量配置模板
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
   │   │   ├─ background.js    # Service Worker：监听图标点击，处理消息传递、OpenGraph 数据收集和异步 embedding 生成
   │   │   ├─ content.js       # Content Script：创建 Shadow DOM 卡片，从缓存读取 OpenGraph 数据
   │   │   ├─ opengraph_local.js # 本地 OpenGraph 提取脚本：在页面上下文中提取 OG 数据并保存到缓存
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

### 完整启动流程

#### 1. 环境准备

**后端环境**：
```bash
# 安装 uv（Python 包管理器）
curl -LsSf https://astral.sh/uv/install.sh | sh
source "$HOME/.local/bin/env"
```

**前端环境**：
```bash
# 确保已安装 Node.js (>= 16)
node --version
npm --version
```

#### 2. 后端配置与启动

```bash
# 进入后端目录
cd backend/app

# 同步依赖并创建虚拟环境
uv sync

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 DASHSCOPE_API_KEY
# DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxx

# 启动开发服务器
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**验证后端**：
- 健康检查: `http://127.0.0.1:8000/`（应返回 `{ "ok": true }`）
- API 文档: `http://127.0.0.1:8000/docs`

#### 3. 前端配置与启动

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 开发模式（监听文件变化，自动构建）
npm run dev
```

**加载 Chrome 扩展**：
1. 打开 Chrome → 扩展程序 (`chrome://extensions/`)
2. 开启"开发者模式"
3. 点击"加载已解压的扩展"
4. 选择 `frontend/public/` 目录（开发模式）或 `frontend/dist/` 目录（生产模式）

### 后端（FastAPI）

#### 依赖管理

项目使用 `uv` 进行依赖管理，所有依赖在 `pyproject.toml` 中定义。

#### 主要模块

- **`main.py`**: FastAPI 应用入口，定义所有 API 端点
- **`opengraph.py`**: OpenGraph 数据抓取（异步并发）
- **`ai_insight.py`**: AI 洞察模块（通义千问文本生成）
- **`search.py`**: 搜索功能模块（多模态Embedding）
- **`ai_prompts.py`**: AI 提示词配置

#### API 端点

- `GET /`: 健康检查
- `POST /api/v1/tabs/opengraph`: 批量抓取 OpenGraph 数据
- `POST /api/v1/ai/insight`: AI 洞察分析
- `POST /api/v1/search/embedding`: 生成 Embedding 向量
- `POST /api/v1/search/query`: 搜索查询

### 前端（Chrome 扩展 - Shadow DOM + Vite）

#### 搜索功能使用

**位置**：个人空间顶部的搜索栏（SearchBar）

**使用步骤**：

1. **准备数据**：
   - 点击卡片上的"Clean Button"抓取所有标签的 OpenGraph 数据
   - 数据会自动加载到个人空间画布上

2. **执行搜索**：
   - 在搜索栏输入关键词（如"绿色参考"、"设计灵感"）
   - 按 `Enter` 键执行搜索
   - 首次搜索会自动生成 Embedding（可能需要一些时间）

3. **查看结果**：
   - 搜索结果按相关性圆形排列
   - 最相关的内容在画布中心（内环）
   - 相关性递减，向外扩展

4. **清空搜索**：
   - 点击搜索栏右侧的 ✕ 按钮
   - 或按 `ESC` 键
   - 恢复原始布局

**搜索状态**：
- 搜索时显示"搜索中..."
- 自动分批处理，避免过载
- 错误会显示提示信息

**前端搜索逻辑**：
```javascript
// 1. 用户输入搜索关键词
// 2. 检查是否有 Embedding
//    - 如果没有：自动调用 /api/v1/search/embedding（分批处理）
//    - 如果有：直接使用缓存的 Embedding
// 3. 调用 /api/v1/search/query 执行搜索
// 4. 根据相似度分数，使用 calculateRadialLayout() 排列结果
// 5. 更新画布显示
```

#### 实现方式

本项目使用 **Shadow DOM** 技术实现卡片 UI，解决了 Chrome Popup 无法设置圆角的问题：

1. **点击插件图标** → `background.js` 监听点击事件
2. **注入 Content Script** → `content.js` 被注入到当前网页
3. **创建 Shadow DOM** → 在页面中创建隔离的卡片容器
4. **加载样式和模板** → 动态加载 CSS 和 HTML 模板
5. **显示可拖动卡片** → 卡片出现在右上角，支持拖动

#### 桌面宠物实现

桌面宠物功能通过以下架构实现（v2.4）：

1. **Content Scripts 配置** → `manifest.json` 中配置 `pet.js` 和 `content.js` 作为 content scripts
   - `pet.js` 在 `content.js` 之前加载，确保初始化顺序
   - 两个脚本都在 content script 环境中运行，都有 `chrome.storage` 访问权限

2. **状态管理** → `pet.js` 作为状态管理中心：
   - `loadPetState()`: 模块加载时从 `chrome.storage.local` 读取 `petVisible` 和 `petPosition`
   - `setupStorageSync()`: 监听 `chrome.storage.onChanged`，自动同步所有标签页
   - `savePetState()`: 显示/隐藏/拖动时保存状态到 storage

3. **窗口按钮切换** → `content.js` 中的窗口按钮点击处理器：
   - 直接读取 `chrome.storage.local.petVisible`
   - 翻转值并写回 storage
   - 不再发送消息到 background script

4. **自动同步** → `pet.js` 的 `setupStorageSync()` 监听器：
   - 监听到 `petVisible` 变化时，自动调用 `showPet()` 或 `hidePet()`
   - 监听到 `petPosition` 变化时，自动更新所有标签页的位置
   - 实现全局状态同步，无需消息传递

5. **Pet Module** → 在 content script 环境中创建 Shadow DOM，渲染宠物 UI
6. **拖动功能** → 在宠物容器上添加鼠标事件监听，拖动结束时保存位置到 storage

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

#### 前端搜索相关文件

- **`src/shared/api.js`**：
  - `generateEmbeddings()`: 调用后端生成 Embedding
  - `searchContent()`: 执行搜索查询

- **`src/screens/PersonalSpace/PersonalSpace.jsx`**：
  - `handleGenerateEmbeddings()`: 批量生成 Embedding（分批处理，避免过载）
  - `handleSearch()`: 执行搜索，自动处理 Embedding 生成
  - `handleClearSearch()`: 清空搜索，恢复原始布局
  - `calculateRadialLayout()`: 计算圆形布局位置（最相关在内环）

- **SearchBar 组件**：
  - 输入框：支持文本输入
  - Enter 键：执行搜索
  - ESC 键：清空搜索
  - 清空按钮：点击清空搜索
  - 搜索状态：显示"搜索中..."

#### 核心文件说明

- **`public/assets/background.js`**：
  - Service Worker，监听插件图标点击，注入 content script
  - 处理其他消息（如 `open-personalspace`），不再处理 `toggle-pet` 消息（v2.4）

- **`public/assets/content.js`**：
  - Content Script，创建 Shadow DOM 并渲染卡片
  - 处理 Window Button 点击，直接读写 `chrome.storage.local.petVisible`（v2.4）
  - 不再发送消息到 background script
  - 使用 IIFE 模式，避免模块冲突

- **`public/assets/pet.js`**：
  - 宠物模块，作为 content script 运行（在 `manifest.json` 中配置）
  - 独立处理桌面宠物功能，创建 Shadow DOM 渲染宠物
  - 实现状态管理：`loadPetState()`、`savePetState()`、`setupStorageSync()`
  - 监听 `chrome.storage.onChanged`，自动同步所有标签页的显示状态和位置
  - 实现拖动功能、按钮菜单交互
  - 导出 `window.__TAB_CLEANER_PET` API 对象（`show`, `hide`, `toggle`, `isVisible` 等）

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
- 后端已实现以下路由：
  - `GET /` - 健康检查
  - `POST /api/v1/tabs/opengraph` - 批量抓取多个 tabs 的 OpenGraph 数据
  - `POST /api/v1/ai/insight` - 使用通义千问分析 OpenGraph 数据并生成总结

### 后端模块说明

- **`opengraph.py`**：OpenGraph 数据抓取模块
  - `fetch_opengraph(url)`: 抓取单个 URL 的 OpenGraph 数据
  - `fetch_multiple_opengraph(urls)`: 并发抓取多个 URL 的 OpenGraph 数据
  - 支持提取 title、description、image、site_name 等字段

- **`ai_insight.py`**：AI 洞察模块
  - `analyze_opengraph_data(opengraph_items)`: 使用通义千问分析 OpenGraph 数据并生成总结
  - 调用 `dashscope.Generation.call()` API
  - 返回总结文本（不超过 150 字）

- **`ai_prompts.py`**：AI 提示词配置模块
  - `get_system_prompt()`: 获取系统提示词
  - `build_user_content_from_opengraph(opengraph_items)`: 从 OpenGraph 数据构建用户消息
  - `build_messages(opengraph_items)`: 构建完整的消息列表（system + user）
  - `is_image_focused_platform(url, site_name)`: 判断是否为图片为主的平台

- **`search.py`**：搜索功能模块
  - `process_image()`: 图片预处理（缩放、压缩、Base64编码）
  - `get_text_embedding()`: 获取文本Embedding向量
  - `get_image_embedding()`: 获取图片Embedding向量
  - `get_multimodal_embedding()`: 获取多模态（文本+图片）Embedding向量
  - `process_opengraph_for_search()`: 处理OpenGraph数据，生成Embedding（整合title和description）
  - `search_relevant_items()`: 执行相关性检索（余弦相似度）
  - `cosine_similarity()`: 计算两个向量的余弦相似度

### 环境配置

1. **配置 API Key**：
   ```bash
   cd backend/app
   cp .env.example .env
   # 编辑 .env，填入 DASHSCOPE_API_KEY
   ```

2. **安装依赖**：
   ```bash
   uv sync
   ```

3. **启动服务**：
   ```bash
   uv run uvicorn main:app --reload
   ```

## 搜索功能详解

### 搜索架构

搜索功能使用**阿里云通义千问多模态Embedding API** (`multimodal-embedding-one-peace-v1`) 实现语义搜索和相关性检索。

### 数据预处理逻辑

#### 1. OpenGraph数据整合

对于每个OpenGraph数据项，系统会：

1. **文本信息整合**：
   - 提取 `title` 和 `description` 字段
   - 如果 `title` 为空，使用 `tab_title` 作为后备
   - 将两者合并：`combined_text = f"{title} {description}"`
   - 截断至2000字符（API限制）

2. **图片处理**：
   - 下载图片（支持HTTP/HTTPS）
   - 自动缩放：最大尺寸1024px（保持宽高比），确保不超过4096x4096像素
   - 图片压缩：JPEG质量85，如果仍超过20MB则逐步降低质量
   - 转换为Base64编码（带data URI前缀）

#### 2. Embedding生成策略

系统采用**智能选择策略**，根据数据可用性选择最优的Embedding方式：

```
如果同时有文本和图片：
  └─> 使用多模态Embedding（multimodal-embedding）
      └─> 同时传入 text 和 image，类型为 "document"
      └─> 生成统一的向量，同时包含文本和图片的语义信息

如果只有图片：
  └─> 使用图片Embedding
      └─> 只传入 image，类型为 "document"

如果只有文本：
  └─> 使用文本Embedding
      └─> 只传入 text，类型为 "document"
```

**优势**：
- 多模态Embedding能同时理解文本和图片的语义，效果最好
- 单一模态时使用对应API，避免不必要的参数传递
- 所有Embedding都在同一个向量空间，支持跨模态搜索

### 搜索查询逻辑

#### 1. 查询Embedding生成

用户输入搜索查询时：

- **文本查询**：
  - 直接使用查询文本
  - 调用Embedding API，类型为 `"query"`
  
- **图片查询**（未来支持）：
  - 下载并处理图片
  - 调用图片Embedding API，类型为 `"query"`
  
- **文本+图片查询**（未来支持）：
  - 使用多模态Embedding，类型为 `"query"`

#### 2. 相关性检索

1. **余弦相似度计算**：
   ```
   similarity = dot(query_embedding, document_embedding) / (||query_embedding|| * ||document_embedding||)
   ```
   - 值域：-1 到 1
   - 越大表示越相似

2. **排序**：
   - 按相似度从高到低排序
   - 返回top_k个结果（默认20个）

3. **圆形布局**：
   - 最相关的结果排列在内环（圆心附近）
   - 相关性递减，向外扩展
   - 使用 `calculateRadialLayout()` 函数计算位置

### API端点

#### `POST /api/v1/search/embedding`

为OpenGraph数据批量生成Embedding向量。

**请求体**：
```json
{
  "opengraph_items": [
    {
      "url": "https://example.com",
      "title": "示例标题",
      "description": "示例描述",
      "image": "https://example.com/image.jpg",
      "success": true
    }
  ]
}
```

**响应**：
```json
{
  "ok": true,
  "data": [
    {
      "url": "https://example.com",
      "title": "示例标题",
      "description": "示例描述",
      "image": "https://example.com/image.jpg",
      "embedding": [0.123, -0.456, ...],  // 1024维向量
      "has_embedding": true
    }
  ]
}
```

**特点**：
- 自动分批处理（每批10个），避免过载
- 批次间延迟500ms，避免API限流（QPS=10）
- 自动处理图片归一化

#### `POST /api/v1/search/query`

执行搜索查询。

**请求体**：
```json
{
  "query_text": "绿色参考",
  "query_image_url": null,  // 可选，暂时不支持
  "opengraph_items": [
    {
      "url": "...",
      "embedding": [0.123, -0.456, ...],  // 必须包含embedding
      ...
    }
  ]
}
```

**响应**：
```json
{
  "ok": true,
  "data": [
    {
      "url": "https://example.com",
      "title": "绿色设计参考",
      "similarity": 0.95,  // 相似度分数
      ...
    }
  ]
}
```

**特点**：
- 支持文本和图片查询（图片查询待实现）
- 返回按相似度排序的结果
- 包含相似度分数，用于前端布局

### 性能优化

1. **图片归一化**：
   - 目标尺寸：1024px（最大边）
   - 自动压缩：JPEG质量85
   - 节省token和API成本

2. **批量处理**：
   - Embedding生成：每批10个
   - 批次延迟：500ms
   - 避免API限流

3. **缓存机制**：
   - 前端缓存已生成的Embedding
   - 避免重复计算

### 使用示例

1. **首次搜索**（自动生成Embedding）：
   ```
   用户输入："绿色参考"
   └─> 前端检测到没有Embedding
   └─> 调用 /api/v1/search/embedding（分批处理）
   └─> 调用 /api/v1/search/query
   └─> 显示搜索结果（圆形排列）
   ```

2. **后续搜索**（使用缓存）：
   ```
   用户输入："设计灵感"
   └─> 前端检测到已有Embedding
   └─> 直接调用 /api/v1/search/query
   └─> 显示搜索结果
   ```

### 技术细节

- **Embedding模型**：`multimodal-embedding-one-peace-v1`
- **向量维度**：1024
- **相似度算法**：余弦相似度
- **图片限制**：最大20MB，最大4096x4096像素，最小100x100像素
- **文本限制**：最大2000字符

### 前端搜索流程

```
用户输入搜索关键词
    ↓
检查是否有 Embedding 缓存
    ↓
如果没有 → 调用 /api/v1/search/embedding（分批处理，每批10个）
    ↓
等待 Embedding 生成完成
    ↓
调用 /api/v1/search/query（传入查询文本和带 Embedding 的数据）
    ↓
后端计算余弦相似度，返回排序后的结果
    ↓
前端使用 calculateRadialLayout() 计算圆形布局
    ↓
更新画布显示（最相关在内环）
```

### 完整启动示例

**终端1 - 后端**：
```bash
cd tab-cleaner-mvp/backend/app
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**终端2 - 前端**：
```bash
cd tab-cleaner-mvp/frontend
npm install
npm run dev
```

**浏览器**：
1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 加载 `frontend/public/` 目录
4. 点击扩展图标，打开个人空间
5. 点击"Clean Button"抓取标签数据
6. 在搜索栏输入关键词，按 Enter 搜索

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
  - 检查 `manifest.json` 中 `content_scripts` 是否包含 `assets/pet.js`
  - 确认 `chrome.storage.local.petVisible` 是否为 `true`（在扩展的 Storage 中查看）
  - 检查 `pet.js` 的 `loadPetState()` 是否成功读取 storage

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
  - 检查 `window.__TAB_CLEANER_PET` 对象是否存在（content script 环境）
  - 查看 `chrome.storage.local` 中的 `petVisible` 和 `petPosition` 值
  - 确认 `setupStorageSync()` 监听器是否正常工作
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

#### 桌面宠物流程（v2.4）

1. **页面加载**：
   - `manifest.json` 自动加载 `pet.js` 和 `content.js` 作为 content scripts
   - `pet.js` 执行：调用 `loadPetState()` 读取 `chrome.storage.local.petVisible`
   - 如果 `petVisible` 为 `true`，自动调用 `showPet()` 显示宠物
   - `pet.js` 调用 `setupStorageSync()` 设置 `chrome.storage.onChanged` 监听器

2. **点击窗口按钮**：
   - `content.js` 直接读取 `chrome.storage.local.petVisible`
   - 翻转值：`newVisible = !currentVisible`
   - 写回 storage：`chrome.storage.local.set({ petVisible: newVisible })`
   - **不再发送消息到 background script**

3. **状态同步**：
   - `pet.js` 的 `setupStorageSync()` 监听器监听到 `petVisible` 变化
   - 自动调用 `showPet()` 或 `hidePet()`
   - 所有标签页的 `pet.js` 都会收到 `onChanged` 事件，自动同步显示/隐藏

4. **位置同步**：
   - 用户拖动宠物到新位置
   - 拖动结束时调用 `savePetState()`，保存位置到 `chrome.storage.local.petPosition`
   - 所有标签页的 `pet.js` 监听到位置变化，自动更新位置

5. **Pet Module**：在 content script 环境中创建 Shadow DOM，渲染宠物 UI

### 资源路径获取

`pet.js` 作为 content script 运行，可以直接访问 `chrome.runtime.getURL()` API，因此资源路径获取更简单：

1. **直接访问**：使用 `chrome.runtime.getURL()` 获取扩展资源路径
2. **降级方案**：如果 `chrome.runtime` 不可用，从脚本 URL 中推断扩展 ID
3. **备用方案**：使用已知的扩展 ID（如果之前访问过）

**注意**：v2.4 之前，`pet.js` 在页面上下文中执行，需要通过 `chrome.scripting.executeScript` 注入，无法直接访问扩展 API。现在作为 content script，可以直接使用所有 Chrome Extension API。

## 开发注意事项

1. **文件路径一致性**：确保 `manifest.json`、`content.js`、`background.js` 中的路径一致
2. **资源可访问性**：所有需要从页面访问的资源必须在 `web_accessible_resources` 中声明
3. **模块类型**：
   - `content.js` 使用 IIFE 格式，作为 content script 运行
   - `pet.js` 使用 IIFE 格式，作为 content script 运行（v2.4）
   - 两个脚本都在 content script 环境中，可以直接访问 `chrome.storage` API
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

### v0.0.3
- ✅ 实现 AI 洞察功能
  - 集成通义千问（dashscope SDK）分析 OpenGraph 数据
  - 智能识别图片为主平台（Pinterest、小红书、Arena 等）
  - 生成不超过 150 字的综合总结
  - 支持环境变量配置 API Key（.env）
- ✅ 实现选中面板功能
  - 选中图片时在右侧显示操作面板
  - 显示选中数量和分组名称（可编辑）
  - 支持删除、命名分组、打开、下载链接、AI洞察等操作
- ✅ 实现 OpenGraph 数据展示
  - Clean Button 一键抓取所有打开标签的 OpenGraph 数据
  - 以放射状布局在个人空间展示 OpenGraph 图片
  - 点击图片显示完整的 OpenGraph 信息卡片
- ✅ 优化代码结构
  - 将 AI 提示词配置抽离到独立的 `ai_prompts.py` 模块
  - 改进错误处理和调试日志
  - 修复套索工具不灵敏的问题
  - 修复画笔工具崩溃问题

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
