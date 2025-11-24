#!/usr/bin/env python3
"""
检查后端是否收到本地 OpenGraph 数据的调试脚本

使用方法：
1. 运行后端服务
2. 在浏览器中执行"一键清理"
3. 查看后端日志，查找以下标记：
   - [API] 📥 Received request with X items for embedding generation
   - [API] 📋 First item sample: {...}
   - [API] ✅ Processed X items from local OpenGraph data
"""

print("""
🔍 如何检查后端是否收到本地 OpenGraph 数据：

1. 查看后端日志中的以下标记：

   ✅ 如果收到数据，会看到：
   [API] 📥 Received request with X items for embedding generation
   [API] 📋 First item sample: {...}
   [API] Normalized X items from X input items
   [API] Generated embeddings for X items
   [API] ✓ Stored X/X items to vector DB

   ⚠️ 如果没有收到数据，会看到：
   [API] ⚠️ No opengraph_items provided in request

2. 检查前端是否发送了请求：

   在浏览器控制台查找：
   [Tab Cleaner Background] 📤 Sending batch X to backend:
   [Tab Cleaner Background] 📥 Backend response:

3. 检查数据来源：

   如果 first item sample 中有 "is_local_fetch": true，说明是本地抓取的数据
   如果 "is_local_fetch" 不存在或为 false，说明数据来源不明

4. 常见问题：

   ❌ 前端没有发送请求
      → 检查 chrome.storage.local['recent_opengraph'] 是否有数据
      → 检查 background.js 中的日志

   ❌ 后端没有收到请求
      → 检查 API URL 是否正确（Railway 服务是否运行）
      → 检查网络连接和 CORS 配置

   ❌ 后端收到请求但数据为空
      → 检查前端发送的数据格式
      → 检查 normalizeItem 函数是否正确处理数据
""")


