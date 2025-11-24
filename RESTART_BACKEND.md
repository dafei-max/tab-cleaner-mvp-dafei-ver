# 重启后端服务指南

## 为什么需要重启？

后端代码已更新，添加了文档卡片生成器功能。需要重启后端服务才能使用新功能。

## 重启步骤

### 1. 停止当前后端服务

如果后端正在运行，按 `Ctrl+C` 停止。

### 2. 重新启动后端

```bash
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. 验证后端已启动

访问 `http://127.0.0.1:8000/`，应该看到：
```json
{"ok":true}
```

## 测试文档卡片功能

### 方法 1：使用测试脚本

```bash
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app
uv run python -c "from doc_card_generator import generate_doc_card_data_uri; print(generate_doc_card_data_uri('Starlight', 'https://github.com/withastro/starlight', 'github.com', 'Documentation website framework')[:100])"
```

### 方法 2：实际使用

1. 打开多个文档类标签页（如 GitHub、Notion、小红书文档等）
2. 点击扩展的"Clean Button"
3. 在个人空间中查看文档卡片

## 预期效果

文档类网页应该显示：
- **有截图时**：显示实际截图
- **截图失败时**：显示生成的文档卡片（包含标题、类型、站点名称）

## 故障排除

### 问题：仍然看不到文档卡片

1. **检查后端日志**：
   - 查看是否有 `[OpenGraph] Screenshot failed, generating doc card` 日志
   - 查看是否有错误信息

2. **检查前端控制台**：
   - 打开个人空间页面
   - 按 F12 打开开发者工具
   - 查看 Console 是否有错误

3. **检查数据**：
   ```javascript
   // 在浏览器控制台运行
   chrome.storage.local.get(['opengraphData'], (result) => {
     console.log('OpenGraph Data:', result.opengraphData);
     // 检查是否有 is_doc_card: true 的项
   });
   ```

4. **清除缓存**：
   - 清除 Chrome Storage 中的 `opengraphData`
   - 重新点击"Clean Button"

### 问题：文档卡片显示为占位图

- 检查 `og.image` 字段是否包含 `data:image/svg+xml;base64,` 前缀
- 检查浏览器是否支持 SVG Data URI

## 相关文件

- `backend/app/doc_card_generator.py` - 文档卡片生成器
- `backend/app/opengraph.py` - OpenGraph 抓取（已集成文档卡片）
- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` - 前端显示逻辑




