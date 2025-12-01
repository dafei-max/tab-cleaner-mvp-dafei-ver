#!/bin/bash

# 批量填充 Caption 和标签数据脚本
# 使用方法: ./fill_captions.sh [选项]

echo "============================================================"
echo "批量填充 Caption 和标签数据"
echo "============================================================"

# 默认参数
USER_ID=""
BATCH_SIZE=10
MAX_ITEMS=100
CONCURRENT=5
GENERATE_EMBEDDING="true"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --user-id)
            USER_ID="$2"
            shift 2
            ;;
        --batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        --max-items)
            MAX_ITEMS="$2"
            shift 2
            ;;
        --concurrent)
            CONCURRENT="$2"
            shift 2
            ;;
        --no-embedding)
            GENERATE_EMBEDDING="false"
            shift
            ;;
        --help)
            echo "使用方法: ./fill_captions.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --user-id USER_ID       只处理特定用户的数据"
            echo "  --batch-size N          批量大小（默认: 10）"
            echo "  --max-items N           最多处理数量（默认: 100）"
            echo "  --concurrent N          并发数量（默认: 5）"
            echo "  --no-embedding          不生成 Caption embedding"
            echo "  --help                  显示帮助信息"
            echo ""
            echo "示例:"
            echo "  ./fill_captions.sh"
            echo "  ./fill_captions.sh --user-id user123 --max-items 200"
            echo "  ./fill_captions.sh --batch-size 20 --concurrent 10"
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            echo "使用 --help 查看帮助信息"
            exit 1
            ;;
    esac
done

# 构建命令
CMD="python search/batch_enrich_captions.py"
CMD="$CMD --batch-size $BATCH_SIZE"
CMD="$CMD --max-items $MAX_ITEMS"
CMD="$CMD --concurrent $CONCURRENT"

if [ -n "$USER_ID" ]; then
    CMD="$CMD --user-id $USER_ID"
fi

if [ "$GENERATE_EMBEDDING" = "false" ]; then
    CMD="$CMD --no-caption-embedding"
fi

echo "执行命令: $CMD"
echo "============================================================"
echo ""

# 执行命令
cd "$(dirname "$0")"
$CMD

