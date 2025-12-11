# Tab Cleaner 图片捕捉方式完整列表

## 📸 图片捕捉方式总览

插件目前支持 **8 种**图片捕捉方式，分为两大类：

### 🎯 手动捕捉（用户主动操作）
1. **拖拽图片到桌宠**
2. **悬停点击按钮**
3. **右键菜单**
4. **快捷键保存**
5. **截图模式（Alt+拖拽）**

### 🤖 自动捕捉（批量/后台）
6. **自动 OpenGraph 抓取**
7. **批量收集（清理标签页时）**
8. **标签页截图兜底**

---

## 1️⃣ 拖拽图片到桌宠 🖱️

**触发方式**：用户拖拽网页中的图片到右下角桌宠

**实现路径**：
```
用户操作: 拖拽图片
  ↓
image_capture_enhanced.js
  - initDragAndDrop()
  - dragstart 事件监听
  - dragover 事件监听（轨迹绘制、磁吸效果）
  - dragend 事件监听
  - playFlyInAnimation() // 飞入动画
  - captureImage()
  ↓
background.js
  - handleSaveCapturedImage()
  - save-captured-image 消息处理
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/image_capture_enhanced.js` (行 413-535)

**特点**：
- ✅ 支持拖拽轨迹（蓝色线条）
- ✅ 磁吸效果（接近桌宠时自动放大）
- ✅ 飞入动画（卡片飞向桌宠）
- ✅ 桌宠数字跳动反馈

---

## 2️⃣ 悬停点击按钮 ➕

**触发方式**：鼠标悬停在图片上，点击出现的"+"按钮

**实现路径**：
```
用户操作: 鼠标悬停图片
  ↓
image_capture_enhanced.js
  - initImageMarkers()
  - mouseover 事件监听
  - createMarkerIcon() // 创建"+"按钮
  - 点击事件监听
  - captureImage()
  ↓
background.js
  - handleSaveCapturedImage()
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/image_capture_enhanced.js` (行 537-750)

**特点**：
- ✅ 80ms 快速响应
- ✅ 按钮发光效果（悬停时）
- ✅ 只显示"+"号（无文字）
- ✅ 自动跟随图片位置

---

## 3️⃣ 右键菜单 📋

**触发方式**：右键点击图片，选择"收藏到 Tab Cleaner"

**实现路径**：
```
用户操作: 右键点击图片
  ↓
background.js
  - createContextMenus() // 创建右键菜单
  - chrome.contextMenus.onClicked
  - handleSaveImageFromContextMenu()
  ↓
content.js / image_capture_enhanced.js
  - save-image-from-context-menu 消息处理
  - captureImage()
  ↓
background.js
  - handleSaveCapturedImage()
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/background.js` (行 57-88, 93-133)
- `frontend/public/assets/image_capture_enhanced.js` (行 580-620)

**特点**：
- ✅ 系统原生右键菜单
- ✅ 支持所有图片（包括背景图、CSS 图等）

---

## 4️⃣ 快捷键保存 ⌨️

**触发方式**：悬停在图片上，按 `⌘/Ctrl + Shift + S`

**实现路径**：
```
用户操作: 悬停图片 + 快捷键
  ↓
image_capture_enhanced.js
  - initKeyboardShortcuts()
  - keydown 事件监听
  - 检测快捷键组合
  - captureImage()
  ↓
background.js
  - handleSaveCapturedImage()
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/image_capture_enhanced.js` (行 790-811)

**特点**：
- ✅ 跨平台支持（Mac: ⌘, Windows: Ctrl）
- ✅ 按 `?` 显示快捷键帮助

---

## 5️⃣ 截图模式（Alt+拖拽）📷

**触发方式**：按住 `Alt` 键，拖拽选择区域截图

**实现路径**：
```
用户操作: Alt + 拖拽选择区域
  ↓
screenshot_capture.js
  - keydown 事件监听（Alt 键）
  - mousedown/mousemove/mouseup 事件
  - 绘制选择框
  - chrome.tabs.captureVisibleTab()
  - Canvas API 裁剪
  - save-captured-image 消息
  ↓
background.js
  - handleSaveCapturedImage()
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/screenshot_capture.js`

**特点**：
- ✅ 支持 Canvas/Video 截图
- ✅ 应对特殊渲染场景（Figma、Canva）
- ✅ 框选区域截图

---

## 6️⃣ 自动 OpenGraph 抓取 🤖

**触发方式**：页面加载时自动运行（content script）

**实现路径**：
```
页面加载
  ↓
manifest.json
  - content_scripts: opengraph_local_v2.js
  ↓
opengraph_local_v2.js
  - 自动提取 OpenGraph 数据
  - 智能首图检测（多维度评分）
  - 支持 SPA 路由变化监听
  - 缓存机制
  ↓
等待用户触发"清理标签页"时使用
```

**文件位置**：
- `frontend/public/assets/opengraph_local_v2.js`
- `frontend/public/manifest.json` (行 29)

**特点**：
- ✅ 自动运行，无需用户操作
- ✅ 智能首图检测（位置、尺寸、宽高比、上下文）
- ✅ 支持 SPA（小红书、Pinterest 等）
- ✅ 网站特定规则优化

---

## 7️⃣ 批量收集（清理标签页时）🗂️

**触发方式**：用户点击"清理当前标签页"或"清理所有标签页"

**实现路径**：
```
用户操作: 点击清理按钮
  ↓
background.js
  - handleCleanCurrentTab() / handleCleanAllTabs()
  - collectTabWithGuaranteedImage() // 三层保险策略
    ├─ 步骤1: 注入 opengraph_local.js
    ├─ 步骤2: 发送 extract-opengraph-with-wait 消息
    ├─ 步骤3: 等待 OG 数据（最多 8 秒）
    └─ 步骤4: 如果无图，使用截图兜底
  ↓
opengraph_local.js / opengraph_local_v2.js
  - 提取 OpenGraph 数据
  ↓
background.js
  - 批量保存到 session
  - 异步生成 embedding
  ↓
后端 API: /api/v1/opengraph/embed
```

**文件位置**：
- `frontend/public/assets/background.js` (行 405-550, 750-900)

**特点**：
- ✅ 三层保险策略（OG → 等待 → 截图）
- ✅ 批量处理多个标签页
- ✅ 自动生成 embedding

---

## 8️⃣ 标签页截图兜底 📸

**触发方式**：当 OpenGraph 抓取失败时自动触发

**实现路径**：
```
OpenGraph 抓取失败
  ↓
background.js
  - captureTabScreenshot(tabId)
  - chrome.tabs.update() // 切换到目标标签页
  - chrome.tabs.captureVisibleTab() // 截图可见区域
  - 返回 base64 图片数据
  ↓
合并到 OpenGraph 数据
  - is_screenshot: true
  ↓
保存到 session
```

**文件位置**：
- `frontend/public/assets/background.js` (行 29-55)

**特点**：
- ✅ 100% 保证有图片
- ✅ 只截图可见区域（首屏）
- ✅ 适用于文档类网站（Notion、飞书等）

---

## 📊 数据流向图

```
┌─────────────────────────────────────────────────────────┐
│                   用户操作 / 自动触发                      │
└─────────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────┴───────────────┐
        │                               │
   手动捕捉                         自动捕捉
        │                               │
  ┌─────┴─────┐              ┌─────────┴─────────┐
  │           │              │                   │
拖拽/悬停/右键          OpenGraph 抓取      批量收集
  │           │              │                   │
  └─────┬─────┘              └─────────┬─────────┘
        │                               │
        └───────────────┬───────────────┘
                        ↓
            ┌───────────────────────┐
            │   background.js        │
            │  handleSaveCapturedImage│
            └───────────┬─────────────┘
                        ↓
            ┌───────────────────────┐
            │   Chrome Storage      │
            │   (本地缓存)           │
            └───────────┬─────────────┘
                        ↓
            ┌───────────────────────┐
            │   后端 API             │
            │ /api/v1/opengraph/embed│
            └───────────┬─────────────┘
                        ↓
            ┌───────────────────────┐
            │   生成 Embedding      │
            │   保存到数据库        │
            └───────────────────────┘
```

---

## 🔧 配置文件

**manifest.json** 中的 content scripts 加载顺序：
```json
"content_scripts": [
  {
    "js": [
      "assets/opengraph_local_v2.js",      // 1. OpenGraph 自动抓取
      "assets/image_capture_enhanced.js",   // 2. 拖拽/悬停/右键
      "assets/screenshot_capture.js",      // 3. 截图模式
      "assets/pet.js",                      // 4. 桌宠
      "assets/content.js"                   // 5. 内容脚本
    ]
  }
]
```

---

## 📝 总结

| 方式 | 触发 | 文件 | 特点 |
|------|------|------|------|
| 1. 拖拽 | 用户拖拽 | `image_capture_enhanced.js` | 有动画、轨迹、磁吸 |
| 2. 悬停按钮 | 鼠标悬停 | `image_capture_enhanced.js` | 快速响应、发光效果 |
| 3. 右键菜单 | 右键点击 | `background.js` | 系统原生菜单 |
| 4. 快捷键 | 键盘快捷键 | `image_capture_enhanced.js` | 跨平台支持 |
| 5. 截图模式 | Alt+拖拽 | `screenshot_capture.js` | Canvas/Video 支持 |
| 6. OG 自动抓取 | 页面加载 | `opengraph_local_v2.js` | 自动运行、智能检测 |
| 7. 批量收集 | 清理标签页 | `background.js` | 批量处理、三层保险 |
| 8. 截图兜底 | OG 失败时 | `background.js` | 100% 保证有图 |

---

**最后更新**：2024-12-19





