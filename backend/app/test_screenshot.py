"""
测试脚本：测试各种文档类网站的截图功能
用于验证截图功能是否正常工作，特别是需要特殊处理的网站
"""
import asyncio
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

from screenshot import get_screenshot_as_base64, is_doc_like_url, take_screenshot, process_screenshot_to_base64
from opengraph import fetch_opengraph


# 测试 URL 列表
TEST_URLS = {
    "小红书文档": [
        "https://docs.xiaohongshu.com/doc/ce75a9e4e08e8dc94ed436cd90637ef1",
        "https://docs.xiaohongshu.com/doc/1238ea53828b3fcd1653df0491c79bdb",
        "https://docs.xiaohongshu.com/doc/11d6a04c13861bd564760ca14f0ce5c8",
    ],
    "Notion": [
        "hhttps://smart-insect-717.notion.site/9b8099fd26a94c789c759ebf13e4ec97?pvs=73",
        "hhttps://www.notion.so/2d2ceb89943243cf8d2e00fc89e03b01?source=copy_link",
    ],
    "飞书文档": [
        "https://www.feishu.cn/",
        "https://www.feishu.cn/hc/zh-CN",
    ],
    "Google Docs": [
        "https://docs.google.com/document/d/1L6CHa9-Y9TcF8jkcQFmHwXbS5c10kF2i10rKLbERp-s/edit?usp=sharing",  # 示例（需要替换为实际可访问的文档）
    ],
    "微信公众号": [
        "https://mp.weixin.qq.com/s/pO_vZ6g9BKMcqu6-PPlbAw",
        "https://mp.weixin.qq.com/s/pO_vZ6g9BKMcqu6-PPlbAw"  # 示例（需要替换为实际文章）
    ],
    "GitHub": [
        "https://github.com/vercel/ai",
        "https://github.com/CoryLee1/tab-cleaner-mvp/blob/main/CHROME_STORE_SUBMISSION.md",
    ],
    "知乎": [
        "https://www.zhihu.com/question/14804346742/answer/1970293803148644585",
        "https://www.zhihu.com/question/1939807587659908158/answer/1960808302016439008" , # 示例
    ],
    "掘金": [
        "https://juejin.cn/post/123456",  # 示例
    ],
    "CSDN": [
        "https://blog.csdn.net/g2435332909/article/details/154494232?spm=1000.2115.3001.10524", 
        "https://blog.csdn.net/weixin_62043600/article/details/154583078?spm=1000.2115.3001.10524" # 示例
    ],
}


async def test_single_url(url: str, category: str) -> Dict:
    """
    测试单个 URL 的截图功能
    
    Args:
        url: 要测试的 URL
        category: URL 类别
    
    Returns:
        测试结果字典
    """
    print(f"\n{'='*80}")
    print(f"[测试] {category}: {url}")
    print(f"{'='*80}")
    
    result = {
        "url": url,
        "category": category,
        "is_doc_like": False,
        "opengraph_success": False,
        "screenshot_success": False,
        "screenshot_base64_length": 0,
        "error": None,
        "timestamp": datetime.now().isoformat(),
    }
    
    # 1. 检查是否为文档类 URL
    result["is_doc_like"] = is_doc_like_url(url)
    print(f"[1] 是否为文档类 URL: {result['is_doc_like']}")
    
    # 2. 测试 OpenGraph 抓取
    try:
        print(f"[2] 测试 OpenGraph 抓取...")
        og_result = await fetch_opengraph(url, timeout=15.0, use_screenshot_fallback=False)
        result["opengraph_success"] = og_result.get("success", False)
        result["opengraph_title"] = og_result.get("title", "")
        result["opengraph_image"] = bool(og_result.get("image", ""))
        print(f"    OpenGraph 成功: {result['opengraph_success']}")
        print(f"    OpenGraph 标题: {result['opengraph_title'][:50]}...")
        print(f"    OpenGraph 图片: {result['opengraph_image']}")
    except Exception as e:
        result["opengraph_error"] = str(e)
        print(f"    OpenGraph 错误: {e}")
    
    # 3. 测试截图功能
    try:
        print(f"[3] 测试截图功能...")
        screenshot_b64 = await get_screenshot_as_base64(url)
        if screenshot_b64:
            result["screenshot_success"] = True
            result["screenshot_base64_length"] = len(screenshot_b64)
            print(f"    截图成功: ✅")
            print(f"    Base64 长度: {len(screenshot_b64)} 字符")
            print(f"    数据大小: {len(screenshot_b64) * 3 / 4 / 1024:.2f} KB (估算)")
        else:
            result["screenshot_success"] = False
            result["error"] = "截图返回 None"
            print(f"    截图失败: ❌ (返回 None)")
    except Exception as e:
        result["screenshot_success"] = False
        result["error"] = str(e)
        print(f"    截图错误: ❌ {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    
    # 4. 测试完整流程（OpenGraph + 截图后备）
    try:
        print(f"[4] 测试完整流程（OpenGraph + 截图后备）...")
        full_result = await fetch_opengraph(url, timeout=15.0, use_screenshot_fallback=True)
        result["full_flow_success"] = full_result.get("success", False)
        result["full_flow_is_screenshot"] = full_result.get("is_screenshot", False)
        result["full_flow_has_image"] = bool(full_result.get("image", ""))
        print(f"    完整流程成功: {result['full_flow_success']}")
        print(f"    使用截图: {result['full_flow_is_screenshot']}")
        print(f"    有图片数据: {result['full_flow_has_image']}")
    except Exception as e:
        result["full_flow_error"] = str(e)
        print(f"    完整流程错误: {e}")
    
    return result


async def test_all_urls():
    """
    测试所有 URL
    """
    print("\n" + "="*80)
    print("开始测试文档类网站截图功能")
    print("="*80)
    
    all_results = []
    
    for category, urls in TEST_URLS.items():
        print(f"\n\n{'#'*80}")
        print(f"测试类别: {category}")
        print(f"{'#'*80}")
        
        for url in urls:
            try:
                result = await test_single_url(url, category)
                all_results.append(result)
                
                # 每个 URL 之间稍作延迟，避免过载
                await asyncio.sleep(2)
            except Exception as e:
                print(f"测试 {url} 时发生错误: {e}")
                all_results.append({
                    "url": url,
                    "category": category,
                    "error": str(e),
                    "timestamp": datetime.now().isoformat(),
                })
    
    # 保存测试结果
    output_file = Path(__file__).parent / f"screenshot_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "test_time": datetime.now().isoformat(),
            "total_tests": len(all_results),
            "results": all_results,
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n{'='*80}")
    print("测试完成！")
    print(f"{'='*80}")
    print(f"\n测试结果已保存到: {output_file}")
    
    # 统计结果
    total = len(all_results)
    doc_like_count = sum(1 for r in all_results if r.get("is_doc_like", False))
    screenshot_success_count = sum(1 for r in all_results if r.get("screenshot_success", False))
    full_flow_success_count = sum(1 for r in all_results if r.get("full_flow_success", False))
    
    print(f"\n统计结果:")
    print(f"  总测试数: {total}")
    print(f"  识别为文档类: {doc_like_count}")
    print(f"  截图成功: {screenshot_success_count}")
    print(f"  完整流程成功: {full_flow_success_count}")
    print(f"  成功率: {full_flow_success_count}/{total} ({full_flow_success_count/total*100:.1f}%)")
    
    # 失败的测试
    failed = [r for r in all_results if not r.get("full_flow_success", False)]
    if failed:
        print(f"\n失败的测试 ({len(failed)} 个):")
        for r in failed:
            print(f"  - {r.get('category', 'Unknown')}: {r.get('url', 'Unknown')}")
            if r.get("error"):
                print(f"    错误: {r['error']}")


async def test_specific_urls():
    """
    测试特定 URL（用于快速测试）
    """
    # 可以在这里添加需要重点测试的 URL
    test_urls = [
        ("小红书文档", "https://docs.xiaohongshu.com/doc/ce75a9e4e08e8dc94ed436cd90637ef1"),
        ("Notion", "https://www.notion.so/"),
        ("GitHub", "https://github.com/microsoft/playwright"),
    ]
    
    results = []
    for category, url in test_urls:
        result = await test_single_url(url, category)
        results.append(result)
        await asyncio.sleep(2)
    
    return results


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        # 快速测试模式
        print("快速测试模式（仅测试部分 URL）")
        asyncio.run(test_specific_urls())
    else:
        # 完整测试模式
        asyncio.run(test_all_urls())





