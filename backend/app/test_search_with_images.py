"""
测试搜索并下载各阶段图片结果
下载粗召回、精排序、AI筛选三个阶段的图片到本地文件夹
"""
import asyncio
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import aiohttp
import aiofiles

# 加载环境变量
load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent
sys.path.insert(0, str(parent_dir))

from search.funnel_search import (
    _coarse_recall_text_vector,
    _coarse_recall_image_vector,
    _coarse_recall_text_to_image_vector,
    _coarse_recall_caption_embedding,  # ✅ 新增：Caption Embedding 搜索
    _coarse_recall_caption_keyword,
    _coarse_recall_visual_attributes,
    _coarse_recall_designer_sites,  # 设计师网站专门召回
    # _fine_ranking,  # ✅ 已移除精排序阶段
)
from search.smart_filter import smart_filter
from search.threshold_filter import FilterMode
from search.embed import embed_text, embed_image
from search.preprocess import is_doc_like  # 文档类内容过滤，和线上 funnel_search 保持一致


async def download_image(url: str, save_path: Path, session: aiohttp.ClientSession) -> bool:
    """下载图片到本地"""
    try:
        if not url or not url.startswith(('http://', 'https://')):
            return False
        
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 200:
                content = await response.read()
                async with aiofiles.open(save_path, 'wb') as f:
                    await f.write(content)
                return True
    except Exception as e:
        print(f"  ⚠️  下载失败 {url[:50]}...: {e}")
        return False
    return False


async def save_stage_results(
    stage_name: str,
    results: list,
    output_dir: Path,
    session: aiohttp.ClientSession,
    max_download: int = 20
):
    """保存阶段结果并下载图片"""
    stage_dir = output_dir / stage_name
    stage_dir.mkdir(parents=True, exist_ok=True)
    
    # 保存 JSON 结果（需要处理 Decimal 等不可序列化类型）
    json_path = stage_dir / "results.json"
    async with aiofiles.open(json_path, 'w', encoding='utf-8') as f:
        def default_serializer(obj):
            # 将 Decimal 等类型安全地转换为 float 或字符串
            try:
                from decimal import Decimal
                if isinstance(obj, Decimal):
                    return float(obj)
            except ImportError:
                pass
            # 其他无法识别的类型统一转为字符串，避免测试脚本崩溃
            return str(obj)

        await f.write(json.dumps(results, ensure_ascii=False, indent=2, default=default_serializer))
    
    print(f"\n[{stage_name}]")
    print(f"  结果数量: {len(results)}")
    print(f"  JSON 已保存: {json_path}")
    
    # 下载图片
    images_dir = stage_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    
    download_count = 0
    for idx, item in enumerate(results[:max_download], 1):
        # 优先使用 screenshot_image，其次使用 image
        image_url = item.get('screenshot_image') or item.get('image')
        
        if image_url:
            # 生成文件名
            url_hash = str(hash(item.get('url', '')))[:8]
            title = item.get('title', 'untitled')[:30]
            title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
            ext = Path(image_url).suffix.split('?')[0] or '.jpg'
            filename = f"{idx:03d}_{title}_{url_hash}{ext}"
            filename = filename.replace(' ', '_')
            
            save_path = images_dir / filename
            
            if await download_image(image_url, save_path, session):
                download_count += 1
                print(f"  ✅ [{idx}/{min(len(results), max_download)}] {filename}")
            else:
                print(f"  ❌ [{idx}/{min(len(results), max_download)}] 下载失败: {title}")
        else:
            print(f"  ⚠️  [{idx}/{min(len(results), max_download)}] 无图片: {item.get('title', 'N/A')[:30]}")
    
    print(f"  成功下载: {download_count}/{min(len(results), max_download)} 张图片")
    print(f"  图片目录: {images_dir}")


async def test_search_with_stages(
    query: str,
    user_id: str = "anonymous",
    filter_mode: FilterMode = FilterMode.BALANCED,
    use_caption: bool = True,
):
    """测试搜索并获取各阶段结果"""
    print("=" * 80)
    print(f"测试搜索: '{query}'")
    print(f"用户ID: {user_id}")
    print(f"过滤模式: {filter_mode.value}")
    print("=" * 80)
    
    # 创建输出目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    query_safe = "".join(c for c in query if c.isalnum() or c in (' ', '-', '_')).strip()[:30]
    query_safe = query_safe.replace(' ', '_')
    output_dir = Path(__file__).parent / "search_test_results" / f"{query_safe}_{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n输出目录: {output_dir}\n")
    
    async with aiohttp.ClientSession() as session:
        try:
            # ========== 阶段 1: 粗召回（Multi-Recall） ==========
            print("[阶段 1] 粗召回（Multi-Recall）")
            print("-" * 80)
            
            recall_tasks = []
            
            # === 调试版粗召回：包含主要搜索路径 ===
            # 注意：不同路径使用不同的相似度阈值
            # 1) 文本→图像 embedding（多模态文本搜图，主要信号）
            #    使用 IMAGE_EMBEDDING_THRESHOLD = 0.24 (24%，更宽松，因为结果质量好)
            recall_tasks.append(_coarse_recall_text_to_image_vector(user_id, query, top_k=100))
            
            # 2a) Caption Embedding 向量搜索（语义搜索，更智能）
            #    使用 IMAGE_EMBEDDING_THRESHOLD = 0.24 (24%，更宽松)
            #    优势：能理解语义相似性（如"椅子"可以匹配"chair"、"seating"等）
            if use_caption:
                recall_tasks.append(_coarse_recall_caption_embedding(user_id, query, top_k=100))
            
            # 2b) Caption 关键词搜索（全文搜索，作为补充）
            #    使用 CAPTION_RANK_THRESHOLD = 0.65 (65%，更严格，rank 为 0.5 或 1.0)
            if use_caption:
                recall_tasks.append(_coarse_recall_caption_keyword(user_id, query, top_k=100))
            # ❌ 文本向量（text_vector）在调试中表现噪声过大，这里先完全关闭
            # 如果后续需要对比，可再临时打开：
            # recall_tasks.append(_coarse_recall_text_vector(user_id, query, top_k=100))
            
            # 并发执行所有召回路径
            recall_results = await asyncio.gather(*recall_tasks, return_exceptions=True)
            
            # 1. 合并召回结果
            all_candidates_raw = []
            for results in recall_results:
                if isinstance(results, Exception):
                    print(f"  ⚠️  召回路径错误: {results}")
                    continue
                all_candidates_raw.extend(results)
            
            print(f"  召回总数（含文档类 & 重复，已通过路径特定阈值过滤）: {len(all_candidates_raw)}")
            print(f"    - Image embedding 路径: 阈值 >= 0.24 (24%)")
            print(f"    - Caption Embedding 路径: 阈值 >= 0.24 (24%)")
            print(f"    - Caption 关键词路径: rank 阈值 >= 0.65 (65%)")

            # 1.1 按召回路径统计数量，方便观察各路贡献，并分别保存结果
            from collections import Counter, defaultdict
            recall_path_counter = Counter()
            path_groups = defaultdict(list)
            for item in all_candidates_raw:
                path = item.get("recall_path", "unknown")
                recall_path_counter[path] += 1
                path_groups[path].append(item)

            if recall_path_counter:
                print("  各召回路径数量（raw）:")
                for path, cnt in recall_path_counter.items():
                    print(f"    - {path}: {cnt}")

                # 为每条召回路径分别保存一个阶段目录，方便你单独查看每一路的图片质量
                for path, items in path_groups.items():
                    stage_name = f"01_raw_{path}"
                    await save_stage_results(
                        stage_name,
                        items,
                        output_dir,
                        session,
                        max_download=len(items) or 50,
                    )

            # 2. 文档类过滤（和线上 funnel_search 保持一致）
            doc_filtered_candidates = []
            doc_like_count = 0
            for item in all_candidates_raw:
                if is_doc_like(item):
                    doc_like_count += 1
                    continue
                doc_filtered_candidates.append(item)
            
            if doc_like_count > 0:
                print(f"  粗召回阶段过滤掉文档类内容: {doc_like_count} 个")

            # 3. 去重（基于 URL）
            seen_urls = set()
            unique_candidates = []
            for item in doc_filtered_candidates:
                url = item.get('url', '')
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    unique_candidates.append(item)
            
            print(f"  文档过滤后: {len(doc_filtered_candidates)}")
            print(f"  去重后: {len(unique_candidates)}")
            
            # 保存粗召回结果（已经过滤掉文档类内容）
            # 调试阶段：下载所有粗召回图片，方便肉眼整体检查
            await save_stage_results(
                "01_粗召回",
                unique_candidates,
                output_dir,
                session,
                max_download=len(unique_candidates) or 50,  # 至少保证有上限
            )
            
            if not unique_candidates:
                print("\n⚠️  粗召回阶段没有结果，停止测试")
                return
            
            # ✅ 为粗召回结果统一设置 similarity 字段（取各路分数的最大值）
            for item in unique_candidates:
                scores = []
                if "similarity" in item:
                    scores.append(item["similarity"])
                if "text_similarity" in item:
                    scores.append(item["text_similarity"])
                if "image_similarity" in item:
                    scores.append(item["image_similarity"])
                if "caption_similarity" in item:
                    scores.append(item["caption_similarity"])
                
                if scores:
                    item["similarity"] = max(scores)
                elif "similarity" not in item:
                    item["similarity"] = 0.5
            
            # ========== 阶段 2: AI筛选（Smart Filtering） ==========
            print("\n[阶段 2] AI筛选（Smart Filtering）")
            print("⚠️  精排序阶段已移除（按用户要求）")
            print("-" * 80)
            
            filtered_results = await smart_filter(
                unique_candidates,  # ✅ 直接使用粗召回结果，跳过精排序
                query,
                filter_mode=filter_mode,
                max_results=None,
                filter_docs=True,
            )
            
            print(f"  AI筛选后结果数量: {len(filtered_results)}")
            
            # 保存 AI 筛选结果
            await save_stage_results(
                "02_AI筛选",  # ✅ 阶段编号从 02 开始（精排序已移除）
                filtered_results,
                output_dir,
                session,
                max_download=min(len(filtered_results), 50),
            )
            
            # 生成总结
            summary = {
                "query": query,
                "user_id": user_id,
                "filter_mode": filter_mode.value,
                "timestamp": timestamp,
                "stages": {
                    "coarse_recall": {
                        "total_raw": len(all_candidates_raw),
                        "after_doc_filter": len(doc_filtered_candidates),
                        "unique": len(unique_candidates),
                        "by_recall_path_raw": dict(recall_path_counter),
                    },
                    # "fine_ranking": {  # ✅ 精排序阶段已移除
                    #     "input": len(unique_candidates),
                    #     "output": len(ranked_results),
                    #     "filtered": len(unique_candidates) - len(ranked_results),
                    # },
                    "ai_filtering": {
                        "input": len(unique_candidates),  # ✅ 直接使用粗召回结果
                        "output": len(filtered_results),
                        "filtered": len(unique_candidates) - len(filtered_results),
                    },
                },
            }
            
            summary_path = output_dir / "summary.json"
            async with aiofiles.open(summary_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(summary, ensure_ascii=False, indent=2))
            
            print("\n" + "=" * 80)
            print("✅ 测试完成（完整流程：粗召回 → AI筛选）")
            print("⚠️  精排序阶段已移除（按用户要求）")
            print(f"结果保存在: {output_dir}")
            print("=" * 80)
            return
            
        except Exception as e:
            print(f"\n❌ 测试失败: {e}")
            import traceback
            traceback.print_exc()


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="测试搜索并下载各阶段图片")
    parser.add_argument(
        "--query",
        type=str,
        default="绿色盆栽",
        help="搜索查询（默认: '设计'）"
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default="anonymous",
        help="用户 ID（默认: anonymous）"
    )
    parser.add_argument(
        "--filter-mode",
        type=str,
        choices=["strict", "balanced", "relaxed"],
        default="balanced",
        help="过滤模式（默认: balanced）"
    )
    
    args = parser.parse_args()
    
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    filter_mode_map = {
        "strict": FilterMode.STRICT,
        "balanced": FilterMode.BALANCED,
        "relaxed": FilterMode.RELAXED,
    }
    
    print("数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - User ID: {args.user_id}")
    print()
    
    await test_search_with_stages(
        query=args.query,
        user_id=args.user_id,
        filter_mode=filter_mode_map[args.filter_mode],
    )
    
    # 关闭数据库连接池
    try:
        from vector_db import close_pool
        await close_pool()
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())

