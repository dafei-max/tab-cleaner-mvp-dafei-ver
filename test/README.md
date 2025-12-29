# 测试文件目录

本目录包含项目的所有测试文件。

## 目录结构

```
test/
├── README.md (本文件)
├── backend/          # 后端测试文件
│   └── test_*.py    # Python 测试脚本
└── frontend/         # 前端测试文件（预留）
```

## 后端测试文件

### 搜索相关测试
- `test_search.py` - 基础搜索功能测试
- `test_search_debug.py` - 搜索调试测试
- `test_search_yellow.py` - 黄色搜索测试（特定颜色搜索）
- `test_search_with_images.py` - 带图片的搜索测试（完整流程，包含结果保存）
- `test_funnel_search.py` - 漏斗搜索测试（三阶段搜索流程）

### AI 相关测试
- `test_ai_intent.py` - AI 意图增强测试
- `test_qwen_vl.py` - 通义千问视觉语言模型测试

### 其他测试
- `test_playwright.py` - Playwright 测试

## 运行测试

### 后端测试

```bash
cd backend/app
python test_search.py
python test_funnel_search.py
# ... 其他测试文件
```

## 测试结果

测试结果保存在 `../test_result/` 目录下：
- `search_test_results/` - 搜索测试结果
- `clustering_results/` - 聚类测试结果
- 其他测试输出文件

## 注意事项

- 测试文件已从 `backend/app/` 移动到此目录
- 运行测试时，请确保在正确的目录下执行
- 测试结果会自动保存到 `test_result/` 目录

