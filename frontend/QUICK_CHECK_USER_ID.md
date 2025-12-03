# 快速检查用户ID和数据添加

## 🚀 最快的方法（3步）

### 步骤1：打开扩展的 Service Worker 控制台

1. 打开 `chrome://extensions/`
2. 找到 "Tab Cleaner MVP" 扩展
3. 点击"检查视图" → **"Service Worker"**

### 步骤2：在控制台运行检查代码

**复制以下代码到控制台并运行**：

```javascript
// 一键检查用户ID
(async () => {
  const stored = await chrome.storage.local.get(['user_id', 'device_id']);
  console.log('=== 当前用户ID ===');
  console.log('User ID:', stored.user_id || '❌ 未设置');
  console.log('Device ID:', stored.device_id || '❌ 未设置');
  console.log('==================');
  
  if (!stored.user_id) {
    console.warn('⚠️  用户ID未设置！数据会被存储到 anonymous');
  } else {
    console.log('✅ 用户ID已设置:', stored.user_id);
  }
})();
```

### 步骤3：检查数据添加时的请求

1. **打开个人空间页面**
2. **按 F12** 打开开发者工具
3. **切换到 Network 标签**
4. **执行一个操作**（如清理tab、搜索等）
5. **查找请求**：
   - `/api/v1/search/embedding` - 添加数据时
   - `/api/v1/search/query` - 搜索时
6. **点击请求** → 查看 **Headers** → **Request Headers**
7. **检查是否有**：
   ```
   X-User-ID: device_1764658383255_28u4om0xg
   ```

---

## ✅ 预期结果

### 正确的请求头

```
POST /api/v1/search/embedding HTTP/1.1
Host: tab-cleaner-mvp-app-production.up.railway.app
Content-Type: application/json
X-User-ID: device_1764658383255_28u4om0xg  ✅ 必须有这一行
```

### 后端日志（Railway）

```
[API] 👤 User ID from header: 'device_1764658383255_28u4om0xg' → normalized: 'device_1764658383255_28u4om0xg'
```

---

## ❌ 如果请求头中没有 X-User-ID

### 问题诊断

1. **检查 background.js 是否已更新**：
   - 确认 `frontend/public/assets/background.js` 中有 `getUserId()` 函数
   - 确认所有 `fetch` 调用都包含 `'X-User-ID': userId`

2. **重新构建和加载**：
   ```bash
   cd frontend
   npm run build
   ```
   然后重新加载扩展

3. **检查控制台日志**：
   - 在 Service Worker 控制台查看是否有错误
   - 应该看到：`[Background] 📤 Sending OG data to backend for embedding: userId: ...`

---

## 🔧 手动设置用户ID（如果需要）

如果用户ID丢失或需要恢复：

```javascript
// 在 Service Worker 控制台运行
chrome.storage.local.set({ 
  user_id: 'device_1764658383255_28u4om0xg' 
}, () => {
  console.log('✅ 用户ID已设置');
});
```

---

## 📋 完整检查清单

- [ ] 1. 检查存储的用户ID（Service Worker 控制台）
- [ ] 2. 检查数据添加请求的 Headers（Network 标签）
- [ ] 3. 检查后端日志（Railway Logs）
- [ ] 4. 运行诊断脚本验证数据

---

**提示**：如果请求头中没有 `X-User-ID`，说明修复没有生效，需要重新构建前端并重新加载扩展。

