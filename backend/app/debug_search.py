"""
调试脚本：定位搜索准确率低的原因

使用方法：
    python debug_search.py
"""

import asyncio
import sys
import os
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from search.pipeline import search_relevant_items
from search.embed import embed_text
from search.fuse import cosine_similarity


async def debug_search(query: str, items: List[Dict]):
    """调试搜索过程"""
    
    print(f"\n{'='*60}")
    print(f"Debug Query: '{query}'")
    print(f"{'='*60}\n")
    
    # 步骤1：生成查询向量
    print("[1] Generating query vector...")
    query_vec = await embed_text(query)
    
    if not query_vec:
        print("❌ Query vector is None!")
        return
    
    print(f"✅ Query vector: {len(query_vec)} dims")
    print(f"   First 5 values: {query_vec[:5]}")
    norm = sum(x**2 for x in query_vec)**0.5
    print(f"   Norm: {norm:.6f}")
    
    # 步骤2：检查文档 embedding
    print(f"\n[2] Checking document embeddings...")
    docs_with_text = [d for d in items if d.get('text_embedding')]
    docs_with_image = [d for d in items if d.get('image_embedding')]
    
    print(f"   Docs with text_embedding: {len(docs_with_text)}/{len(items)}")
    print(f"   Docs with image_embedding: {len(docs_with_image)}/{len(items)}")
    
    if docs_with_text:
        sample = docs_with_text[0]
        text_emb = sample.get('text_embedding')
        if isinstance(text_emb, list) and len(text_emb) > 0:
            print(f"   Sample text_embedding: {len(text_emb)} dims")
            print(f"   First 5 values: {text_emb[:5]}")
            sample_norm = sum(x**2 for x in text_emb)**0.5
            print(f"   Sample norm: {sample_norm:.6f}")
    
    # 步骤3：计算相似度
    print(f"\n[3] Computing similarities...")
    
    for idx, doc in enumerate(items[:5]):
        title = doc.get('title', 'Unknown')[:30]
        
        text_sim = 0.0
        text_emb = doc.get('text_embedding')
        if text_emb and isinstance(text_emb, list) and len(text_emb) > 0:
            text_sim = cosine_similarity(query_vec, text_emb, verbose=(idx == 0))
        
        image_sim = 0.0
        image_emb = doc.get('image_embedding')
        if image_emb and isinstance(image_emb, list) and len(image_emb) > 0:
            image_sim = cosine_similarity(query_vec, image_emb, verbose=(idx == 0))
        
        print(f"   Doc {idx}: '{title}'")
        print(f"      text_sim={text_sim:.6f}, image_sim={image_sim:.6f}")
    
    # 步骤4：执行完整搜索
    print(f"\n[4] Running full search...")
    results = await search_relevant_items(
        query_text=query,
        opengraph_items=items,
        top_k=10
    )
    
    print(f"\n[5] Search Results:")
    for idx, item in enumerate(results[:5]):
        title = item.get('title', 'Unknown')[:40]
        sim = item.get('similarity', 0.0)
        url = item.get('url', '')[:50]
        print(f"   {idx+1}. '{title}': {sim:.6f}")
        print(f"      URL: {url}")


async def main():
    """主函数：从数据库读取数据并调试搜索"""
    from vector_db import get_pool, close_pool, ACTIVE_TABLE
    
    print("=" * 60)
    print("搜索调试工具")
    print("=" * 60)
    print()
    
    # 从数据库读取一些示例数据
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            # 读取前 20 条有 embedding 的记录
            query = f"""
                SELECT url, title, description, image, 
                       text_embedding, image_embedding, metadata
                FROM {ACTIVE_TABLE}
                WHERE (text_embedding IS NOT NULL OR image_embedding IS NOT NULL)
                  AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 20
            """
            rows = await conn.fetch(query)
            
            if not rows:
                print("❌ 数据库中没有找到有 embedding 的记录")
                print("   请先运行 diagnose_embeddings.py 检查并补全 embedding")
                return
            
            print(f"✅ 从数据库读取了 {len(rows)} 条记录")
            
            # 转换为字典格式
            items = []
            for row in rows:
                item = dict(row)
                # 确保 embedding 是列表格式
                if item.get('text_embedding'):
                    if not isinstance(item['text_embedding'], list):
                        # 如果是字符串或其他格式，尝试转换
                        import json
                        if isinstance(item['text_embedding'], str):
                            try:
                                item['text_embedding'] = json.loads(item['text_embedding'])
                            except:
                                item['text_embedding'] = None
                
                if item.get('image_embedding'):
                    if not isinstance(item['image_embedding'], list):
                        import json
                        if isinstance(item['image_embedding'], str):
                            try:
                                item['image_embedding'] = json.loads(item['image_embedding'])
                            except:
                                item['image_embedding'] = None
                
                items.append(item)
            
            # 测试查询
            test_queries = [
                "蓝色",
                "设计",
                "椅子",
            ]
            
            for query in test_queries:
                await debug_search(query, items)
                print("\n" + "="*60 + "\n")
    
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

