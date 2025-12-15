# 检查用户ID和数据添加指南

## 🔍 方法1：在浏览器控制台检查（最简单）

### 步骤1：打开扩展页面

1. 打开 `chrome://extensions/`
2. 找到 "Tab Cleaner MVP" 扩展
3. 点击"检查视图" → "Service Worker"（或"背景页"）

### 步骤2：在控制台运行检查代码

```javascript
// 1. 检查当前存储的用户ID
chrome.storage.local.get(['user_id', 'device_id'], (result) => {
  console.log('=== 当前用户ID信息 ===');
  console.log('User ID:', result.user_id);
  console.log('Device ID:', result.device_id);
  console.log('====================');
});

// 2. 检查所有存储的数据
chrome.storage.local.get(null, (items) => {
  console.log('=== 所有存储数据 ===');
  console.log(items);
  console.log('===================');
});
```

### 步骤3：检查前端API调用

在扩展的 Service Worker 控制台中，查看网络请求：

1. 打开 Service Worker 控制台
2. 执行一个操作（如清理tab）
3. 查看控制台日志，应该看到：
   ```
   [Background] 📤 Sending OG data to backend for embedding:
     userId: device_1764658383255_28u4om0xg  // ✅ 应该显示用户ID
   ```

---

## 🔍 方法2：在个人空间页面检查

### 步骤1：打开个人空间

1. 点击扩展图标，打开个人空间页面
2. 按 `F12` 打开开发者工具

### 步骤2：在控制台运行

```javascript
// 检查用户ID
(async () => {
  const { getOrCreateUserId } = await import(chrome.runtime.getURL('src/utils/userId.js'));
  const userId = await getOrCreateUserId();
  console.log('当前用户ID:', userId);
  
  // 检查存储
  const stored = await chrome.storage.local.get(['user_id', 'device_id']);
  console.log('存储的用户ID:', stored.user_id);
  console.log('存储的设备ID:', stored.device_id);
})();
```

---

## 🔍 方法3：检查网络请求（最准确）

### 步骤1：打开开发者工具

1. 打开个人空间页面
2. 按 `F12` 打开开发者工具
3. 切换到 **Network** 标签

### 步骤2：执行操作并检查请求

1. 执行一个会发送数据到后端的操作（如清理tab、搜索等）
2. 在 Network 标签中找到请求：
   - `/api/v1/search/embedding` - 添加数据时
   - `/api/v1/search/query` - 搜索时

### 步骤3：检查请求头

点击请求，查看 **Headers** → **Request Headers**，应该看到：
```
X-User-ID: device_1764658383255_28u4om0xg
```

如果没有 `X-User-ID` header，说明没有正确发送用户ID。

---

## 🔍 方法4：检查后端日志

### 在 Railway 日志中检查

1. 登录 Railway Dashboard
2. 进入项目 → **Logs** → **Deploy Logs**
3. 执行一个操作（如清理tab）
4. 查看日志，应该看到：
   ```
   [API] 📥 Received request with X items for embedding generation
   [API] User ID: device_1764658383255_28u4om0xg  // ✅ 应该显示用户ID
   ```

---

## 🛠️ 快速检查脚本

### 在浏览器控制台运行（一键检查）

```javascript
// 一键检查用户ID和数据添加
(async () => {
  console.log('=== 用户ID检查 ===');
  
  // 1. 检查存储的用户ID
  const stored = await chrome.storage.local.get(['user_id', 'device_id']);
  console.log('1. 存储的用户ID:', stored.user_id || '未设置');
  console.log('2. 存储的设备ID:', stored.device_id || '未设置');
  
  // 2. 尝试获取用户ID（模拟前端逻辑）
  try {
    // 检查是否有 user_id
    if (stored.user_id) {
      console.log('✅ 用户ID已存在:', stored.user_id);
    } else {
      console.log('⚠️  用户ID不存在，将生成新的');
      
      // 尝试获取 Google 账户
      try {
        const profile = await chrome.identity.getProfileUserInfo();
        if (profile.email) {
          console.log('✅ 检测到 Google 账户:', profile.email);
          console.log('   将生成基于邮箱的用户ID');
        } else {
          console.log('⚠️  未检测到 Google 账户邮箱');
        }
      } catch (e) {
        console.log('⚠️  无法获取 Google 账户信息');
      }
    }
    
    // 3. 检查最近的数据添加
    console.log('\n=== 数据添加检查 ===');
    console.log('提示：执行一个操作（如清理tab），然后检查 Network 标签');
    console.log('   查找 /api/v1/search/embedding 请求');
    console.log('   检查 Request Headers 中是否有 X-User-ID');
    
  } catch (error) {
    console.error('检查失败:', error);
  }
})();
```

---

## ✅ 验证数据添加时用户ID是否正确

### 测试步骤

1. **打开开发者工具** → Network 标签
2. **执行操作**：清理一个tab或添加数据
3. **检查请求**：
   - 找到 `/api/v1/search/embedding` 请求
   - 点击查看详情
   - 检查 **Request Headers**：
     ```
     X-User-ID: device_1764658383255_28u4om0xg  ✅ 应该存在
     ```
   - 如果没有，说明修复没有生效

### 预期结果

✅ **正确的请求头**：
```
POST /api/v1/search/embedding HTTP/1.1
Host: tab-cleaner-mvp-app-production.up.railway.app
Content-Type: application/json
X-User-ID: device_1764658383255_28u4om0xg  ✅
```

❌ **错误的请求头**（缺少用户ID）：
```
POST /api/v1/search/embedding HTTP/1.1
Host: tab-cleaner-mvp-app-production.up.railway.app
Content-Type: application/json
（没有 X-User-ID）❌
```

---

## 🔧 如果用户ID没有正确发送

### 检查清单

1. **确认 background.js 已更新**：
   - 检查 `frontend/public/assets/background.js` 中是否有 `getUserId()` 函数
   - 检查所有 `fetch` 调用是否包含 `'X-User-ID': userId`

2. **重新构建前端**：
   ```bash
   cd frontend
   npm run build
   ```

3. **重新加载扩展**：
   - 打开 `chrome://extensions/`
   - 点击扩展的"重新加载"按钮

4. **清除缓存**（可选）：
   ```javascript
   // 在控制台运行
   chrome.storage.local.clear(() => {
     console.log('Storage cleared');
   });
   ```
   然后重新打开扩展，会生成新的用户ID

---

## 📋 完整检查流程

### 1. 检查当前用户ID

```javascript
chrome.storage.local.get(['user_id'], (result) => {
  console.log('当前用户ID:', result.user_id);
});
```

### 2. 检查数据添加请求

1. 打开 Network 标签
2. 执行操作（清理tab）
3. 检查 `/api/v1/search/embedding` 请求的 Headers

### 3. 检查后端接收

查看 Railway 日志，应该看到：
```
[API] User ID: device_1764658383255_28u4om0xg
```

### 4. 验证数据存储

运行诊断脚本：
```bash
python diagnose_search_issue.py --user-id device_1764658383255_28u4om0xg
```

应该看到该用户ID下有数据。

---

**最后更新**: 2025-12-03








