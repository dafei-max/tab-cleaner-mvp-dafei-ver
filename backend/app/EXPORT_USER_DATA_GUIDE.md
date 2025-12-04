# 导出用户数据为 CSV 指南

## 概述

`export_user_data_to_csv.py` 脚本用于从阿里云 AnalyticDB PostgreSQL 数据库中导出指定用户的所有数据为 CSV 文件。

## 使用方法

### 1. 基本用法

导出指定用户的数据（默认不包含完整 embedding 向量，只显示维度信息）：

```bash
cd backend/app
python export_user_data_to_csv.py --user-id <user_id>
```

示例：
```bash
python export_user_data_to_csv.py --user-id device_1764658383255_28u4om0xg
python export_user_data_to_csv.py --user-id anonymous
```

### 2. 指定输出文件

```bash
python export_user_data_to_csv.py --user-id <user_id> --output my_data.csv
```

### 3. 包含完整 Embedding 向量

默认情况下，embedding 字段只显示维度信息（如 `vector(1024)`）。如果需要导出完整的向量数据（前10个维度 + 总维度信息）：

```bash
python export_user_data_to_csv.py --user-id <user_id> --include-embeddings
```

**注意**：包含完整向量会显著增加文件大小，建议只在需要时使用。

### 4. 列出所有用户

查看数据库中有哪些用户：

```bash
python export_user_data_to_csv.py --list-users
```

输出示例：
```
[Export] 找到 3 个用户:

用户 ID                                            记录数
------------------------------------------------------------
device_1764658383255_28u4om0xg                    1025
anonymous                                          523
device_1234567890_abc                               12
```

## 输出文件格式

### 文件命名

如果不指定 `--output`，文件会自动命名为：
```
user_data_{user_id}_{timestamp}.csv
```

例如：`user_data_device_1764658383255_28u4om0xg_20250103_143022.csv`

### CSV 列说明

导出的 CSV 文件包含以下列：

| 列名 | 说明 | 示例 |
|------|------|------|
| `user_id` | 用户 ID | `device_1764658383255_28u4om0xg` |
| `url` | 网页 URL | `https://www.pinterest.com/pin/123/` |
| `title` | OpenGraph 标题 | `Beautiful Chair Design` |
| `description` | OpenGraph 描述 | `A modern chair...` |
| `image` | OpenGraph 图片 URL | `https://i.pinimg.com/...` |
| `screenshot_image` | 截图图片 URL | `https://...` |
| `site_name` | 网站名称 | `Pinterest` |
| `tab_id` | 标签页 ID | `12345` |
| `tab_title` | 标签页标题 | `Pinterest - Beautiful Chair` |
| `text_embedding` | 文本向量（默认只显示维度） | `vector(1024)` 或 `[0.1,0.2,...] (1024 dims)` |
| `image_embedding` | 图片向量（默认只显示维度） | `vector(1024)` 或 `[0.1,0.2,...] (1024 dims)` |
| `caption_embedding` | Caption 向量（默认只显示维度） | `vector(1024)` 或 `[0.1,0.2,...] (1024 dims)` |
| `metadata` | 元数据（JSON 格式） | `{"key": "value"}` |
| `image_caption` | AI 生成的图片描述 | `一张红色金属户外椅...` |
| `dominant_colors` | 主导颜色标签（逗号分隔） | `red,black,white` |
| `style_tags` | 风格标签（逗号分隔） | `modern,minimalist,contemporary` |
| `object_tags` | 物体标签（逗号分隔） | `chair,plant,table` |
| `status` | 状态 | `active` 或 `deleted` |
| `deleted_at` | 删除时间 | `2025-01-03T14:30:22` |
| `created_at` | 创建时间 | `2025-01-03T14:30:22` |
| `updated_at` | 更新时间 | `2025-01-03T14:30:22` |

### Embedding 字段格式

- **默认模式**（不包含 `--include-embeddings`）：
  - 如果向量存在：`vector(1024)`
  - 如果向量不存在：空字符串

- **包含向量模式**（使用 `--include-embeddings`）：
  - 如果向量存在：`[0.1234,0.5678,0.9012,...] (1024 dims)`（显示前10个维度 + 总维度信息）
  - 如果向量不存在：空字符串

## 输出示例

运行脚本后，会显示：

```
[Export] 开始导出用户数据: device_1764658383255_28u4om0xg
[Export] 输出文件: user_data_device_1764658383255_28u4om0xg_20250103_143022.csv
[Export] 执行查询...
[Export] 找到 1025 条记录
[Export] 已处理 100/1025 条记录...
[Export] 已处理 200/1025 条记录...
...
[Export] ✅ 导出完成！
[Export] 文件: /path/to/user_data_device_1764658383255_28u4om0xg_20250103_143022.csv
[Export] 总记录数: 1025

[Export] 数据统计:
  有标题: 1025/1025 (100.0%)
  有描述: 856/1025 (83.5%)
  有图片: 1025/1025 (100.0%)
  有截图: 523/1025 (51.0%)
  有 Caption: 987/1025 (96.3%)
  有颜色标签: 987/1025 (96.3%)
  有风格标签: 987/1025 (96.3%)
  有物体标签: 987/1025 (96.3%)
  有 Text Embedding: 1025/1025 (100.0%)
  有 Image Embedding: 1025/1025 (100.0%)
  有 Caption Embedding: 987/1025 (96.3%)

✅ 导出成功！文件保存在: /path/to/user_data_device_1764658383255_28u4om0xg_20250103_143022.csv
```

## 环境变量

脚本使用与 `vector_db.py` 相同的环境变量配置：

- `ADBPG_HOST`: 数据库主机（默认: `gp-uf6j424dtk2ww5291o-master.gpdb.rds.aliyuncs.com`）
- `ADBPG_PORT`: 数据库端口（默认: `5432`）
- `ADBPG_DBNAME`: 数据库名（默认: `postgres`）
- `ADBPG_USER`: 数据库用户（默认: `cleantab_db`）
- `ADBPG_PASSWORD`: 数据库密码（默认: `CleanTabV5`）
- `ADBPG_NAMESPACE`: Schema 名称（默认: `cleantab`）

可以通过 `.env` 文件或环境变量设置这些值。

## 注意事项

1. **文件大小**：如果用户数据量很大，CSV 文件可能会很大。建议使用 `--include-embeddings` 时谨慎使用。

2. **编码**：CSV 文件使用 UTF-8 编码，可以在 Excel、Google Sheets 等工具中打开。

3. **向量数据**：默认情况下，embedding 字段只显示维度信息，不包含实际向量值。如果需要完整向量，使用 `--include-embeddings` 参数。

4. **时间格式**：时间字段使用 ISO 8601 格式（`YYYY-MM-DDTHH:MM:SS`）。

5. **数组字段**：`dominant_colors`、`style_tags`、`object_tags` 使用逗号分隔的字符串格式。

6. **JSON 字段**：`metadata` 字段使用 JSON 字符串格式，可能需要特殊处理才能在 Excel 中正确显示。

## 故障排查

### 问题：连接数据库失败

**检查**：
1. 环境变量是否正确设置
2. 数据库是否可访问
3. 网络连接是否正常

### 问题：用户没有数据

**检查**：
1. 用户 ID 是否正确（使用 `--list-users` 查看所有用户）
2. 数据是否被软删除（`status = 'deleted'`）

### 问题：CSV 文件无法打开

**检查**：
1. 文件编码是否为 UTF-8
2. 文件是否完整（检查文件大小）
3. 尝试使用文本编辑器打开，检查格式是否正确

## 相关脚本

- `diagnose_search_issue.py`: 诊断搜索问题，包括用户数据检查
- `migrate_user_data.py`: 迁移用户数据到另一个用户 ID

