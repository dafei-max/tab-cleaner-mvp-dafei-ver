# 自动生成 Caption 实现文档

## 概述

实现了新数据自动生成 Caption 的异步任务系统，当新数据插入时，自动在后台生成 Caption 和视觉属性（颜色、风格、物体标签）。

## 实现功能

### 1. 异步任务队列系统

**文件**: `search/auto_caption.py`

- **任务队列**: 使用 `asyncio.Queue` 管理 Caption 生成任务
- **工作线程**: 后台工作线程从队列中取任务并处理
- **并发控制**: 使用信号量（`Semaphore(3)`）控制最多 3 个并发任务
- **自动启动**: 应用启动时自动启动工作线程

### 2. 自动触发机制

**文件**: `main.py`

- **触发时机**: 在 `/api/v1/search/embedding` 端点中，数据存储成功后自动触发
- **过滤条件**: 只处理有图片且没有 Caption 的项
- **批量限制**: 每次最多处理 50 个，避免队列过载

### 3. 性能优化

**文件**: `vector_db.py`

- **批量处理优化**: `batch_upsert_items` 使用并发处理（默认并发数 20）
- **连接池复用**: 使用数据库连接池，避免频繁创建连接
- **异步处理**: 所有 I/O 操作都是异步的

## 使用方式

### 自动触发（推荐）

无需手动操作，新数据插入时自动触发：

1. 前端调用 `/api/v1/search/embedding` 存储数据
2. 后端检测到有图片且没有 Caption 的项
3. 自动将任务加入队列
4. 后台工作线程异步处理

### 手动触发（批量处理）

如果需要批量处理已有数据，使用：

```bash
cd backend/app
python search/batch_enrich_captions.py --user-id <user_id> --max-items 100
```

## 配置

### 环境变量

- `DASHSCOPE_API_KEY`: 阿里云 DashScope API Key（必需）
- `ADBPG_HOST`: 数据库主机（必需）

### 并发控制

在 `auto_caption.py` 中可以调整：

```python
_caption_semaphore = asyncio.Semaphore(3)  # 最多 3 个并发任务
```

### 批量限制

在 `main.py` 中可以调整：

```python
await batch_enqueue_caption_tasks(
    normalized_user_id,
    items_for_caption,
    max_items=50  # 每次最多处理 50 个
)
```

## 监控和调试

### 日志输出

- `[AutoCaption]`: Caption 生成相关日志
- `[API]`: API 调用相关日志

### 检查任务状态

```python
from search.auto_caption import _caption_task_queue
print(f"队列中任务数: {_caption_task_queue.qsize()}")
```

## 注意事项

1. **API 限流**: 注意 DashScope API 的限流，如果任务过多可能需要调整并发数
2. **数据库连接**: 确保数据库连接池大小足够
3. **错误处理**: 任务失败不会影响主流程，只记录日志
4. **向后兼容**: 如果数据库没有新字段，会自动降级到 `metadata` 字段

## 测试

运行测试脚本：

```bash
cd backend/app
python test_search.py
```

测试搜索功能是否正常工作。

