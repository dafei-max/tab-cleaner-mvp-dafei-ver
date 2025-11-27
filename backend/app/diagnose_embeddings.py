"""
诊断脚本：检查哪些 OpenGraph 项缺少 embedding
并批量补全历史数据的 embedding
"""
import asyncio
import sys
import os
import json
from typing import Optional, List, Dict
from dotenv import load_dotenv

# 加载环境变量（从 .env 文件）
load_dotenv()

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vector_db import get_pool, close_pool, NAMESPACE, to_vector_str, ACTIVE_TABLE_NAME
from search.pipeline import process_opengraph_for_search
from search.normalize import normalize_opengraph_items

TABLE = f"{NAMESPACE}.{ACTIVE_TABLE_NAME}"


async def diagnose_missing_embeddings(user_filter: Optional[str] = None) -> List[Dict]:
    """检查数据库中缺少 embedding 的项"""
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            params = []
            where_clause = "WHERE text_embedding IS NULL OR image_embedding IS NULL"
            if user_filter:
                where_clause += " AND user_id = $1"
                params.append(user_filter)
            
            query = f"""
                SELECT user_id, url, title, 
                       CASE WHEN text_embedding IS NULL THEN true ELSE false END as missing_text,
                       CASE WHEN image_embedding IS NULL THEN true ELSE false END as missing_image,
                       created_at, updated_at
                FROM {TABLE}
                {where_clause}
                ORDER BY created_at DESC
            """
            
            results = await conn.fetch(query, *params)
            
            print(f"[Diagnose] Total items missing embeddings: {len(results)}")
            print(f"[Diagnose] Breakdown:")
            
            missing_text_count = sum(1 for r in results if r['missing_text'])
            missing_image_count = sum(1 for r in results if r['missing_image'])
            missing_both_count = sum(1 for r in results if r['missing_text'] and r['missing_image'])
            
            print(f"  - Missing text_embedding: {missing_text_count}")
            print(f"  - Missing image_embedding: {missing_image_count}")
            print(f"  - Missing both: {missing_both_count}")
            print()
            
            # 显示前10个示例
            print("[Diagnose] Sample items (first 10):")
            for idx, row in enumerate(results[:10], 1):
                print(f"  {idx}. [{row['user_id']}] {row['url'][:60]}...")
                print(f"     Title: {row['title'][:50] if row['title'] else 'N/A'}")
                print(f"     Missing: text={row['missing_text']}, image={row['missing_image']}")
                print(f"     Created: {row['created_at']}")
                print()
            
            # 转换为字典列表
            items = [
                {
                    'user_id': row['user_id'],
                    'url': row['url'],
                    'title': row['title'],
                    'missing_text': row['missing_text'],
                    'missing_image': row['missing_image'],
                }
                for row in results
            ]
            
            return items
    
    except Exception as e:
        print(f"[Diagnose] Error querying database: {e}")
        import traceback
        traceback.print_exc()
        return []


async def backfill_embeddings(items_to_fix: List[Dict], batch_size=10):
    """批量补全缺失的 embedding"""
    pool = await get_pool()
    
    print(f"[Backfill] Processing {len(items_to_fix)} items in batches of {batch_size}...")
    
    total_processed = 0
    total_success = 0
    total_failed = 0
    
    # 分批处理
    for batch_start in range(0, len(items_to_fix), batch_size):
        batch = items_to_fix[batch_start:batch_start + batch_size]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(items_to_fix) + batch_size - 1) // batch_size
        
        print(f"\n[Backfill] Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")
        
        try:
            async with pool.acquire() as conn:
                # 根据用户分组查询完整数据
                items_dict = {}
                user_groups: Dict[str, List[str]] = {}
                for item in batch:
                    user_groups.setdefault(item['user_id'], []).append(item['url'])
                
                for user_id, urls in user_groups.items():
                    placeholders = ','.join([f'${i+2}' for i in range(len(urls))])
                    query = f"""
                        SELECT user_id, url, title, description, image, site_name, 
                               tab_id, tab_title, metadata
                        FROM {TABLE}
                        WHERE user_id = $1 AND url IN ({placeholders})
                    """
                    rows = await conn.fetch(query, user_id, *urls)
                    
                    for row in rows:
                        item = dict(row)
                        metadata = item.get('metadata') or {}
                        if isinstance(metadata, str):
                            metadata = json.loads(metadata)
                        elif metadata is None:
                            metadata = {}
                        item['metadata'] = metadata
                        item['is_doc_card'] = metadata.get('is_doc_card', False)
                        item['is_screenshot'] = metadata.get('is_screenshot', False)
                        item['success'] = metadata.get('success', True)
                        items_dict[(item['user_id'], item['url'])] = item
                
                # 准备需要处理的项
                items_to_process = []
                for item in batch:
                    key = (item['user_id'], item['url'])
                    if key in items_dict:
                        db_item = items_dict[key]
                        # 确保格式正确
                        normalized_item = {
                            'user_id': db_item['user_id'],
                            'url': db_item['url'],
                            'title': db_item['title'],
                            'description': db_item['description'],
                            'image': db_item['image'],
                            'site_name': db_item['site_name'],
                            'tab_id': db_item['tab_id'],
                            'tab_title': db_item['tab_title'],
                            'metadata': db_item['metadata'],
                            'is_doc_card': db_item['is_doc_card'],
                            'is_screenshot': db_item['is_screenshot'],
                            'success': db_item['success'],
                        }
                        items_to_process.append(normalized_item)
                
                if not items_to_process:
                    print(f"[Backfill] No items to process in this batch")
                    continue
                
                # 规范化数据
                normalized_items = normalize_opengraph_items(items_to_process)
                for idx, norm_item in enumerate(normalized_items):
                    norm_item['user_id'] = items_to_process[idx]['user_id']
                
                # 生成 embedding
                print(f"[Backfill] Generating embeddings for {len(normalized_items)} items...")
                enriched = await process_opengraph_for_search(normalized_items)
                
                # 更新数据库
                for enriched_item in enriched:
                    url = enriched_item.get('url')
                    if not url:
                        continue
                    
                    has_text_emb = enriched_item.get('text_embedding') and len(enriched_item.get('text_embedding', [])) > 0
                    has_image_emb = enriched_item.get('image_embedding') and len(enriched_item.get('image_embedding', [])) > 0
                    
                    if has_text_emb or has_image_emb:
                        user_id = enriched_item.get('user_id') or 'anonymous'
                        try:
                            # 转换为向量字符串格式
                            text_vec_str = to_vector_str(enriched_item.get('text_embedding')) if has_text_emb else None
                            image_vec_str = to_vector_str(enriched_item.get('image_embedding')) if has_image_emb else None
                            
                            # 更新 embedding
                            if text_vec_str or image_vec_str:
                                update_query = f"""
                                    UPDATE {TABLE}
                                    SET text_embedding = CASE 
                                            WHEN $1::text IS NOT NULL AND $1::text != '' THEN $1::vector(1024)
                                            ELSE text_embedding
                                        END,
                                        image_embedding = CASE 
                                            WHEN $2::text IS NOT NULL AND $2::text != '' THEN $2::vector(1024)
                                            ELSE image_embedding
                                        END,
                                        updated_at = NOW()
                                    WHERE user_id = $3 AND url = $4
                                """
                                
                                await conn.execute(update_query, text_vec_str, image_vec_str, user_id, url)
                            
                            total_success += 1
                            total_processed += 1
                            print(f"[Backfill] ✅ {total_processed}/{len(items_to_fix)}: [{user_id}] {url[:50]}... "
                                  f"(text={has_text_emb}, image={has_image_emb})")
                        except Exception as e:
                            total_failed += 1
                            total_processed += 1
                            print(f"[Backfill] ❌ {total_processed}/{len(items_to_fix)}: Failed to update [{user_id}] {url[:50]}... - {e}")
                    else:
                        total_failed += 1
                        total_processed += 1
                        print(f"[Backfill] ❌ {total_processed}/{len(items_to_fix)}: No embedding generated for [{item.get('user_id')}] {url[:50]}...")
        
        except Exception as e:
            print(f"[Backfill] Error processing batch {batch_num}: {e}")
            import traceback
            traceback.print_exc()
            total_failed += len(batch)
            total_processed += len(batch)
        
        # 节流：批次之间稍作延迟
        if batch_start + batch_size < len(items_to_fix):
            await asyncio.sleep(1)
    
    print(f"\n[Backfill] Summary:")
    print(f"  - Total processed: {total_processed}")
    print(f"  - Success: {total_success}")
    print(f"  - Failed: {total_failed}")
    print(f"  - Success rate: {total_success/total_processed*100:.1f}%" if total_processed > 0 else "N/A")


async def verify_embeddings_quality(user_filter: Optional[str] = None):
    """验证数据库中的 embedding 质量"""
    pool = await get_pool()
    
    try:
        async with pool.acquire() as conn:
            params = []
            where_clause = ""
            if user_filter:
                where_clause = "WHERE user_id = $1"
                params.append(user_filter)
            
            # 检查 embedding 维度
            query = f"""
                SELECT 
                    COUNT(*) as total_items,
                    COUNT(text_embedding) as items_with_text_emb,
                    COUNT(image_embedding) as items_with_image_emb,
                    COUNT(CASE WHEN text_embedding IS NOT NULL AND image_embedding IS NOT NULL THEN 1 END) as items_with_both
                FROM {TABLE}
                {where_clause}
            """
            
            stats = await conn.fetchrow(query, *params)
            
            total_items = stats['total_items'] or 0
            text_items = stats['items_with_text_emb'] or 0
            image_items = stats['items_with_image_emb'] or 0
            both_items = stats['items_with_both'] or 0
            print(f"[Verify] Embedding Quality Report:")
            print(f"  - Total items: {total_items}")
            if total_items > 0:
                print(f"  - Items with text_embedding: {text_items} ({text_items/total_items*100:.1f}%)")
                print(f"  - Items with image_embedding: {image_items} ({image_items/total_items*100:.1f}%)")
                print(f"  - Items with both: {both_items} ({both_items/total_items*100:.1f}%)")
            else:
                print("  - No items found for current filter.")
            
            # 检查维度是否正确（采样检查）
            sample_query = f"""
                SELECT user_id, url, 
                       array_length(text_embedding::float[], 1) as text_dim,
                       array_length(image_embedding::float[], 1) as image_dim
                FROM {TABLE}
                WHERE (text_embedding IS NOT NULL OR image_embedding IS NOT NULL)
                { "AND user_id = $1" if user_filter else "" }
                LIMIT 10
            """
            
            samples = await conn.fetch(sample_query, *params) if user_filter else await conn.fetch(sample_query)
            if samples:
                print(f"\n[Verify] Sample embedding dimensions:")
                for row in samples:
                    print(f"  - [{row['user_id']}] {row['url'][:50]}...")
                    print(f"    text_embedding: {row['text_dim']} dims" if row['text_dim'] else "    text_embedding: NULL")
                    print(f"    image_embedding: {row['image_dim']} dims" if row['image_dim'] else "    image_embedding: NULL")
    
    except Exception as e:
        print(f"[Verify] Error verifying embeddings: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """主函数"""
    print("=" * 60)
    print("OpenGraph Embedding 诊断与补全工具")
    print("=" * 60)
    print()
    
    # 验证环境变量
    dashscope_api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not dashscope_api_key:
        print("❌ ERROR: DASHSCOPE_API_KEY not found in environment variables!")
        print("   Please make sure:")
        print("   1. .env file exists in backend/app/ directory")
        print("   2. DASHSCOPE_API_KEY is set in .env file")
        print("   3. .env file is in the correct format: DASHSCOPE_API_KEY=your_key_here")
        return
    
    print(f"✅ DASHSCOPE_API_KEY found (length: {len(dashscope_api_key)})")
    print()
    
    target_user = os.getenv("DIAGNOSE_USER_ID")
    if target_user:
        print(f"🔐 Target user: {target_user}")
    else:
        print("🔍 Target user: ALL users (set DIAGNOSE_USER_ID to filter)")
    print()
    
    try:
        # 步骤1：诊断
        print("[Step 1] Diagnosing missing embeddings...")
        items = await diagnose_missing_embeddings(target_user)
        
        if not items:
            print("[Step 1] ✅ No items missing embeddings!")
            return
        
        print()
        
        # 步骤2：验证质量
        print("[Step 2] Verifying embedding quality...")
        await verify_embeddings_quality(target_user)
        
        print()
        
        # 步骤3：询问是否补全
        print(f"[Step 3] Found {len(items)} items missing embeddings.")
        confirm = input("Do you want to backfill embeddings? (y/n): ").strip().lower()
        
        if confirm == 'y':
            print()
            await backfill_embeddings(items)
            print()
            print("[Step 4] Re-verifying after backfill...")
            await verify_embeddings_quality(target_user)
        else:
            print("[Step 3] Skipping backfill.")
    
    finally:
        # 关闭连接池
        await close_pool()
        print("\n[Main] Connection pool closed.")


if __name__ == "__main__":
    asyncio.run(main())

