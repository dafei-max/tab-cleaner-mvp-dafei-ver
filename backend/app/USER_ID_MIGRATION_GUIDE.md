# 用户ID数据迁移指南

## 🐛 问题描述

诊断脚本显示：
- 用户ID `device_1764658383255_28u4om0xg` 下没有任何数据（0条记录）
- 所有数据都在 `anonymous` 用户ID下（1025条记录）

**根本原因**：
- `background.js` 中调用 `/api/v1/search/embedding` 时没有发送 `X-User-ID` header
- 导致数据被存储到 `anonymous` 用户ID下
- 但搜索时使用的是正确的用户ID，所以找不到数据

## ✅ 修复方案

### 1. 修复 background.js（已完成）

**修改位置**: `frontend/public/assets/background.js`

**修复内容**:
- ✅ 添加 `getUserId()` 函数，从 Chrome Storage 读取用户ID
- ✅ 在所有调用 embedding API 的地方添加 `X-User-ID` header

**修复的调用位置**:
1. `handleSaveCapturedImage` - 保存采集图片时
2. `clean-all` - 一键清理时（批量）
3. `save-opengraph-preview` - 保存预览卡片时
4. `clean-current-tab` - 清理当前tab时

### 2. 数据迁移（可选）

如果已有数据存储在 `anonymous` 下，可以使用迁移脚本将数据迁移到正确的用户ID。

## 🔄 数据迁移步骤

### 步骤1：预览迁移（推荐）

先预览会迁移哪些数据，不实际执行：

```bash
cd backend/app
python migrate_user_data.py --from anonymous --to device_1764658383255_28u4om0xg --dry-run
```

**输出示例**:
```
🔄 数据迁移
源用户ID: anonymous → anonymous
目标用户ID: device_1764658383255_28u4om0xg → device_1764658383255_28u4om0xg
模式: 预览（不实际执行）

📊 源用户 'anonymous' 的数据量: 1025 条
📊 目标用户 'device_1764658383255_28u4om0xg' 的现有数据量: 0 条
⚠️  URL冲突数量: 0 条

🔍 预览模式：以下数据将被迁移
  ...
```

### 步骤2：执行迁移

确认无误后，执行实际迁移：

```bash
python migrate_user_data.py --from anonymous --to device_1764658383255_28u4om0xg
```

**输出示例**:
```
🚀 开始迁移数据...
✅ 迁移完成！
   迁移了 1025 条数据
   跳过了 0 条冲突数据

📊 迁移后的数据统计:
   源用户 'anonymous': 0 条（剩余）
   目标用户 'device_1764658383255_28u4om0xg': 1025 条（总计）
```

## 📋 迁移脚本功能

### 功能特性

1. **URL冲突处理**：
   - 如果目标用户已有相同URL的数据，跳过迁移（不覆盖）
   - 只迁移目标用户没有的URL

2. **安全预览**：
   - `--dry-run` 模式：只显示会迁移的数据，不实际执行
   - 可以多次预览，确认无误后再执行

3. **数据统计**：
   - 显示源用户和目标用户的数据量
   - 显示URL冲突数量
   - 显示迁移后的数据统计

## 🎯 迁移后的效果

迁移完成后：
- ✅ 数据从 `anonymous` 迁移到正确的用户ID
- ✅ 搜索可以找到数据
- ✅ 新数据会正确存储到用户ID下（已修复 background.js）

## ⚠️ 注意事项

1. **备份数据**（可选）：
   - 迁移前可以备份数据库（如果担心数据丢失）

2. **URL冲突**：
   - 如果目标用户已有相同URL的数据，这些URL不会被迁移（避免覆盖）
   - 这是安全措施，确保不会丢失目标用户的数据

3. **迁移后验证**：
   - 运行诊断脚本验证迁移结果：
     ```bash
     python diagnose_search_issue.py --user-id device_1764658383255_28u4om0xg
     ```

## 🔍 验证迁移结果

### 方法1：运行诊断脚本

```bash
python diagnose_search_issue.py --user-id device_1764658383255_28u4om0xg
```

应该看到：
- 用户数据量 > 0
- 有 embedding
- 有 caption（如果已生成）

### 方法2：测试搜索

在前端测试搜索功能，应该能找到数据。

---

**修复日期**: 2025-12-03

