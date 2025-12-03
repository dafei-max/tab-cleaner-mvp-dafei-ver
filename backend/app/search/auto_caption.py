"""
自动生成 Caption 异步任务模块
当新数据插入时，自动触发 Caption 生成（后台异步处理）
"""
import asyncio
from typing import List, Dict, Optional
from .caption import enrich_item_with_caption, batch_enrich_items
from .qwen_vl_client import QwenVLClient
from .embed import embed_text
from vector_db import upsert_opengraph_item, get_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE, _normalize_user_id
import sys
from pathlib import Path

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))


# 全局任务队列和信号量（控制并发）
_caption_task_queue = asyncio.Queue()
_caption_worker_running = False
_caption_semaphore = asyncio.Semaphore(3)  # 最多 3 个并发任务
# ✅ 去重：记录已入队的任务（user_id + url）
_enqueued_tasks = set()  # Set of (user_id, url) tuples


def to_vector_str(vec: Optional[List[float]]) -> Optional[str]:
    """将向量列表转换为数据库格式"""
    if not vec:
        return None
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


async def _update_item_caption_in_db(
    user_id: str,
    url: str,
    caption: str,
    dominant_colors: List[str],
    style_tags: List[str],
    object_tags: List[str],
    caption_embedding: Optional[List[float]] = None,
) -> bool:
    """
    更新数据库中的 Caption 和视觉属性
    
    Args:
        user_id: 用户 ID
        url: 项 URL
        caption: 图片描述
        dominant_colors: 主要颜色列表
        style_tags: 风格标签列表
        object_tags: 物体标签列表
        caption_embedding: Caption 的 embedding（可选）
    
    Returns:
        是否更新成功
    """
    try:
        pool = await get_pool()
        user_id = _normalize_user_id(user_id)
        
        async with pool.acquire() as conn:
            # 检查新字段是否存在（如果不存在，降级到 metadata）
            has_new_fields = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = '{NAMESPACE}'
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                      AND column_name = 'image_caption'
                );
            """)
            
            if has_new_fields:
                # 使用新字段更新
                caption_vec = to_vector_str(caption_embedding)
                
                await conn.execute(
                    f"""
                    UPDATE {ACTIVE_TABLE}
                    SET image_caption = $1,
                        caption_embedding = $2::vector(1024),
                        dominant_colors = $3,
                        style_tags = $4,
                        object_tags = $5,
                        updated_at = NOW()
                    WHERE user_id = $6 AND url = $7
                    """,
                    caption,
                    caption_vec,
                    dominant_colors if dominant_colors else None,
                    style_tags if style_tags else None,
                    object_tags if object_tags else None,
                    user_id,
                    url
                )
            else:
                # 降级到 metadata（向后兼容）
                existing_metadata = await conn.fetchval(
                    f"SELECT metadata FROM {ACTIVE_TABLE} WHERE user_id = $1 AND url = $2",
                    user_id, url
                )
                
                if existing_metadata:
                    if isinstance(existing_metadata, str):
                        import json
                        metadata = json.loads(existing_metadata)
                    else:
                        metadata = existing_metadata
                else:
                    metadata = {}
                
                # 更新 metadata 中的 caption 相关字段
                from datetime import datetime
                metadata["caption"] = caption
                metadata["dominant_colors"] = dominant_colors
                metadata["style_tags"] = style_tags
                metadata["object_tags"] = object_tags
                metadata["caption_generated_at"] = datetime.now().isoformat()
                
                import json
                metadata_json = json.dumps(metadata)
                
                await conn.execute(
                    f"""
                    UPDATE {ACTIVE_TABLE}
                    SET metadata = $1::jsonb,
                        updated_at = NOW()
                    WHERE user_id = $2 AND url = $3
                    """,
                    metadata_json, user_id, url
                )
            
            return True
            
    except Exception as e:
        print(f"[AutoCaption] ERROR updating caption for {url[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return False


async def _process_caption_task(task: Dict):
    """
    处理单个 Caption 生成任务
    
    Args:
        task: 任务字典，包含 user_id, url, item 等信息
    """
    user_id = task.get("user_id")
    url = task.get("url")
    item = task.get("item")
    
    if not item or not url:
        print(f"[AutoCaption] Invalid task: missing item or url")
        return
    
    # ✅ 规范化用户ID
    normalized_user_id = _normalize_user_id(user_id)
    
    # ✅ 从任务集合中移除（标记为正在处理）
    task_key = (normalized_user_id, url)
    if task_key in _enqueued_tasks:
        _enqueued_tasks.discard(task_key)
    
    # 检查是否有图片
    image = item.get("image")
    if not image:
        print(f"[AutoCaption] Skipping {url[:50]}...: no image")
        return
    
    # ✅ 先检查传入的 item 中是否有 Caption
    has_caption = item.get("image_caption") or (
        item.get("metadata", {}).get("caption") if isinstance(item.get("metadata"), dict) else None
    )
    if has_caption:
        print(f"[AutoCaption] Skipping {url[:50]}...: already has caption in item")
        return
    
    # ✅ 查询数据库检查是否已有 Caption（避免重复处理）
    try:
        from vector_db import get_items_by_urls
        existing_items = await get_items_by_urls(normalized_user_id, [url])
        if existing_items and len(existing_items) > 0:
            existing_item = existing_items[0]
            # 检查数据库中是否已有 caption
            db_caption = existing_item.get("image_caption") or (
                existing_item.get("metadata", {}).get("caption") if isinstance(existing_item.get("metadata"), dict) else None
            )
            if db_caption:
                print(f"[AutoCaption] Skipping {url[:50]}...: already has caption in database")
                return
    except Exception as e:
        print(f"[AutoCaption] Warning: Failed to check database for {url[:50]}...: {e}")
        # 继续处理，不因为检查失败而跳过
    
    async with _caption_semaphore:
        try:
            print(f"[AutoCaption] Processing {url[:50]}...")
            
            # 创建 Qwen-VL 客户端
            qwen_client = QwenVLClient()
            
            # 生成 Caption
            enriched_item = await enrich_item_with_caption(
                item,
                qwen_client=qwen_client,
                use_kmeans_colors=True,
            )
            
            if not enriched_item.get("caption"):
                print(f"[AutoCaption] Failed to generate caption for {url[:50]}...")
                return
            
            # 生成 Caption embedding
            caption_embedding = None
            try:
                caption_embedding = await embed_text(enriched_item.get("caption", ""))
            except Exception as e:
                print(f"[AutoCaption] Failed to generate caption embedding: {e}")
            
            # 更新数据库
            success = await _update_item_caption_in_db(
                user_id=user_id,
                url=url,
                caption=enriched_item.get("caption", ""),
                dominant_colors=enriched_item.get("dominant_colors", []),
                style_tags=enriched_item.get("style_tags", []),
                object_tags=enriched_item.get("object_tags", []),
                caption_embedding=caption_embedding,
            )
            
            if success:
                print(f"[AutoCaption] ✅ Successfully generated caption for {url[:50]}...")
            else:
                print(f"[AutoCaption] ❌ Failed to update caption in DB for {url[:50]}...")
                
        except Exception as e:
            print(f"[AutoCaption] ERROR processing task for {url[:50]}...: {e}")
            import traceback
            traceback.print_exc()


async def _caption_worker():
    """
    Caption 生成工作线程（从队列中取任务并处理）
    """
    global _caption_worker_running
    _caption_worker_running = True
    print("[AutoCaption] Worker started")
    
    while True:
        try:
            # 从队列中获取任务（超时 1 秒，避免阻塞）
            try:
                task = await asyncio.wait_for(_caption_task_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                # 超时，继续循环
                continue
            
            # 处理任务
            await _process_caption_task(task)
            
            # 标记任务完成
            _caption_task_queue.task_done()
            
        except Exception as e:
            print(f"[AutoCaption] Worker error: {e}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(1)  # 出错后等待 1 秒再继续


def start_caption_worker():
    """
    启动 Caption 生成工作线程（在应用启动时调用）
    """
    global _caption_worker_running
    
    if not _caption_worker_running:
        # 创建后台任务
        asyncio.create_task(_caption_worker())
        print("[AutoCaption] Worker task created")


async def enqueue_caption_task(user_id: str, item: Dict):
    """
    将 Caption 生成任务加入队列（异步处理）
    
    Args:
        user_id: 用户 ID
        item: OpenGraph 数据项（包含 url, image 等字段）
    """
    url = item.get("url")
    if not url:
        return
    
    # ✅ 规范化用户ID
    normalized_user_id = _normalize_user_id(user_id)
    
    # ✅ 去重检查：如果已经入队，跳过
    task_key = (normalized_user_id, url)
    if task_key in _enqueued_tasks:
        print(f"[AutoCaption] Skipping {url[:50]}...: already enqueued")
        return
    
    # 检查是否有图片
    image = item.get("image")
    if not image:
        return
    
    # 检查是否已有 Caption
    has_caption = item.get("image_caption") or (
        item.get("metadata", {}).get("caption") if isinstance(item.get("metadata"), dict) else None
    )
    if has_caption:
        return
    
    # 创建任务
    task = {
        "user_id": normalized_user_id,  # ✅ 使用规范化后的用户ID
        "url": url,
        "item": item,
    }
    
    # 加入队列（非阻塞）
    try:
        _caption_task_queue.put_nowait(task)
        # ✅ 记录已入队的任务
        _enqueued_tasks.add(task_key)
        print(f"[AutoCaption] Enqueued caption task for {url[:50]}... (user_id={normalized_user_id})")
    except asyncio.QueueFull:
        print(f"[AutoCaption] Queue full, skipping {url[:50]}...")
    except Exception as e:
        print(f"[AutoCaption] Error enqueueing task: {e}")


async def batch_enqueue_caption_tasks(user_id: str, items: List[Dict], max_items: Optional[int] = None):
    """
    批量将 Caption 生成任务加入队列
    
    Args:
        user_id: 用户 ID
        items: OpenGraph 数据项列表
        max_items: 最多处理数量（None 表示处理所有）
    """
    if not items:
        return
    
    processed = 0
    for item in items:
        if max_items and processed >= max_items:
            break
        
        await enqueue_caption_task(user_id, item)
        processed += 1
    
    print(f"[AutoCaption] Enqueued {processed} caption tasks")

