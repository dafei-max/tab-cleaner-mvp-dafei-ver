"""
阿里云 Analytics Database 向量数据库集成
用于存储和检索 OpenGraph 数据的 embedding 向量
"""
import os
import asyncpg
import json
from typing import Dict, List, Optional, Tuple
import numpy as np
from datetime import datetime

# 数据库连接配置
DB_HOST = os.getenv("ADBPG_HOST", "gp-uf6j424dtk2ww5291o-master.gpdb.rds.aliyuncs.com")
DB_PORT = int(os.getenv("ADBPG_PORT", "5432"))
DB_NAME = os.getenv("ADBPG_DBNAME", "postgres")
DB_USER = os.getenv("ADBPG_USER", "cleantab_db")
DB_PASSWORD = os.getenv("ADBPG_PASSWORD", "CleanTabV5")
NAMESPACE = os.getenv("ADBPG_NAMESPACE", "cleantab")

# 连接池
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """获取数据库连接池（单例）"""
    global _pool
    if _pool is None:
        if not DB_HOST:
            raise ValueError("ADBPG_HOST environment variable not set")
        _pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            min_size=2,
            max_size=10,
            ssl="disable",  # 根据用户提供的连接字符串
        )
    return _pool


async def close_pool():
    """关闭连接池"""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_schema():
    """初始化数据库表结构"""
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 确保 namespace 存在
            await conn.execute(f"""
                CREATE SCHEMA IF NOT EXISTS {NAMESPACE};
            """)
            
            # 检查表是否存在
            table_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = '{NAMESPACE}' 
                    AND table_name = 'opengraph_items'
                );
            """)
            
            if not table_exists:
                # 表不存在，创建新表
                await conn.execute(f"""
                    CREATE TABLE {NAMESPACE}.opengraph_items (
                        id SERIAL PRIMARY KEY,
                        url TEXT NOT NULL,
                        title TEXT,
                        description TEXT,
                        image TEXT,
                        site_name TEXT,
                        tab_id INTEGER,
                        tab_title TEXT,
                        text_embedding vector(1024),
                        image_embedding vector(1024),
                        metadata JSONB,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        CONSTRAINT opengraph_items_url_unique UNIQUE (url)
                    );
                """)
                print(f"[VectorDB] Created new table: {NAMESPACE}.opengraph_items")
            else:
                # 表已存在，检查并添加缺失的约束
                print(f"[VectorDB] Table {NAMESPACE}.opengraph_items already exists, checking constraints...")
                
                # 检查 UNIQUE 约束是否存在
                unique_constraint_exists = await conn.fetchval(f"""
                    SELECT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conrelid = '{NAMESPACE}.opengraph_items'::regclass 
                        AND conname = 'opengraph_items_url_unique'
                    );
                """)
                
                if not unique_constraint_exists:
                    try:
                        # 添加 UNIQUE 约束（如果列中已有重复值会失败）
                        await conn.execute(f"""
                            ALTER TABLE {NAMESPACE}.opengraph_items 
                            ADD CONSTRAINT opengraph_items_url_unique UNIQUE (url);
                        """)
                        print(f"[VectorDB] Added UNIQUE constraint on url column")
                    except Exception as e:
                        print(f"[VectorDB] Warning: Could not add UNIQUE constraint: {e}")
                        print(f"[VectorDB] This may be due to duplicate URLs in existing data")
                
                # 检查并添加缺失的列（如果需要）
                # 这里可以添加逻辑来检查列是否存在，如果不存在则添加
            
            # 创建索引（无论表是新创建还是已存在）
            await conn.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_opengraph_url 
                ON {NAMESPACE}.opengraph_items(url);
            """)
            
            # 创建向量索引（用于相似度搜索）
            # 注意：如果表中有数据，索引创建可能需要一些时间
            try:
                await conn.execute(f"""
                    CREATE INDEX IF NOT EXISTS idx_text_embedding 
                    ON {NAMESPACE}.opengraph_items 
                    USING ivfflat (text_embedding vector_cosine_ops)
                    WITH (lists = 100);
                """)
            except Exception as e:
                print(f"[VectorDB] Warning: Could not create text_embedding index: {e}")
            
            try:
                await conn.execute(f"""
                    CREATE INDEX IF NOT EXISTS idx_image_embedding 
                    ON {NAMESPACE}.opengraph_items 
                    USING ivfflat (image_embedding vector_cosine_ops)
                    WITH (lists = 100);
                """)
            except Exception as e:
                print(f"[VectorDB] Warning: Could not create image_embedding index: {e}")
            
            print(f"[VectorDB] ✓ Schema initialized for namespace: {NAMESPACE}")
    except Exception as e:
        print(f"[VectorDB] Error initializing schema: {e}")
        import traceback
        traceback.print_exc()
        raise


async def upsert_opengraph_item(
    url: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    image: Optional[str] = None,
    site_name: Optional[str] = None,
    tab_id: Optional[int] = None,
    tab_title: Optional[str] = None,
    text_embedding: Optional[List[float]] = None,
    image_embedding: Optional[List[float]] = None,
    metadata: Optional[Dict] = None,
) -> bool:
    """
    插入或更新 OpenGraph 数据
    
    Args:
        url: 网页 URL（唯一标识）
        title: 标题
        description: 描述
        image: 图片 URL 或 Base64
        site_name: 站点名称
        tab_id: 标签页 ID
        tab_title: 标签页标题
        text_embedding: 文本 embedding 向量（1024维）
        image_embedding: 图像 embedding 向量（1024维）
        metadata: 其他元数据
    
    Returns:
        是否成功
    """
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 准备 metadata
            metadata_json = json.dumps(metadata or {})
            
            # 如果 embedding 存在，直接使用列表（asyncpg 会自动转换为 vector 类型）
            text_vec = text_embedding if text_embedding else None
            image_vec = image_embedding if image_embedding else None
            
            # 使用 INSERT ... ON CONFLICT 实现 upsert
            await conn.execute(f"""
                INSERT INTO {NAMESPACE}.opengraph_items (
                    url, title, description, image, site_name,
                    tab_id, tab_title, text_embedding, image_embedding, metadata, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector(1024), $9::vector(1024), $10::jsonb, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    image = EXCLUDED.image,
                    site_name = EXCLUDED.site_name,
                    tab_id = EXCLUDED.tab_id,
                    tab_title = EXCLUDED.tab_title,
                    text_embedding = EXCLUDED.text_embedding,
                    image_embedding = EXCLUDED.image_embedding,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW();
            """, url, title, description, image, site_name,
                tab_id, tab_title, text_vec, image_vec, metadata_json)
            
            return True
    except Exception as e:
        print(f"[VectorDB] Error upserting item {url[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return False


async def get_opengraph_item(url: str) -> Optional[Dict]:
    """
    根据 URL 获取 OpenGraph 数据（包括 embedding）
    
    Args:
        url: 网页 URL
    
    Returns:
        OpenGraph 数据字典，如果不存在返回 None
    """
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(f"""
                SELECT url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata
                FROM {NAMESPACE}.opengraph_items
                WHERE url = $1;
            """, url)
            
            if not row:
                return None
            
            # 转换 vector 类型为列表
            result = dict(row)
            if result.get('text_embedding'):
                result['text_embedding'] = list(result['text_embedding'])
            if result.get('image_embedding'):
                result['image_embedding'] = list(result['image_embedding'])
            if result.get('metadata'):
                result['metadata'] = json.loads(result['metadata']) if isinstance(result['metadata'], str) else result['metadata']
            
            return result
    except Exception as e:
        print(f"[VectorDB] Error getting item {url[:50]}...: {e}")
        return None


async def search_by_text_embedding(
    query_embedding: List[float],
    top_k: int = 20,
    threshold: float = 0.0
) -> List[Dict]:
    """
    根据文本 embedding 进行相似度搜索
    
    Args:
        query_embedding: 查询文本的 embedding 向量（1024维）
        top_k: 返回前 K 个结果
        threshold: 相似度阈值（0-1）
    
    Returns:
        相似度排序的结果列表
    """
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata,
                       1 - (text_embedding <=> $1::vector(1024)) AS similarity
                FROM {NAMESPACE}.opengraph_items
                WHERE text_embedding IS NOT NULL
                  AND (1 - (text_embedding <=> $1::vector(1024))) >= $2
                ORDER BY text_embedding <=> $1::vector(1024)
                LIMIT $3;
            """, query_embedding, threshold, top_k)
            
            results = []
            for row in rows:
                item = dict(row)
                if item.get('text_embedding'):
                    item['text_embedding'] = list(item['text_embedding'])
                if item.get('image_embedding'):
                    item['image_embedding'] = list(item['image_embedding'])
                if item.get('metadata'):
                    item['metadata'] = json.loads(item['metadata']) if isinstance(item['metadata'], str) else item['metadata']
                results.append(item)
            
            return results
    except Exception as e:
        print(f"[VectorDB] Error searching by text embedding: {e}")
        import traceback
        traceback.print_exc()
        return []


async def search_by_image_embedding(
    query_embedding: List[float],
    top_k: int = 20,
    threshold: float = 0.0
) -> List[Dict]:
    """
    根据图像 embedding 进行相似度搜索
    
    Args:
        query_embedding: 查询图像的 embedding 向量（1024维）
        top_k: 返回前 K 个结果
        threshold: 相似度阈值（0-1）
    
    Returns:
        相似度排序的结果列表
    """
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata,
                       1 - (image_embedding <=> $1::vector(1024)) AS similarity
                FROM {NAMESPACE}.opengraph_items
                WHERE image_embedding IS NOT NULL
                  AND (1 - (image_embedding <=> $1::vector(1024))) >= $2
                ORDER BY image_embedding <=> $1::vector(1024)
                LIMIT $3;
            """, query_embedding, threshold, top_k)
            
            results = []
            for row in rows:
                item = dict(row)
                if item.get('text_embedding'):
                    item['text_embedding'] = list(item['text_embedding'])
                if item.get('image_embedding'):
                    item['image_embedding'] = list(item['image_embedding'])
                if item.get('metadata'):
                    item['metadata'] = json.loads(item['metadata']) if isinstance(item['metadata'], str) else item['metadata']
                results.append(item)
            
            return results
    except Exception as e:
        print(f"[VectorDB] Error searching by image embedding: {e}")
        import traceback
        traceback.print_exc()
        return []


async def batch_upsert_items(items: List[Dict]) -> int:
    """
    批量插入或更新 OpenGraph 数据
    
    Args:
        items: OpenGraph 数据列表（每个包含 url, title, description 等字段）
    
    Returns:
        成功插入/更新的数量
    """
    success_count = 0
    for item in items:
        if await upsert_opengraph_item(
            url=item.get("url"),
            title=item.get("title"),
            description=item.get("description"),
            image=item.get("image"),
            site_name=item.get("site_name"),
            tab_id=item.get("tab_id"),
            tab_title=item.get("tab_title"),
            text_embedding=item.get("text_embedding"),
            image_embedding=item.get("image_embedding"),
            metadata=item.get("metadata"),
        ):
            success_count += 1
    return success_count

