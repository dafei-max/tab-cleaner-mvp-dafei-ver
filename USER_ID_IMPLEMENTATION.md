# 用户ID实现说明

## 问题1: User ID如何被新建

### 实现方案

**文件**: `frontend/src/utils/userId.js`

用户ID的生成策略（按优先级）：

1. **Google账户邮箱（优先）**
   - 使用 `chrome.identity.getProfileUserInfo()` 获取Google账户信息
   - 如果用户已登录Google账户，使用邮箱的SHA-256哈希作为用户ID
   - 格式：`user_<32位哈希>`
   - **优势**：跨设备同步（同一Google账户在不同电脑上使用相同ID）

2. **设备ID（降级方案）**
   - 如果无法获取Google账户信息，使用设备特征生成ID
   - 存储在Chrome Storage中，确保同一设备使用相同ID
   - 格式：`device_<时间戳>_<随机字符串>`
   - **优势**：即使未登录Google账户也能正常工作

3. **匿名ID（最终降级）**
   - 如果以上都失败，使用 `"anonymous"`
   - **注意**：所有使用匿名ID的用户会共享数据

### 工作流程

```
用户首次使用插件
  ↓
调用 getOrCreateUserId()
  ↓
尝试获取Google账户邮箱
  ├─ 成功 → 哈希邮箱 → 保存到Chrome Storage → 返回 user_xxx
  └─ 失败 → 生成设备ID → 保存到Chrome Storage → 返回 device_xxx
  ↓
后续使用：直接从Chrome Storage读取
```

### 跨设备同步

- **Google账户登录**：同一Google账户在不同电脑上会生成相同的用户ID（基于邮箱哈希）
- **设备ID**：不同设备会生成不同的ID，数据不共享

### 隐私保护

- 邮箱使用SHA-256哈希，不存储原始邮箱
- 哈希后的ID无法反推出原始邮箱

## 问题2: 用户Filter逻辑实现

### ✅ 已实现用户隔离

**所有搜索和数据库操作都包含用户ID过滤**：

1. **向量搜索** (`vector_db.py`)
   ```sql
   WHERE user_id = $2 AND status = 'active'
   ```

2. **Caption搜索** (`funnel_search.py`)
   ```sql
   WHERE user_id = $2 AND status = 'active'
   ```

3. **视觉属性搜索** (`funnel_search.py`)
   ```sql
   WHERE user_id = $1 AND status = 'active'
   ```

### 安全保证

- ✅ **严格用户隔离**：所有SQL查询都包含 `user_id` 条件
- ✅ **前端发送用户ID**：API调用时自动发送 `X-User-ID` header
- ✅ **后端验证**：后端使用 `_normalize_user_id()` 规范化用户ID

### 测试验证

```bash
# 测试不同用户ID的搜索
python test_search.py --user-id user_abc123
python test_search.py --user-id user_xyz789
```

**结果**：每个用户只能看到自己的数据，无法看到其他用户的数据。

## 问题3: 移除搜索结果数量限制

### 实现方案

**修改文件**：
- `search/threshold_filter.py` - 移除 `max_results` 限制
- `search/smart_filter.py` - 移除 `max_results` 限制
- `search/funnel_search.py` - `max_results` 改为可选参数
- `main.py` - 搜索API不再传递 `max_results`

### 新的过滤策略

**只根据质量阈值过滤，不限制数量**：

1. **高质量结果** (`similarity >= high_threshold`)：全部返回
2. **中等质量结果** (`medium_threshold <= similarity < high_threshold`)：全部返回
3. **低质量结果** (`similarity < medium_threshold`)：丢弃

### 示例

- **搜索"蓝色设计"**：如果数据库中有50个符合质量阈值的结果，返回50个
- **搜索"furniture"**：如果只有1个符合质量阈值的结果，返回1个

### 质量阈值（BALANCED模式）

```python
QUALITY_THRESHOLDS = {
    FilterMode.BALANCED: {
        "high": 0.30,      # 高质量阈值
        "medium": 0.20,   # 中等质量阈值
        "low": 0.15,      # 低质量阈值（低于此值丢弃）
    }
}
```

### 前端适配

前端已经支持动态数量的搜索结果：
- `SearchOverlay` 组件会根据结果数量智能调整布局
- 支持1-5个、6-10个、11+个结果的不同显示策略

## 使用说明

### 1. 用户ID生成

前端会自动在首次使用时生成用户ID，无需手动操作。

### 2. 检查用户ID

在浏览器控制台运行：
```javascript
chrome.storage.local.get(['user_id'], (result) => {
  console.log('User ID:', result.user_id);
});
```

### 3. 重置用户ID

如果需要重置用户ID（例如切换账户）：
```javascript
chrome.storage.local.remove(['user_id', 'device_id'], () => {
  console.log('User ID reset');
});
```

## 注意事项

1. **Google账户登录**：需要用户在Chrome中登录Google账户才能使用邮箱哈希ID
2. **权限要求**：需要在 `manifest.json` 中添加 `"identity"` 权限
3. **隐私保护**：邮箱使用哈希处理，不存储原始邮箱
4. **向后兼容**：如果无法获取用户ID，降级到 `"anonymous"`，所有匿名用户共享数据

