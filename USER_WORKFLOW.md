# Tab Cleaner MVP - 用户流程文档

## 📋 目录

1. [流程概览](#流程概览)
2. [核心用户场景](#核心用户场景)
3. [详细流程分析](#详细流程分析)
4. [输入输出规范](#输入输出规范)

---

## 流程概览

本文档以 **Input → Process → Output** 的思路整理当前版本的用户流程，涵盖从标签页收集到搜索的所有核心场景。

### 核心流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     用户操作入口                              │
├─────────────────────────────────────────────────────────────┤
│  1. 清理所有标签页 (Clean All)                               │
│  2. 清理当前标签页 (Clean Current)                            │
│  3. 清理单个标签页 (Clean One)                               │
│  4. 搜索标签页 (Search)                                      │
│  5. 删除标签页/会话 (Delete)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心用户场景

### 场景 1: 清理所有标签页

#### Input（输入）

**用户操作**：
- 点击桌面宠物的"一键清理"按钮
- 或点击清理卡片的"Clean All"按钮

**系统状态**：
- 浏览器中有多个打开的标签页
- 每个标签页都已加载完成（或正在加载）

#### Process（处理）

```
1. 显示加载动画
   Input: 用户点击操作
   Output: 全屏气泡动画 + "正在清理标签页..." 文字

2. 收集标签页数据
   Input: 所有打开的标签页列表
   Process:
     a. 遍历每个标签页
     b. 注入 opengraph_local.js
     c. 提取 OpenGraph 数据（三层保险）
       - 第一层：立即提取
       - 第二层：等待动态加载（MutationObserver，最多 5 秒）
       - 第三层：截图兜底（如果没有 OG 图片）
     d. 确保每个标签页都有图片（OG 或截图）
   Output: OpenGraph 数据数组

3. 保存到本地存储
   Input: OpenGraph 数据数组
   Process:
     a. 创建 session 对象
     b. 保存到 Chrome Storage (sessions)
   Output: Session ID + 数据已保存

4. 关闭标签页
   Input: 标签页列表 + OpenGraph 数据
   Process:
     a. 过滤出有图片的标签页
     b. 关闭这些标签页
     c. 保留没有图片的标签页（不关闭）
   Output: 标签页已关闭（部分）

5. 打开个人空间
   Input: Session ID
   Process:
     a. 打开 sidepanel.html（个人空间）
     b. 从 Chrome Storage 读取 session 数据
     c. 立即渲染卡片（不等待后端）
   Output: 个人空间页面显示卡片

6. 异步生成 Embedding（后台）
   Input: OpenGraph 数据数组
   Process:
     a. 批量发送到后端 (/api/v1/search/embedding)
     b. 后端生成文本和图像 embedding
     c. 保存到向量数据库
     d. 更新 Chrome Storage
   Output: Embedding 已生成并保存
```

#### Output（输出）

**用户看到**：
- ✅ 所有标签页已关闭（有图片的）
- ✅ 个人空间页面打开
- ✅ 卡片立即显示（不等待后端）
- ✅ 卡片包含图片、标题、描述等信息

**系统状态**：
- ✅ Session 数据保存在 Chrome Storage
- ✅ Embedding 数据保存在向量数据库（异步）
- ✅ 用户可以在个人空间中查看、搜索、操作卡片

---

### 场景 2: 清理当前标签页

#### Input（输入）

**用户操作**：
- 点击桌面宠物的"清理当前页"按钮
- 或点击清理卡片的"Clean One"按钮

**系统状态**：
- 当前标签页已加载完成

#### Process（处理）

```
1. 显示加载动画
   Input: 用户点击操作
   Output: 全屏气泡动画（仅当前标签页显示）

2. 收集当前标签页数据
   Input: 当前标签页 ID
   Process:
     a. 注入 opengraph_local.js
     b. 提取 OpenGraph 数据（三层保险）
     c. 确保有图片（OG 或截图）
   Output: OpenGraph 数据对象

3. 保存到本地存储
   Input: OpenGraph 数据对象
   Process:
     a. 创建或更新 session
     b. 保存到 Chrome Storage
   Output: Session 已更新

4. 关闭当前标签页
   Input: 当前标签页 ID + OpenGraph 数据
   Process:
     a. 检查是否有图片
     b. 如果有图片，关闭标签页
     c. 如果没有图片，保留标签页
   Output: 标签页已关闭（如果有图片）

5. 打开个人空间（可选）
   Input: Session ID
   Process:
     a. 如果用户已打开个人空间，刷新数据
     b. 如果未打开，可以打开个人空间
   Output: 个人空间显示新卡片

6. 异步生成 Embedding（后台）
   Input: OpenGraph 数据对象
   Process: 同场景 1
   Output: Embedding 已生成
```

#### Output（输出）

**用户看到**：
- ✅ 当前标签页已关闭（如果有图片）
- ✅ 个人空间显示新卡片（如果打开）

**系统状态**：
- ✅ Session 数据已更新
- ✅ Embedding 数据已保存（异步）

---

### 场景 3: 搜索标签页

#### Input（输入）

**用户操作**：
- 在个人空间的搜索框输入关键词（如"蓝色设计"）
- 按 Enter 键触发搜索

**系统状态**：
- 个人空间已打开
- 用户已收集了一些标签页数据

#### Process（处理）

```
1. 前端处理
   Input: 用户输入的查询文本
   Process:
     a. 显示"搜索中..."状态
     b. 调用 searchContent(query) API
   Output: API 请求

2. 后端查询增强
   Input: 查询文本（如"蓝色设计"）
   Process:
     a. 颜色识别（"蓝色" → "blue"）
     b. 风格识别（"设计" → "design"）
     c. 同义词扩展
   Output: 增强后的查询文本（如"blue design"）

3. 生成查询向量
   Input: 增强后的查询文本
   Process:
     a. 调用 DashScope API (embed_text)
     b. 生成 1024 维向量
   Output: 查询向量 (vector(1024))

4. 多路召回
   Input: 查询向量 + 用户 ID
   Process:
     a. 向量搜索（search_by_text_embedding）
       - 文本相似度搜索
       - 图像相似度搜索
     b. 关键词搜索（fuzzy_score）
     c. 视觉属性搜索（颜色、风格匹配）
   Output: 多路召回结果

5. 重排序
   Input: 多路召回结果
   Process:
     a. 融合相似度分数（自适应权重）
     b. 按相似度排序
     c. 过滤低相似度结果（< 0.15）
   Output: 排序后的搜索结果

6. 前端渲染
   Input: 搜索结果数组
   Process:
     a. 计算放射状布局
       - 最相关在内环
       - 向外递减
     b. 更新 opengraphData state
     c. 触发 UI 重新渲染
   Output: 搜索结果卡片显示
```

#### Output（输出）

**用户看到**：
- ✅ 搜索结果以放射状布局显示
- ✅ 最相关的卡片在内环
- ✅ 每个卡片显示图片、标题、描述
- ✅ 相似度分数（可选，当前版本已隐藏）

**系统状态**：
- ✅ 搜索结果已缓存（可选）
- ✅ 用户可以在结果中进一步操作（打开、删除等）

---

### 场景 4: 删除标签页/会话

#### Input（输入）

**用户操作**：
- 在个人空间中选中一个或多个卡片
- 点击"删除"按钮
- 或删除整个 session（洗衣筐）

**系统状态**：
- 个人空间已打开
- 有选中的卡片或 session

#### Process（处理）

```
1. 前端确认
   Input: 用户点击删除
   Process:
     a. 显示确认对话框（可选）
     b. 准备删除请求
   Output: 删除请求

2. 软删除（前端）
   Input: 选中的卡片或 session
   Process:
     a. 更新 Chrome Storage
     b. 标记为已删除（本地）
     c. 从 UI 中移除
   Output: 本地数据已更新

3. 软删除（后端）
   Input: 删除请求（URL 或 session_id）
   Process:
     a. 调用 DELETE API
       - DELETE /api/v1/tabs/{url}
       - DELETE /api/v1/sessions/{session_id}
     b. 更新数据库
       - 设置 status = 'deleted'
       - 设置 deleted_at = NOW()
     c. 不物理删除数据
   Output: 数据库已更新

4. 同步确认
   Input: 后端删除结果
   Process:
     a. 确认删除成功
     b. 更新前端状态
   Output: 删除完成
```

#### Output（输出）

**用户看到**：
- ✅ 选中的卡片已从 UI 中移除
- ✅ Session 已删除（如果删除整个 session）

**系统状态**：
- ✅ 数据标记为已删除（软删除）
- ✅ 数据不会出现在搜索结果中
- ✅ 30 天后自动清理或匿名化

---

## 详细流程分析

### 流程 1: 标签页收集完整流程

#### 输入（Input）

| 项目 | 说明 |
|------|------|
| **用户操作** | 点击"清理所有标签页" |
| **系统输入** | 所有打开的标签页列表 |
| **数据格式** | `chrome.tabs.query()` 返回的 tab 对象数组 |

#### 处理（Process）

| 步骤 | 输入 | 处理逻辑 | 输出 |
|------|------|----------|------|
| 1. 显示动画 | 用户点击 | 创建全屏动画覆盖层 | 动画显示 |
| 2. 收集数据 | Tab 列表 | 遍历每个 tab，提取 OG 数据 | OpenGraph 数据数组 |
| 3. 保存本地 | OpenGraph 数据 | 保存到 Chrome Storage | Session ID |
| 4. 关闭标签 | Tab 列表 + OG 数据 | 过滤有图片的 tab，关闭 | 标签页已关闭 |
| 5. 打开空间 | Session ID | 打开个人空间，读取数据 | 个人空间页面 |
| 6. 生成 Embedding | OpenGraph 数据 | 发送到后端，生成 embedding | Embedding 已保存 |

#### 输出（Output）

| 项目 | 说明 |
|------|------|
| **用户界面** | 个人空间显示卡片 |
| **本地存储** | Chrome Storage 中的 session 数据 |
| **数据库** | 向量数据库中的 embedding 数据 |
| **系统状态** | 标签页已关闭，数据已保存 |

---

### 流程 2: 搜索完整流程

#### 输入（Input）

| 项目 | 说明 |
|------|------|
| **用户操作** | 在搜索框输入关键词，按 Enter |
| **查询文本** | 用户输入的文本（如"蓝色设计"） |
| **用户 ID** | 当前用户的 ID（从 Header 获取） |

#### 处理（Process）

| 步骤 | 输入 | 处理逻辑 | 输出 |
|------|------|----------|------|
| 1. 查询增强 | 查询文本 | 颜色/风格识别，同义词扩展 | 增强后的查询 |
| 2. 生成向量 | 增强查询 | 调用 DashScope API | 查询向量 (1024 维) |
| 3. 向量搜索 | 查询向量 + 用户 ID | 在向量数据库中搜索 | 向量搜索结果 |
| 4. 关键词搜索 | 查询文本 + 用户数据 | 模糊匹配（fuzzy_score） | 关键词搜索结果 |
| 5. 视觉搜索 | 查询文本 + 用户数据 | 颜色/风格匹配 | 视觉搜索结果 |
| 6. 重排序 | 多路结果 | 融合相似度分数，排序 | 排序后的结果 |
| 7. 过滤 | 排序结果 | 过滤低相似度（< 0.15） | 最终结果 |
| 8. 布局计算 | 最终结果 | 计算放射状布局位置 | 带位置的结果 |

#### 输出（Output）

| 项目 | 说明 |
|------|------|
| **搜索结果** | 按相似度排序的卡片数组 |
| **布局信息** | 每个卡片的放射状布局位置 |
| **用户界面** | 搜索结果以放射状显示 |
| **相似度分数** | 每个结果的相似度（当前版本已隐藏） |

---

### 流程 3: 删除完整流程

#### 输入（Input）

| 项目 | 说明 |
|------|------|
| **用户操作** | 选中卡片，点击"删除" |
| **删除目标** | 单个 URL 或整个 session_id |
| **用户 ID** | 当前用户的 ID |

#### 处理（Process）

| 步骤 | 输入 | 处理逻辑 | 输出 |
|------|------|----------|------|
| 1. 前端删除 | 选中的卡片 | 更新 Chrome Storage，移除 UI | 本地已删除 |
| 2. 后端删除 | URL 或 session_id | 调用 DELETE API | API 请求 |
| 3. 数据库更新 | API 请求 | 软删除（status = 'deleted'） | 数据库已更新 |
| 4. 同步确认 | 删除结果 | 确认删除成功 | 删除完成 |

#### 输出（Output）

| 项目 | 说明 |
|------|------|
| **用户界面** | 卡片已从 UI 中移除 |
| **本地存储** | Chrome Storage 中的数据已更新 |
| **数据库** | 数据标记为已删除（软删除） |
| **系统状态** | 数据不会出现在搜索结果中 |

---

## 输入输出规范

### 1. OpenGraph 数据格式

#### 输入（前端发送到后端）

```json
{
  "opengraph_items": [
    {
      "url": "https://example.com",
      "title": "Example Title",
      "description": "Example Description",
      "image": "https://example.com/image.jpg",
      "site_name": "Example Site",
      "tab_id": 123,
      "tab_title": "Example Tab",
      "is_doc_card": false,
      "is_screenshot": false,
      "success": true
    }
  ]
}
```

#### 输出（后端返回）

```json
{
  "ok": true,
  "processed": 5,
  "items": [
    {
      "url": "https://example.com",
      "title": "Example Title",
      "description": "Example Description",
      "image": "https://example.com/image.jpg",
      "site_name": "Example Site",
      "text_embedding": [0.1, 0.2, ...],  // 1024 维
      "image_embedding": [0.3, 0.4, ...],  // 1024 维
      "has_embedding": true
    }
  ]
}
```

---

### 2. 搜索请求格式

#### 输入（前端发送到后端）

```json
{
  "query": "蓝色设计",
  "top_k": 20
}
```

**Headers**:
```
Content-Type: application/json
X-User-ID: <user_id>  // 可选，默认 "anonymous"
```

#### 输出（后端返回）

```json
{
  "ok": true,
  "results": [
    {
      "url": "https://example.com",
      "title": "蓝色设计作品",
      "description": "...",
      "image": "https://example.com/image.jpg",
      "site_name": "Example Site",
      "similarity": 0.85,
      "text_sim": 0.80,
      "image_sim": 0.90
    }
  ]
}
```

---

### 3. 删除请求格式

#### 输入（前端发送到后端）

**删除单个标签页**:
```
DELETE /api/v1/tabs/{url}
Headers:
  X-User-ID: <user_id>
```

**删除整个会话**:
```
DELETE /api/v1/sessions/{session_id}
Headers:
  X-User-ID: <user_id>
```

#### 输出（后端返回）

```json
{
  "ok": true,
  "message": "Tab deleted successfully"
}
```

---

### 4. Chrome Storage 数据格式

#### Session 数据

```javascript
{
  "sessions": {
    "session_1234567890": {
      "id": "session_1234567890",
      "timestamp": 1234567890000,
      "opengraphData": [
        {
          "url": "https://example.com",
          "title": "Example",
          "image": "https://example.com/image.jpg",
          // ... 其他 OpenGraph 字段
        }
      ]
    }
  }
}
```

#### OpenGraph 缓存

```javascript
{
  "recent_opengraph": {
    "https://example.com": {
      "url": "https://example.com",
      "title": "Example",
      "image": "https://example.com/image.jpg",
      // ... 其他 OpenGraph 字段
    }
  }
}
```

---

## 错误处理

### 1. 标签页收集错误

**输入**: 标签页无法提取 OpenGraph 数据

**处理**:
- 第一层失败 → 等待动态加载
- 第二层失败 → 截图兜底
- 第三层失败 → 保留标签页（不关闭）

**输出**: 
- 有图片的标签页：关闭并保存
- 无图片的标签页：保留并记录错误

---

### 2. 搜索错误

**输入**: 后端搜索失败或返回空结果

**处理**:
- 后端失败 → 使用本地模糊搜索兜底
- 返回空结果 → 显示"未找到结果"

**输出**:
- 有结果：显示搜索结果
- 无结果：显示空状态提示

---

### 3. 删除错误

**输入**: 后端删除失败

**处理**:
- 前端已删除 → 保持删除状态
- 后端失败 → 记录错误，稍后重试

**输出**:
- 本地已删除（UI 已更新）
- 后端同步失败（记录错误日志）

---

## 性能指标

### 1. 标签页收集

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 单个标签页处理时间 | < 8 秒 | 包括 OG 提取和截图兜底 |
| 批量处理时间 | < 30 秒（10 个标签页） | 并行处理 |
| 动画显示时间 | ≥ 3 秒 | 确保用户看到反馈 |

### 2. 搜索

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 查询响应时间 | < 2 秒 | 包括向量搜索和重排序 |
| 结果数量 | 最多 20 个 | top_k = 20 |
| 相似度阈值 | ≥ 0.15 | 过滤低质量结果 |

### 3. 删除

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 删除响应时间 | < 1 秒 | 软删除操作 |
| 同步延迟 | < 5 秒 | 前端到后端同步 |

---

## 总结

本文档以 **Input → Process → Output** 的思路整理了 Tab Cleaner MVP 的核心用户流程，包括：

1. **标签页收集流程**：从用户操作到数据保存的完整流程
2. **搜索流程**：从查询输入到结果展示的完整流程
3. **删除流程**：从用户操作到数据软删除的完整流程

每个流程都详细说明了输入、处理和输出的规范，以及错误处理和性能指标。这为开发和测试提供了清晰的参考。

