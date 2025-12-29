# 测试结果目录

本目录用于存放测试脚本的运行结果和测试数据。

## 目录结构

```
test_result/
├── README.md (本文件)
├── search_test_results/     # 搜索测试结果（由 test_search_with_images.py 生成）
├── clustering_results/      # 聚类测试结果（从 backend/app/clustering/results/ 移动）
├── user_data_*.csv         # 用户数据导出文件（测试数据）
└── [其他测试结果文件]
```

## 使用说明

运行测试或检查脚本后，请将结果文件保存到此目录。

## 文件命名建议

- `test_search_YYYYMMDD.txt` - 搜索测试结果
- `check_opengraph_YYYYMMDD.json` - OpenGraph 检查结果
- `diagnose_embeddings_YYYYMMDD.log` - Embedding 诊断日志
- `user_data_YYYYMMDD.csv` - 用户数据导出文件

## 测试结果来源

### 搜索测试结果
- 由 `test/test_search_with_images.py` 生成
- 包含各阶段的搜索结果、图片下载、统计信息等

### 聚类测试结果
- 由 `backend/app/clustering/` 模块生成
- 包含 AI 分类和发现的聚类结果 JSON 文件

### 用户数据文件
- 由 `backend/app/export_user_data_to_csv.py` 导出
- 用于数据分析和测试

## 注意事项

- 此目录已添加到 `.gitignore`，不会提交到版本控制
- 定期清理旧的结果文件，避免占用过多空间
- 测试结果文件可能包含敏感数据，请谨慎处理



