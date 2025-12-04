# 数据同步分析报告

## 问题1：是否已停掉自动从 local storage 抓取的逻辑？

### ✅ 当前状态：已停掉

**证据：**

1. **content.js (行 578-585)**：
   ```javascript
   // ⚠️ 重要：不再在这里自动把所有浏览页面发送到后端
   // 只在以下明确的"收藏/收集"动作中才会发送到后端生成 embedding：
   // - clean / clean-all（洗衣筐清理）
   // - clean-current-tab（清理当前 tab）
   // - 拖拽图片到宠物
   // - 预览卡片保存（save-opengraph-preview）
   //
   // 这样可以避免"浏览记录"被误当成"收藏卡片"写入数据库。
   ```

2. **数据流：**
   - `recent_opengraph` 只是**缓存**，不会自动发送到数据库
   - 只有在 `clean-all` 或 `clean-current-tab` 时，才会：
     1. 收集 OpenGraph 数据
     2. 保存到 `sessions`（Personal Space）
     3. 异步发送到后端生成 embedding 并存储到数据库

### ⚠️ 潜在问题

**PersonalSpace.jsx (行 356-402)**：
- 如果 `sessions` 为空，会从 `recent_opengraph` 创建 session
- 但这**不会**自动触发 embedding 生成和数据库存储
- 只是用于**显示**，不会同步到数据库

**结论：** ✅ 已停掉自动抓取，但需要确保只有 Personal Space 中的内容才存储到数据库。

---

## 问题2：如何同步 Personal Space 和数据库？

### 当前机制

1. **存储到数据库的时机：**
   - `clean-all` 或 `clean-current-tab` 时
   - 异步调用 `/api/v1/search/embedding`
   - 后端存储到数据库

2. **搜索机制：**
   - 前端已实现过滤：只搜索 Personal Space 中的内容
   - 但数据库可能包含不在 Personal Space 中的旧数据

### ⚠️ 问题

1. **数据库可能包含旧数据：**
   - 之前可能有自动抓取的逻辑
   - 数据库中可能有不在当前 `sessions` 中的记录

2. **同步机制不完善：**
   - 没有定期清理数据库中的"孤立"数据
   - 没有确保数据库和 Personal Space 完全同步

---

## 建议的修复方案

### 1. 确保只有 Personal Space 中的内容才存储到数据库

**修改点：** `background.js` 中的 `clean-all` 和 `clean-current-tab`

**当前逻辑：**
- 收集 OpenGraph → 保存到 session → 异步发送到后端

**建议：**
- ✅ 已正确：只有保存到 session 的内容才会发送到后端

### 2. 确保搜索只搜索 Personal Space 中的内容

**当前实现：**
- ✅ 前端已实现过滤（`filterResultsBySessions`）
- ✅ 在 `handleSearch` 和 `SearchOverlay` 中都应用了过滤

**建议：**
- ✅ 已正确：前端过滤确保只显示 Personal Space 中的内容

### 3. 清理数据库中的孤立数据（可选）

**建议添加：**
- 定期清理数据库中不在任何 session 中的记录
- 或者在搜索时，后端也进行过滤（双重保险）

---

## 总结

### ✅ 已解决的问题

1. **自动抓取已停掉：** `content.js` 中已明确注释，不会自动发送到后端
2. **前端过滤已实现：** 搜索时只显示 Personal Space 中的内容

### ⚠️ 需要确认的问题

1. **数据库中的旧数据：** 可能包含之前自动抓取的记录
2. **同步机制：** 需要确保数据库和 Personal Space 完全同步

### 🔧 建议的改进

1. **后端也进行过滤：** 在搜索时，后端也检查 URL 是否在用户的 sessions 中
2. **清理孤立数据：** 定期清理数据库中不在任何 session 中的记录
3. **添加同步检查：** 在存储到数据库前，确认数据已在 Personal Space 中

