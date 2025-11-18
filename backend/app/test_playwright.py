"""
测试 Playwright 是否正常安装
"""
import asyncio
from playwright.async_api import async_playwright

async def test_playwright():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            print("✅ Playwright Chromium installed successfully!")
            await browser.close()
            return True
    except Exception as e:
        print(f"❌ Playwright test failed: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_playwright())
    exit(0 if result else 1)



