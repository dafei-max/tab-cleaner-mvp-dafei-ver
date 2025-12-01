#!/bin/bash
# 检查数据库中 Caption 的完成状态

cd "$(dirname "$0")"
python search/check_caption_status.py "$@"

