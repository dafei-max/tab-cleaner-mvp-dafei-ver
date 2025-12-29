# 用户ID持久化说明

## ✅ 用户ID不会因为刷新扩展而改变

### 持久化机制

用户ID存储在 **Chrome Storage Local** 中，这是持久化存储，具有以下特性：

1. **持久化存储**：
   - 数据存储在本地磁盘上
   - 即使关闭浏览器、重启电脑，数据也不会丢失
   - **刷新扩展不会清除数据**

2. **存储位置**：
   - `chrome.storage.local['user_id']` - 用户ID
   - `chrome.storage.local['device_id']` - 设备ID（用于生成设备ID）

### 用户ID获取流程

```javascript
getOrCreateUserId() {
  1. 首先尝试从 chrome.storage.local 读取 'user_id'
     ├─ 如果存在 → 直接返回（不会重新生成）✅
     └─ 如果不存在 → 继续下一步
  
  2. 尝试获取 Google 账户邮箱
     ├─ 成功 → 哈希邮箱 → 保存到 storage → 返回
     └─ 失败 → 继续下一步
  
  3. 生成设备ID
     ├─ 先检查 storage 中是否有 'device_id'
     │  ├─ 如果有 → 使用已有的 device_id ✅
     │  └─ 如果没有 → 生成新的并保存
     └─ 返回 device_xxx
}
```

### 关键点

✅ **用户ID不会变**，因为：
- 代码**优先从 storage 读取**已保存的用户ID
- 只有在 storage 中没有用户ID时，才会生成新的
- Chrome Storage 在扩展刷新时**不会被清除**

## 🔍 验证方法

### 方法1：在浏览器控制台检查

```javascript
// 检查当前用户ID
chrome.storage.local.get(['user_id', 'device_id'], (result) => {
  console.log('User ID:', result.user_id);
  console.log('Device ID:', result.device_id);
});
```

### 方法2：刷新扩展后检查

1. 记录当前的用户ID
2. 刷新扩展（`chrome://extensions/` → 点击"重新加载"）
3. 再次检查用户ID，应该**完全相同**

## ⚠️ 什么情况下用户ID会改变？

### 会改变的情况

1. **清除浏览器数据**：
   - 清除扩展数据
   - 清除所有浏览数据（如果选择了扩展数据）

2. **手动删除**：
   ```javascript
   chrome.storage.local.remove(['user_id', 'device_id']);
   ```

3. **首次使用**：
   - 第一次安装扩展时，会生成新的用户ID

4. **切换Google账户**：
   - 如果之前使用设备ID，后来登录Google账户
   - 会从 `device_xxx` 切换到 `user_xxx`（基于邮箱哈希）

### 不会改变的情况

✅ **刷新扩展** - 不会改变
✅ **关闭浏览器** - 不会改变
✅ **重启电脑** - 不会改变
✅ **更新扩展** - 不会改变（除非清除数据）

## 🐛 如果用户ID意外改变

### 可能的原因

1. **Storage 被清除**：
   - 用户手动清除了扩展数据
   - 浏览器自动清理（存储空间不足）

2. **代码逻辑问题**：
   - 某个地方错误地删除了 `user_id`
   - Storage API 调用失败

### 解决方案

1. **检查 Storage**：
   ```javascript
   chrome.storage.local.get(null, (items) => {
     console.log('All storage:', items);
   });
   ```

2. **恢复用户ID**（如果知道之前的ID）：
   ```javascript
   chrome.storage.local.set({ 
     user_id: 'device_1764658383255_28u4om0xg' 
   });
   ```

3. **数据迁移**：
   - 如果数据在 `anonymous` 下，使用迁移脚本迁移到正确的用户ID

## 📋 代码逻辑保证

### 代码中的保护机制

```javascript
// ✅ 优先读取已保存的用户ID
const stored = await chrome.storage.local.get(['user_id']);
if (stored.user_id) {
  return stored.user_id;  // 直接返回，不重新生成
}

// ✅ 设备ID也优先使用已保存的
const stored = await chrome.storage.local.get(['device_id']);
if (stored.device_id) {
  return `device_${stored.device_id}`;  // 使用已有的
}
```

**结论**：只要 Chrome Storage 中有用户ID，就不会重新生成。

## 🎯 总结

| 操作 | 用户ID是否改变 |
|------|--------------|
| 刷新扩展 | ❌ **不会** |
| 关闭浏览器 | ❌ **不会** |
| 重启电脑 | ❌ **不会** |
| 更新扩展 | ❌ **不会** |
| 清除扩展数据 | ✅ **会** |
| 首次安装 | ✅ **会**（生成新的） |
| 切换Google账户 | ⚠️ **可能**（从 device 切换到 user） |

---

**最后更新**: 2025-12-03











