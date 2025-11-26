# OpenGraph.io API 集成方案

## 为什么考虑 OpenGraph.io？

### 当前问题
1. **Pinterest、小红书等网站的风控**：云服务器 IP 被拦截（403）
2. **需要登录的页面**：无法访问需要用户会话的内容
3. **维护成本**：需要处理各种 edge cases

### OpenGraph.io 的优势
1. ✅ **专业服务**：专门处理 OpenGraph 抓取
2. ✅ **绕过风控**：使用代理和浏览器环境
3. ✅ **可靠性高**：99.9% 可用性保证
4. ✅ **额外功能**：截图 API、内容提取等

参考：[OpenGraph.io 官网](https://www.opengraph.io/)

## 定价分析

需要查看 OpenGraph.io 的定价页面，通常有：
- **免费层**：有限的请求数（如 100/天）
- **付费层**：按请求数计费

**使用场景**：
- 用户每次"一键清理"可能打开 10-50 个标签页
- 如果每天有 10 个用户，就是 100-500 次请求
- 免费层可能不够用

## 集成方案

### 方案 1：作为 Fallback（推荐）

当自建抓取失败时，使用 OpenGraph.io API：

```python
async def fetch_opengraph_with_fallback(url: str) -> Dict:
    # 1. 先尝试自建抓取（免费）
    result = await fetch_opengraph(url)
    
    # 2. 如果失败且是风控问题，使用 OpenGraph.io
    if not result["success"] and is_rate_limited(result):
        if OPENGRAPH_IO_API_KEY:
            result = await fetch_opengraph_via_api(url)
    
    return result
```

**优点**：
- ✅ 大部分请求免费（自建）
- ✅ 只在必要时使用付费 API
- ✅ 成本可控

### 方案 2：完全替换（如果免费层足够）

如果免费层足够，可以完全使用 OpenGraph.io：

```python
async def fetch_opengraph(url: str) -> Dict:
    if OPENGRAPH_IO_API_KEY:
        return await fetch_opengraph_via_api(url)
    else:
        # Fallback 到自建
        return await fetch_opengraph_self_hosted(url)
```

**优点**：
- ✅ 代码更简单
- ✅ 可靠性更高

**缺点**：
- ❌ 完全依赖外部服务
- ❌ 可能有成本

## 实施步骤

### 1. 注册 OpenGraph.io 账号

访问 https://www.opengraph.io/ 注册并获取 API Key

### 2. 添加环境变量

```bash
OPENGRAPH_IO_API_KEY=your_api_key_here
```

### 3. 集成代码

已创建 `opengraph_io_integration.py`，包含：
- `fetch_opengraph_via_api()` - 单个 URL
- `fetch_multiple_opengraph_via_api()` - 批量处理

### 4. 修改现有代码

在 `opengraph.py` 中添加 fallback 逻辑：

```python
from opengraph_io_integration import fetch_opengraph_via_api

async def fetch_opengraph(url: str, timeout: float = 10.0) -> Dict:
    # 先尝试自建
    result = await fetch_opengraph_self_hosted(url)
    
    # 如果失败且配置了 API Key，尝试 OpenGraph.io
    if not result["success"] and OPENGRAPH_IO_API_KEY:
        print(f"[OpenGraph] Self-hosted failed, trying OpenGraph.io API...")
        api_result = await fetch_opengraph_via_api(url)
        if api_result["success"]:
            return api_result
    
    return result
```

## 成本估算

假设：
- 每天 10 个用户
- 每个用户平均 20 个标签页
- 50% 的请求需要 fallback 到 OpenGraph.io

**每天请求数**：10 × 20 × 0.5 = 100 次/天

**每月请求数**：100 × 30 = 3,000 次/月

需要查看 OpenGraph.io 的定价，通常：
- 免费层：100-1,000 次/月
- 付费层：$X/1,000 次

## 建议

1. **先测试免费层**：看看是否足够
2. **实施 Fallback 方案**：只在必要时使用
3. **监控使用量**：跟踪 API 调用次数
4. **设置预算告警**：避免意外费用

## 下一步

1. 注册 OpenGraph.io 账号
2. 获取 API Key
3. 测试 API 调用
4. 集成到现有代码
5. 监控成本和效果



