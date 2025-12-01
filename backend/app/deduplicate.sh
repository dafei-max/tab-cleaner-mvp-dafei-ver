#!/bin/bash
# 检查并删除数据库中的重复数据

cd "$(dirname "$0")"
python search/deduplicate_data.py "$@"

