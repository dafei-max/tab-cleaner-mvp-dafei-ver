# 测试检查清单

## ✅ 不需要 Build

Chrome 扩展**不需要 build**，可以直接加载测试：

1. 打开 Chrome → `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `frontend/public` 目录
5. 扩展会自动加载

## 🔍 逻辑检查结果

### ✅ 已修复的问题

1. **`save-captured-image` 消息处理** ✅
   - **问题**：`image_capture_enhanced.js` 和 `screenshot_capture.js` 发送了 `save-captured-image` 消息，但 `background.js` 没有处理
   - **修复**：添加了 `handleSaveCapturedImage()` 函数，完整处理保存逻辑

2. **右键菜单流程** ✅
   - **流程**：右键菜单 → background.js → content.js → image_capture_enhanced.js
   - **状态**：逻辑完整，消息传递正确

3. **拖拽保存流程** ✅
   - **流程**：拖拽图片 → image_capture_enhanced.js → background.js → 保存到 session
   - **状态**：逻辑完整

### ✅ 消息流程验证

#### 1. 拖拽图片到桌宠
```
用户拖拽图片
  ↓
image_capture_enhanced.js: captureImage()
  ↓
chrome.runtime.sendMessage({ action: 'save-captured-image', data: ogData })
  ↓
background.js: handleSaveCapturedImage()
  ↓
保存到 session + 异步生成 embedding
  ✅
```

#### 2. 悬停点击保存
```
用户点击悬停标记
  ↓
image_capture_enhanced.js: captureImage()
  ↓
chrome.runtime.sendMessage({ action: 'save-captured-image', data: ogData })
  ↓
background.js: handleSaveCapturedImage()
  ↓
保存到 session + 异步生成 embedding
  ✅
```

#### 3. 右键菜单保存
```
用户右键图片
  ↓
Chrome 右键菜单: "收藏到 Tab Cleaner"
  ↓
background.js: chrome.contextMenus.onClicked
  ↓
background.js: handleSaveImageFromContextMenu()
  ↓
chrome.tabs.sendMessage({ action: 'save-image-from-context-menu' })
  ↓
content.js: 转发消息
  ↓
image_capture_enhanced.js: captureImage()
  ↓
chrome.runtime.sendMessage({ action: 'save-captured-image' })
  ↓
background.js: handleSaveCapturedImage()
  ✅
```

#### 4. 截图模式保存
```
用户 Alt + 拖拽选择区域
  ↓
screenshot_capture.js: captureSelection()
  ↓
chrome.runtime.sendMessage({ action: 'capture-screenshot-selection' })
  ↓
background.js: handleScreenshotSelection()
  ↓
返回截图数据
  ↓
screenshot_capture.js: saveScreenshot()
  ↓
chrome.runtime.sendMessage({ action: 'save-captured-image' })
  ↓
background.js: handleSaveCapturedImage()
  ✅
```

## 🧪 测试步骤

### 1. 基础功能测试

#### 测试拖拽保存
- [ ] 打开任意网页（如花瓣网）
- [ ] 拖拽一张图片到桌宠区域
- [ ] 检查桌宠是否高亮
- [ ] 松开鼠标
- [ ] 检查是否显示"✓ 图片已保存到 Tab Cleaner"提示
- [ ] 打开个人空间，检查图片是否已保存

#### 测试悬停标记
- [ ] 打开任意网页
- [ ] 鼠标移到图片上
- [ ] 检查右上角是否出现"保存"按钮
- [ ] 点击"保存"按钮
- [ ] 检查是否显示成功提示
- [ ] 打开个人空间，检查图片是否已保存

#### 测试右键菜单
- [ ] 打开任意网页
- [ ] 右键点击图片
- [ ] 检查是否出现"收藏到 Tab Cleaner"选项
- [ ] 点击选项
- [ ] 检查是否显示通知"图片已保存"
- [ ] 打开个人空间，检查图片是否已保存

### 2. 截图模式测试

#### 测试框选截图
- [ ] 打开 Figma 或 Canva（或任意有 Canvas 的页面）
- [ ] 按 `Alt` 键
- [ ] 拖拽选择区域
- [ ] 检查是否显示选择框
- [ ] 松开鼠标
- [ ] 检查是否显示"截图已保存"提示
- [ ] 打开个人空间，检查截图是否已保存

### 3. 智能首图测试

#### 测试花瓣网
- [ ] 打开花瓣网
- [ ] 点击"一键清理"
- [ ] 检查是否选择了正确的首图（不是 Logo 或小图标）

#### 测试小红书
- [ ] 打开小红书
- [ ] 点击一个卡片进入详情
- [ ] 检查 URL 变化后图片是否更新
- [ ] 点击"一键清理"
- [ ] 检查是否选择了当前卡片的图片

### 4. 错误处理测试

#### 测试无图片页面
- [ ] 打开纯文本页面
- [ ] 尝试拖拽（应该没有反应）
- [ ] 检查控制台是否有错误

#### 测试特殊页面
- [ ] 打开 `chrome://` 页面
- [ ] 检查扩展是否正常工作（应该被过滤）

## 🐛 常见问题排查

### Q1: 拖拽没反应？

**检查**：
1. 打开控制台，检查是否有错误
2. 检查 `image_capture_enhanced.js` 是否加载：
   ```javascript
   console.log(window.__TAB_CLEANER_IMAGE_CAPTURE);
   ```
3. 检查桌宠元素是否存在：
   ```javascript
   document.querySelector('#tab-cleaner-pet-container');
   ```

### Q2: 右键菜单不显示？

**检查**：
1. 检查 `manifest.json` 是否包含 `"contextMenus"` 权限
2. 检查 `background.js` 是否创建了菜单：
   ```javascript
   chrome.contextMenus.getAll((menus) => {
     console.log('Menus:', menus);
   });
   ```
3. 重新加载扩展

### Q3: 图片保存失败？

**检查**：
1. 打开控制台，查看错误信息
2. 检查 `background.js` 的消息处理：
   ```javascript
   // 在 background.js 中添加日志
   console.log('[Background] Received message:', req.action);
   ```
3. 检查 session 是否存在：
   ```javascript
   chrome.storage.local.get(['sessions'], (result) => {
     console.log('Sessions:', result.sessions);
   });
   ```

### Q4: 截图模式不工作？

**检查**：
1. 检查 `screenshot_capture.js` 是否加载
2. 检查权限是否正确（不需要额外权限）
3. 检查控制台是否有错误

## 📝 测试前准备

1. **清理旧数据**（可选）：
   ```javascript
   chrome.storage.local.clear(() => {
     console.log('Storage cleared');
   });
   ```

2. **检查扩展状态**：
   - 打开 `chrome://extensions/`
   - 确保扩展已启用
   - 检查是否有错误

3. **打开控制台**：
   - 按 `F12` 打开开发者工具
   - 查看 Console 标签
   - 查看 Network 标签（检查 API 请求）

## ✅ 验证清单

- [ ] 拖拽保存功能正常
- [ ] 悬停标记功能正常
- [ ] 右键菜单功能正常
- [ ] 截图模式功能正常
- [ ] 智能首图选择正确
- [ ] SPA 路由监听正常
- [ ] 图片保存到 session
- [ ] Embedding 异步生成
- [ ] 错误处理正常
- [ ] 控制台无错误

## 🎉 测试通过标准

所有功能测试通过，且：
- ✅ 控制台无错误
- ✅ 图片正确保存到 session
- ✅ 个人空间能正确显示
- ✅ 用户体验流畅

---

**注意**：Chrome 扩展不需要 build，直接加载 `frontend/public` 目录即可测试！

