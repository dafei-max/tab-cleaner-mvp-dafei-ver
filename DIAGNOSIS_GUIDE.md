# OpenGraph 云端诊断和兜底方案路线图

## 一、快速判断：代码问题 vs 环境/风控问题

### 1. 查看云端日志

部署后，在 Fly.io/Railway Dashboard 查看日志，关注以下信息：

```
[OpenGraph] ====== 诊断信息开始 ======
[OpenGraph] Request URL: https://www.pinterest.com/pin/...
[OpenGraph] Final URL: ...
[OpenGraph] Status Code: 200
[OpenGraph] Response Length: ... bytes
[OpenGraph] OG Title: ✅ Found / ❌ Not Found
[OpenGraph] OG Image: ✅ Found / ❌ Not Found
```

### 2. 判断标准

**如果是代码问题：**
- Status Code: 200
- Response Length: 正常（> 10KB）
- OG Tags: ❌ Not Found（但本地能找到）
- Response Preview: 包含正常 HTML，但没有 OG 标签

**如果是环境/风控问题：**
- Status Code: 403, 429, 或重定向到错误页
- Response Length: 很小（< 1KB）
- Response Preview: 包含 "Access Denied", "Blocked", "Captcha" 等
- 或者：Status Code 200，但 HTML 内容完全不同（可能是拦截页面）

## 二、兜底方案路线图

### 方案 1：增强 Headers（最简单）

如果日志显示 Status Code 200 但 OG 标签缺失，尝试添加更多 headers：

```python
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.pinterest.com/",  # 添加 Referer
    "Origin": "https://www.pinterest.com",     # 添加 Origin
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}
```

### 方案 2：使用无头浏览器（最可靠）

如果 headers 不够，使用 Playwright/Selenium：

```python
from playwright.async_api import async_playwright

async def fetch_with_browser(url: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle")
        html = await page.content()
        await browser.close()
        return html
```

### 方案 3：前端本地获取（兜底）

如果后端无法获取，让前端在浏览器中获取：

```javascript
// 在 content script 中
const ogData = {
  title: document.querySelector('meta[property="og:title"]')?.content || document.title,
  image: document.querySelector('meta[property="og:image"]')?.content || '',
  description: document.querySelector('meta[property="og:description"]')?.content || '',
};
```

### 方案 4：使用代理服务

如果 IP 被限制，使用代理：

```python
proxies = {
    "http://": "http://proxy.example.com:8080",
    "https://": "http://proxy.example.com:8080",
}
response = await client.get(url, headers=headers, proxies=proxies)
```

## 三、诊断步骤

1. **部署代码**（已添加诊断日志）
2. **触发一次 Pinterest 请求**
3. **查看日志**，重点关注：
   - Status Code
   - Response Length
   - OG Tags Detection
   - Response Preview 内容
4. **根据日志判断**：
   - 如果 OG Tags: ❌ Not Found → 可能是环境/风控问题
   - 如果 Status Code: 403/429 → 确定是风控问题
   - 如果 Response Preview 包含拦截信息 → 确定是风控问题

## 四、下一步行动

根据诊断结果：
- **代码问题** → 修复代码逻辑
- **环境/风控问题** → 实施兜底方案（方案 1-4）


