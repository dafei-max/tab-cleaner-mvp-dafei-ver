# 文件使用情况分析报告

## 📋 分析结果

### 1. `normalize_opengraph.js` - ❌ **未使用，可以删除**

**文件信息：**
- 位置：`public/assets/normalize_opengraph.js`
- 大小：约 163 行
- 功能：OpenGraph 数据规范化工具

**使用情况：**
- ❌ **不在 manifest.json 的 content_scripts 中**
- ❌ **没有被任何地方引用**（0 处引用）
- ❌ **没有动态加载**（没有 `chrome.runtime.getURL` 或 `importScripts`）
- ✅ **background.js 中有内联的 `normalizeItem` 函数**（在 1732 行、2701 行、2811 行），而不是使用这个文件

**结论：**
- `background.js` 中已经实现了内联的规范化函数，不需要这个独立文件
- 可以安全删除

---

### 2. `opengraph_preview.js` - ❌ **未使用，可以删除**

**文件信息：**
- 位置：`public/assets/opengraph_preview.js`
- 大小：约 235 行
- 功能：OpenGraph 本地预览卡片（在页面上实时显示抓取到的 OpenGraph 数据）

**使用情况：**
- ❌ **不在 manifest.json 的 content_scripts 中**
- ❌ **没有被任何地方引用**（0 处引用）
- ❌ **没有动态加载**（没有 `chrome.runtime.getURL` 或 `importScripts`）
- ⚠️ **background.js 中有 `save-opengraph-preview` 消息处理**（2632 行），但这是为了处理预览卡片的保存请求
- ⚠️ **content.js 中有注释提到 `save-opengraph-preview`**（964 行），但只是注释说明

**关键发现：**
- `opengraph_preview.js` 暴露了全局函数：
  - `window.__TAB_CLEANER_SHOW_PREVIEW`
  - `window.__TAB_CLEANER_HIDE_PREVIEW`
- 但是**没有任何地方调用这些函数**
- 预览卡片功能从未被加载，所以 `save-opengraph-preview` 消息处理也不会被触发

**结论：**
- 预览卡片功能完全未使用
- 可以安全删除 `opengraph_preview.js`
- ⚠️ **注意**：`background.js` 中的 `save-opengraph-preview` 消息处理也可以删除（因为预览卡片从未被加载，这个消息永远不会被触发）

---

## 🗑️ 删除建议

### 可以立即删除的文件：
```bash
# 1. normalize_opengraph.js（未使用）
rm -f public/assets/normalize_opengraph.js

# 2. opengraph_preview.js（未使用）
rm -f public/assets/opengraph_preview.js
```

### 可选清理（需要确认）：
```bash
# background.js 中的 save-opengraph-preview 消息处理
# 如果确认预览功能不再需要，可以删除这部分代码（2632-2700 行左右）
```

---

## 📊 统计

- **总文件数**：2 个
- **总代码行数**：约 398 行
- **预计减少大小**：约 10-15 KB（压缩后）
- **风险等级**：🟢 低（完全未使用，删除不会影响功能）

---

## ✅ 验证步骤

删除后，请验证：
1. 运行 `npm run build` 确保构建成功
2. 检查 Chrome 扩展是否正常工作
3. 确认没有控制台错误

