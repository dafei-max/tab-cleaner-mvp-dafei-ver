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


def to_vector_str(vec: Optional[List[float]]) -> Optional[str]:
    """
    Convert a Python list[float] into the string format expected by ADBPG's vector(1024) type.
    For example: [0.1, 0.2, 0.3] -> "[0.1,0.2,0.3]".
    If vec is falsy or empty, return None.
    """
    if not vec:
        return None
    return "[" + ",".join(str(float(x)) for x in vec) + "]"

# 数据库连接配置
DB_HOST = os.getenv("ADBPG_HOST", "gp-uf6j424dtk2ww5291o-master.gpdb.rds.aliyuncs.com")
DB_PORT = int(os.getenv("ADBPG_PORT", "5432"))
# 注意：数据库名称由环境变量 ADBPG_DBNAME 决定

# 如果使用 Namespace，数据会存储在对应数据库的 Schema 中
# 实际表路径 = {ADBPG_DBNAME}.{ADBPG_NAMESPACE}.opengraph_items
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


async def drop_table_if_exists():
    """
    手动删除表（用于修复约束冲突问题）
    注意：这会删除表中的所有数据！
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(f"DROP TABLE IF EXISTS {NAMESPACE}.opengraph_items CASCADE;")
            print(f"[VectorDB] ✓ Dropped table {NAMESPACE}.opengraph_items")
            return True
    except Exception as e:
        print(f"[VectorDB] Error dropping table: {e}")
        import traceback
        traceback.print_exc()
        return False


async def check_table_constraints(conn) -> Tuple[bool, Optional[str]]:
    """
    检查表约束是否符合 Greenplum/ADBPG 要求
    返回: (is_valid, error_message)
    """
    try:
        # 检查 PRIMARY KEY 约束数量
        pk_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_schema = '{NAMESPACE}'
              AND table_name = 'opengraph_items'
              AND constraint_type = 'PRIMARY KEY';
        """)
        
        # 检查 UNIQUE 约束数量（不包括 PRIMARY KEY）
        unique_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_schema = '{NAMESPACE}'
              AND table_name = 'opengraph_items'
              AND constraint_type = 'UNIQUE';
        """)
        
        total_constraints = pk_count + unique_count
        
        if total_constraints > 1:
            # 获取所有约束的列信息
            constraints_info = await conn.fetch(f"""
                SELECT 
                    tc.constraint_name,
                    tc.constraint_type,
                    string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = '{NAMESPACE}'
                  AND tc.table_name = 'opengraph_items'
                  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
                GROUP BY tc.constraint_name, tc.constraint_type
                ORDER BY tc.constraint_type, tc.constraint_name;
            """)
            
            constraint_details = "\n".join([
                f"  - {row['constraint_type']}: {row['constraint_name']} on ({row['columns']})"
                for row in constraints_info
            ])
            
            error_msg = (
                f"[VectorDB] ✗ Table has {total_constraints} PRIMARY KEY/UNIQUE constraints!\n"
                f"[VectorDB] ✗ Greenplum/ADBPG requires all constraints to share at least one column.\n"
                f"[VectorDB] ✗ Found constraints:\n{constraint_details}\n"
                f"[VectorDB] ✗ Solution: Drop the table and recreate it with only one PRIMARY KEY on 'url'.\n"
                f"[VectorDB] ✗ Run: DROP TABLE IF EXISTS {NAMESPACE}.opengraph_items;"
            )
            return False, error_msg
        
        return True, None
    except Exception as e:
        # 如果查询失败，假设表结构可能有问题
        return False, f"Failed to check constraints: {e}"


async def init_schema():
    """初始化数据库表结构"""
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 注意：在阿里云 ADB PostgreSQL 中，Namespace 应该通过 API 创建
            # 如果 Namespace 已通过 API 创建，对应的 Schema 会自动存在于当前连接的数据库中
            # 实际数据库由 ADBPG_DBNAME 环境变量决定（可能是 postgres 或 knowledgebase）
            # 这里只检查 Schema 是否存在，如果不存在会报错（需要先通过 API 创建 Namespace）
            schema_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.schemata 
                    WHERE schema_name = '{NAMESPACE}'
                );
            """)
            
            if not schema_exists:
                error_msg = (
                    f"[VectorDB] ✗ Schema '{NAMESPACE}' does not exist!\n"
                    f"[VectorDB] ✗ In Alibaba Cloud ADB PostgreSQL, Namespace must be created via API first.\n"
                    f"[VectorDB] ✗ Please run: python init_vector.py to create the namespace\n"
                    f"[VectorDB] ✗ Or use the Alibaba Cloud API: CreateNamespace"
                )
                print(error_msg)
                raise ValueError(f"Schema '{NAMESPACE}' does not exist. Please create Namespace via API first.")
            
            print(f"[VectorDB] ✓ Schema '{NAMESPACE}' exists (Namespace created via API)")
            
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
                # 注意：阿里云 ADB PostgreSQL 要求多个 PRIMARY KEY/UNIQUE 约束必须有共同列
                # 因此使用 url 作为 PRIMARY KEY，不再需要额外的 UNIQUE 约束
                await conn.execute(f"""
                    CREATE TABLE {NAMESPACE}.opengraph_items (
                        url TEXT PRIMARY KEY,
                        title TEXT,
                        description TEXT,
                        image TEXT,
                        screenshot_image TEXT,
                        site_name TEXT,
                        tab_id INTEGER,
                        tab_title TEXT,
                        text_embedding vector(1024),
                        image_embedding vector(1024),
                        metadata JSONB,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    );
                """)
                print(f"[VectorDB] ✓ Created new table: {NAMESPACE}.opengraph_items")
            else:
                # 表已存在，检查约束是否符合要求
                print(f"[VectorDB] ✓ Table {NAMESPACE}.opengraph_items already exists")
                is_valid, error_msg = await check_table_constraints(conn)
                
                # 检查并添加 screenshot_image 字段（如果不存在）
                column_exists = await conn.fetchval(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = '{NAMESPACE}' 
                        AND table_name = 'opengraph_items'
                        AND column_name = 'screenshot_image'
                    );
                """)
                if not column_exists:
                    await conn.execute(f"""
                        ALTER TABLE {NAMESPACE}.opengraph_items 
                        ADD COLUMN screenshot_image TEXT;
                    """)
                    print(f"[VectorDB] ✓ Added screenshot_image column to {NAMESPACE}.opengraph_items")
                
                if not is_valid:
                    # 检查是否设置了强制重建标志
                    force_recreate = os.getenv("VECTOR_DB_FORCE_RECREATE", "false").lower() == "true"
                    
                    if force_recreate:
                        print(f"[VectorDB] ⚠ Force recreate enabled, dropping existing table...")
                        await conn.execute(f"DROP TABLE IF EXISTS {NAMESPACE}.opengraph_items CASCADE;")
                        print(f"[VectorDB] ✓ Dropped existing table")
                        
                        # 重新创建表
                        await conn.execute(f"""
                            CREATE TABLE {NAMESPACE}.opengraph_items (
                                url TEXT PRIMARY KEY,
                                title TEXT,
                                description TEXT,
                                image TEXT,
                                screenshot_image TEXT,
                                site_name TEXT,
                                tab_id INTEGER,
                                tab_title TEXT,
                                text_embedding vector(1024),
                                image_embedding vector(1024),
                                metadata JSONB,
                                created_at TIMESTAMP DEFAULT NOW(),
                                updated_at TIMESTAMP DEFAULT NOW()
                            );
                        """)
                        print(f"[VectorDB] ✓ Recreated table: {NAMESPACE}.opengraph_items")
                    else:
                        # 打印错误信息并抛出异常
                        print(error_msg)
                        raise ValueError(
                            f"Table {NAMESPACE}.opengraph_items has incompatible constraints. "
                            f"Set VECTOR_DB_FORCE_RECREATE=true to automatically drop and recreate, "
                            f"or manually run: DROP TABLE IF EXISTS {NAMESPACE}.opengraph_items;"
                        )
                else:
                    print(f"[VectorDB] ✓ Table constraints are valid (single PRIMARY KEY on 'url')")
            
            # 创建索引（无论表是新创建还是已存在）
            try:
                await conn.execute(f"""
                    CREATE INDEX idx_opengraph_url 
                    ON {NAMESPACE}.opengraph_items(url);
                """)
            except Exception as e:
                # 比如已经存在就会报错，这里直接打印 warning 然后继续
                print(f"[VectorDB] Warning: could not create idx_opengraph_url: {e}")
            
            # 创建向量索引（用于相似度搜索）
            # 注意：如果表中有数据，索引创建可能需要一些时间
            # 使用阿里云 AnalyticDB 的 FastANN 索引（HNSW，关闭 PQ）
            try:
                await conn.execute(f"""
                    CREATE INDEX idx_text_embedding_cosine
                    ON {NAMESPACE}.opengraph_items
                    USING ann(text_embedding)
                    WITH (
                        distancemeasure = cosine,
                        hnsw_m           = 64,
                        pq_enable        = 0      -- ✨ 关闭 PQ
                    );
                """)
            except Exception as e:
                print(f"[VectorDB] Warning: Could not create text_embedding index: {e}")
            
            try:
                await conn.execute(f"""
                    CREATE INDEX idx_image_embedding_cosine
                    ON {NAMESPACE}.opengraph_items
                    USING ann(image_embedding)
                    WITH (
                        distancemeasure = cosine,
                        hnsw_m           = 64,
                        pq_enable        = 0      -- ✨ 关闭 PQ
                    );
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


async def update_opengraph_item_screenshot(url: str, screenshot_image: str) -> bool:
    """
    更新 OpenGraph item 的截图字段
    
    Args:
        url: 网页 URL
        screenshot_image: 截图的 Base64 data URL
    
    Returns:
        成功返回 True，失败返回 False
    """
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            await conn.execute(f"""
                UPDATE {NAMESPACE}.opengraph_items
                SET screenshot_image = $1,
                    updated_at = NOW()
                WHERE url = $2;
            """, screenshot_image, url)
            
            return True
    except Exception as e:
        print(f"[VectorDB] Error updating screenshot for {url[:50]}...: {e}")
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
                SELECT url, title, description, image, screenshot_image, site_name,
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

