# 前后端职责划分

## 🎨 个人空间画布功能

### ✅ 前端负责（React 组件）

**画布交互和渲染**：
- ✅ 画布布局和渲染
- ✅ 卡片拖拽（drag & drop）
- ✅ 卡片选择（点击、套索选择）
- ✅ 卡片移动和定位
- ✅ 视图缩放和平移
- ✅ 工具使用（画笔、文本标注）
- ✅ 前端聚类算法（简单的距离/相似度聚类）
- ✅ 搜索和过滤（前端过滤）
- ✅ 标签管理（添加、删除标签）

**UI 交互**：
- ✅ 侧边栏展开/收起
- ✅ 工具栏按钮交互
- ✅ 搜索框交互
- ✅ 视图切换（网格/列表等）

**数据状态管理**：
- ✅ 画布上卡片的位置（x, y 坐标）
- ✅ 选中状态
- ✅ 临时编辑状态
- ✅ 视图状态（缩放、平移）

### ✅ 后端负责（API）

**数据存储和获取**：
- ✅ 保存标签页数据（通过 Clean Button）
- ✅ 获取用户的标签页列表
- ✅ 保存画布布局（卡片位置）
- ✅ 保存标签和分组信息

**数据处理**：
- ✅ 获取 OpenGraph（避免 CORS）
- ✅ 复杂的 AI 聚类（如果调用 LLM 或 ML 模型）
- ✅ 搜索索引（如果数据量大）

## 📊 数据流

### 数据获取流程

```
个人空间页面加载
    ↓
前端：GET /api/v1/tabs?user_id=xxx
    ↓
后端：返回标签页列表
    ↓
前端：React 组件渲染卡片到画布
    ↓
前端：用户可以拖拽、选择、聚类等操作
```

### 数据保存流程

```
用户拖拽卡片到新位置
    ↓
前端：更新本地状态（React state）
    ↓
用户点击保存（或自动保存）
    ↓
前端：POST /api/v1/tabs/positions { tabs: [{ id, x, y }, ...] }
    ↓
后端：保存位置到数据库
```

### Clean Button 流程

```
用户点击 Clean Button
    ↓
background.js：获取所有 tab
    ↓
background.js：调用后端获取 OpenGraph
    ↓
后端：POST /api/v1/tabs/opengraph { url }
    ↓
background.js：批量保存到后端
    ↓
后端：POST /api/v1/tabs/batch { tabs: [...] }
    ↓
后端：保存到数据库
    ↓
个人空间：下次加载时显示这些卡片
```

## 🔍 具体功能划分

### 画布渲染（前端）

```javascript
// src/screens/PersonalSpace/PersonalSpace.jsx
const [tabs, setTabs] = useState([]);  // 从后端获取
const [selectedIds, setSelectedIds] = useState([]);  // 前端状态
const [canvasState, setCanvasState] = useState({ zoom: 1, pan: { x: 0, y: 0 } });  // 前端状态

// 渲染卡片
tabs.map(tab => (
  <TabCard 
    key={tab.id}
    x={tab.x}  // 位置从后端获取，但拖拽时前端更新
    y={tab.y}
    onDrag={handleDrag}  // 前端处理
    onSelect={handleSelect}  // 前端处理
  />
))
```

### 拖拽功能（前端）

```javascript
// 完全在前端实现
const handleDrag = (tabId, newX, newY) => {
  // 更新本地状态
  setTabs(prev => prev.map(t => 
    t.id === tabId ? { ...t, x: newX, y: newY } : t
  ));
  
  // 可选：自动保存到后端（防抖）
  debouncedSave(tabId, newX, newY);
};
```

### 聚类功能

**简单聚类（前端）**：
- 基于卡片位置的距离聚类
- 基于标签的聚类
- 基于相似度（URL 域名、标题关键词等）

**复杂 AI 聚类（后端）**：
- 调用 LLM API（如 OpenAI、Claude）
- 语义分析
- 图片内容识别

```javascript
// 前端：简单聚类
const clusterByDistance = (tabs, threshold = 100) => {
  // 基于 x, y 坐标的距离聚类
  // 完全在前端实现
};

// 后端：复杂 AI 聚类
POST /api/v1/tabs/cluster { tab_ids: [...] }
→ 调用 LLM API
→ 返回聚类结果
```

### 搜索功能

**前端搜索**（适合小数据量）：
- 在已加载的标签页列表中过滤
- 实时搜索，无需请求后端

**后端搜索**（适合大数据量）：
- 全文搜索索引
- 复杂的搜索逻辑

## 🎯 总结

### 画布功能 = 前端为主

**画布的所有交互功能都应该写在前端**：
- ✅ 拖拽、选择、移动 → 前端
- ✅ 工具使用（套索、画笔、文本）→ 前端
- ✅ 视图控制（缩放、平移）→ 前端
- ✅ 简单聚类 → 前端
- ✅ 搜索和过滤 → 前端（如果数据量小）

**后端只负责**：
- ✅ 数据存储（保存标签页、位置）
- ✅ 数据获取（加载标签页列表）
- ✅ 复杂处理（OpenGraph、AI 聚类）

### 数据同步策略

**实时更新**：
- 拖拽时：前端立即更新 UI，后台异步保存位置

**批量保存**：
- 每隔几秒或用户停止操作后保存位置
- 使用防抖（debounce）避免频繁请求

**离线支持**（可选）：
- 前端缓存数据到 localStorage
- 离线时继续工作，上线后同步

## 📝 实现建议

### 阶段 1：基础功能
1. 前端：从后端获取标签页列表并渲染
2. 前端：实现拖拽功能
3. 后端：保存位置 API

### 阶段 2：交互功能
1. 前端：实现选择、套索选择
2. 前端：实现简单聚类（距离聚类）
3. 前端：实现搜索和过滤

### 阶段 3：高级功能
1. 后端：实现 AI 聚类 API（可选）
2. 前端：调用 AI 聚类并更新布局
3. 前端：实现更多工具（画笔、文本标注）





