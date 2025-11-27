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

# 表名（支持通过环境变量覆盖，默认使用 v2 表）
ACTIVE_TABLE_NAME = os.getenv("VECTOR_DB_ACTIVE_TABLE", "opengraph_items_v2")
LEGACY_TABLE_NAME = "opengraph_items"

def _qualified(table_name: str) -> str:
    return f"{NAMESPACE}.{table_name}"

ACTIVE_TABLE = _qualified(ACTIVE_TABLE_NAME)
LEGACY_TABLE = _qualified(LEGACY_TABLE_NAME)

# 连接池
_pool: Optional[asyncpg.Pool] = None

def _normalize_user_id(user_id: Optional[str]) -> str:
    value = (user_id or "anonymous").strip()
    return value or "anonymous"

def _row_to_dict(row: asyncpg.Record) -> Dict:
    item = dict(row)
    if item.get("text_embedding"):
        item["text_embedding"] = list(item["text_embedding"])
    if item.get("image_embedding"):
        item["image_embedding"] = list(item["image_embedding"])
    if item.get("metadata"):
        item["metadata"] = json.loads(item["metadata"]) if isinstance(item["metadata"], str) else item["metadata"]
    return item

async def _create_index(conn, description: str, sql: str):
    try:
        await conn.execute(sql)
    except Exception as e:
        print(f"[VectorDB] Warning: could not create {description}: {e}")


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
            await conn.execute(f"DROP TABLE IF EXISTS {ACTIVE_TABLE} CASCADE;")
            print(f"[VectorDB] ✓ Dropped table {ACTIVE_TABLE}")
            return True
    except Exception as e:
        print(f"[VectorDB] Error dropping table: {e}")
        import traceback
        traceback.print_exc()
        return False


async def check_table_constraints(conn, table_name: str = ACTIVE_TABLE_NAME) -> Tuple[bool, Optional[str]]:
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
              AND table_name = '{table_name}'
              AND constraint_type = 'PRIMARY KEY';
        """)
        
        # 检查 UNIQUE 约束数量（不包括 PRIMARY KEY）
        unique_count = await conn.fetchval(f"""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_schema = '{NAMESPACE}'
              AND table_name = '{table_name}'
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
                  AND tc.table_name = '{table_name}'
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
                f"[VectorDB] ✗ Solution: Drop the table and recreate it with only one PRIMARY KEY on the same column set.\n"
                f"[VectorDB] ✗ Run: DROP TABLE IF EXISTS {_qualified(table_name)};"
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
            
            # 检查 v2 表是否存在
            table_exists = await conn.fetchval(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = '{NAMESPACE}' 
                      AND table_name = '{ACTIVE_TABLE_NAME}'
                );
            """)
            
            if not table_exists:
                await conn.execute(f"""
                    CREATE TABLE {ACTIVE_TABLE} (
                        user_id TEXT NOT NULL,
                        url TEXT NOT NULL,
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
                        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
                        deleted_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        PRIMARY KEY (user_id, url)
                    );
                """)
                print(f"[VectorDB] ✓ Created new table: {ACTIVE_TABLE}")
            else:
                print(f"[VectorDB] ✓ Table {ACTIVE_TABLE} already exists")
                # 确保 user_id 列存在
                user_column_exists = await conn.fetchval(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = '{NAMESPACE}'
                          AND table_name = '{ACTIVE_TABLE_NAME}'
                          AND column_name = 'user_id'
                    );
                """)
                if not user_column_exists:
                    raise ValueError(f"[VectorDB] ✗ Table {ACTIVE_TABLE} exists but missing user_id column. Please recreate table manually.")
                
                # 添加软删除字段（如果不存在）
                status_column_exists = await conn.fetchval(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = '{NAMESPACE}'
                          AND table_name = '{ACTIVE_TABLE_NAME}'
                          AND column_name = 'status'
                    );
                """)
                if not status_column_exists:
                    await conn.execute(f"""
                        ALTER TABLE {ACTIVE_TABLE}
                        ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted'));
                    """)
                    print(f"[VectorDB] ✓ Added status column to {ACTIVE_TABLE}")
                
                deleted_at_column_exists = await conn.fetchval(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = '{NAMESPACE}'
                          AND table_name = '{ACTIVE_TABLE_NAME}'
                          AND column_name = 'deleted_at'
                    );
                """)
                if not deleted_at_column_exists:
                    await conn.execute(f"""
                        ALTER TABLE {ACTIVE_TABLE}
                        ADD COLUMN deleted_at TIMESTAMP;
                    """)
                    print(f"[VectorDB] ✓ Added deleted_at column to {ACTIVE_TABLE}")
            
            # 创建必要索引（忽略已存在的错误）
            await _create_index(
                conn,
                "user_id index",
                f"CREATE INDEX idx_{ACTIVE_TABLE_NAME}_user_id ON {ACTIVE_TABLE}(user_id);"
            )
            
            await _create_index(
                conn,
                "text embedding index",
                f"""
                CREATE INDEX idx_{ACTIVE_TABLE_NAME}_text_embedding
                ON {ACTIVE_TABLE}
                USING ann(text_embedding)
                WITH (
                    distancemeasure = cosine,
                    hnsw_m           = 64,
                    pq_enable        = 0
                );
                """
            )
            
            await _create_index(
                conn,
                "image embedding index",
                f"""
                CREATE INDEX idx_{ACTIVE_TABLE_NAME}_image_embedding
                ON {ACTIVE_TABLE}
                USING ann(image_embedding)
                WITH (
                    distancemeasure = cosine,
                    hnsw_m           = 64,
                    pq_enable        = 0
                );
                """
            )
            
            print(f"[VectorDB] ✓ Schema initialized for namespace: {NAMESPACE} (table={ACTIVE_TABLE})")
    except Exception as e:
        print(f"[VectorDB] Error initializing schema: {e}")
        import traceback
        traceback.print_exc()
        raise


async def upsert_opengraph_item(
    user_id: Optional[str],
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
        image: 图片 URL 或 Base64（必须是字符串，不能是数组）
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
        # ✅ 类型验证和规范化
        # 确保 image 是字符串，不是数组
        if image is not None:
            if isinstance(image, list):
                # 如果是数组，取第一个元素
                if len(image) > 0:
                    image = str(image[0]).strip()
                else:
                    image = None
            elif not isinstance(image, str):
                image = str(image).strip() if image else None
            else:
                image = image.strip() if image.strip() else None
        
        # 确保字符串字段不是 None（转换为空字符串）
        title = str(title).strip() if title else None
        description = str(description).strip() if description else None
        site_name = str(site_name).strip() if site_name else None
        tab_title = str(tab_title).strip() if tab_title else None
        
        # 确保 tab_id 是整数或 None
        if tab_id is not None:
            try:
                tab_id = int(tab_id)
            except (ValueError, TypeError):
                tab_id = None
        
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 准备 metadata
            metadata_json = json.dumps(metadata or {})
            
            # 将 embedding 列表转换为 ADBPG 需要的字符串格式
            text_vec = to_vector_str(text_embedding)
            image_vec = to_vector_str(image_embedding)
            
            # 使用 INSERT ... ON CONFLICT 实现 upsert
            # 如果记录已存在且被软删除，恢复为 active
            await conn.execute(f"""
                INSERT INTO {ACTIVE_TABLE} (
                    user_id, url, title, description, image, site_name,
                    tab_id, tab_title, text_embedding, image_embedding, metadata, 
                    status, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector(1024), $10::vector(1024), $11::jsonb, 'active', NOW())
                ON CONFLICT (user_id, url) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    image = EXCLUDED.image,
                    site_name = EXCLUDED.site_name,
                    tab_id = EXCLUDED.tab_id,
                    tab_title = EXCLUDED.tab_title,
                    text_embedding = EXCLUDED.text_embedding,
                    image_embedding = EXCLUDED.image_embedding,
                    metadata = EXCLUDED.metadata,
                    status = 'active',
                    deleted_at = NULL,
                    updated_at = NOW();
            """, user_id, url, title, description, image, site_name,
                tab_id, tab_title, text_vec, image_vec, metadata_json)
            
            return True
    except Exception as e:
        print(f"[VectorDB] Error upserting item {url[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return False


async def update_opengraph_item_screenshot(user_id: Optional[str], url: str, screenshot_image: str) -> bool:
    """
    更新 OpenGraph item 的截图字段
    
    Args:
        url: 网页 URL
        screenshot_image: 截图的 Base64 data URL
    
    Returns:
        成功返回 True，失败返回 False
    """
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            await conn.execute(f"""
                UPDATE {ACTIVE_TABLE}
                SET screenshot_image = $1,
                    updated_at = NOW()
                WHERE user_id = $2 AND url = $3;
            """, screenshot_image, user_id, url)
            
            return True
    except Exception as e:
        print(f"[VectorDB] Error updating screenshot for {url[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return False


async def get_opengraph_item(user_id: Optional[str], url: str) -> Optional[Dict]:
    """
    根据 URL 获取 OpenGraph 数据（包括 embedding）
    
    Args:
        url: 网页 URL
    
    Returns:
        OpenGraph 数据字典，如果不存在返回 None
    """
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(f"""
                SELECT user_id, url, title, description, image, screenshot_image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND url = $2 AND status = 'active';
            """, user_id, url)
            
            if not row:
                return None
            
            # 转换 vector 类型为列表
            return _row_to_dict(row)
    except Exception as e:
        print(f"[VectorDB] Error getting item {url[:50]}...: {e}")
        return None


async def get_items_by_urls(user_id: Optional[str], urls: List[str]) -> List[Dict]:
    """
    批量根据 URL 列表获取 OpenGraph 数据（包括 embedding）
    
    Args:
        urls: 网页 URL 列表
    
    Returns:
        OpenGraph 数据字典列表
    """
    if not urls:
        return []
    
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 使用 IN 查询批量获取（只返回 active 记录）
            placeholders = ','.join([f'${i+1}' for i in range(len(urls))])
            rows = await conn.fetch(f"""
                SELECT user_id, url, title, description, image, screenshot_image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata
                FROM {ACTIVE_TABLE}
                WHERE user_id = ${len(urls)+1} AND url IN ({placeholders}) AND status = 'active';
            """, *urls, user_id)
            
            results = []
            for row in rows:
                results.append(_row_to_dict(row))
            
            return results
    except Exception as e:
        print(f"[VectorDB] Error getting items by URLs: {e}")
        import traceback
        traceback.print_exc()
        return []


async def search_by_text_embedding(
    user_id: Optional[str],
    query_embedding: List[float],
    top_k: int = 20,
    threshold: float = 0.0
) -> List[Dict]:
    """
    根据文本 embedding 进行相似度搜索（严格按用户隔离）
    
    Args:
        user_id: 用户ID
        query_embedding: 查询文本的 embedding 向量（1024维）
        top_k: 返回前 K 个结果
        threshold: 相似度阈值（0-1）
    
    Returns:
        相似度排序的结果列表
    """
    try:
        normalized_user = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            query_vec = to_vector_str(query_embedding)
            
            rows = await conn.fetch(f"""
                SELECT user_id, url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata,
                       1 - (text_embedding <=> $1::vector(1024)) AS similarity
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $2
                  AND text_embedding IS NOT NULL
                  AND (1 - (text_embedding <=> $1::vector(1024))) >= $3
                ORDER BY text_embedding <=> $1::vector(1024)
                LIMIT $4;
            """, query_vec, normalized_user, threshold, top_k)
            
            results = []
            for row in rows:
                item = _row_to_dict(row)
                results.append(item)
            
            return results
    except Exception as e:
        print(f"[VectorDB] Error searching by text embedding: {e}")
        import traceback
        traceback.print_exc()
        return []


async def search_by_image_embedding(
    user_id: Optional[str],
    query_embedding: List[float],
    top_k: int = 20,
    threshold: float = 0.0
) -> List[Dict]:
    """
    根据图像 embedding 进行相似度搜索（严格按用户隔离）
    
    Args:
        user_id: 用户ID
        query_embedding: 查询图像的 embedding 向量（1024维）
        top_k: 返回前 K 个结果
        threshold: 相似度阈值（0-1）
    
    Returns:
        相似度排序的结果列表
    """
    try:
        normalized_user = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            query_vec = to_vector_str(query_embedding)
            
            rows = await conn.fetch(f"""
                SELECT user_id, url, title, description, image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata,
                       1 - (image_embedding <=> $1::vector(1024)) AS similarity
                FROM {ACTIVE_TABLE}
                WHERE status = 'active'
                  AND user_id = $2
                  AND image_embedding IS NOT NULL
                  AND (1 - (image_embedding <=> $1::vector(1024))) >= $3
                ORDER BY image_embedding <=> $1::vector(1024)
                LIMIT $4;
            """, query_vec, normalized_user, threshold, top_k)
            
            results = []
            for row in rows:
                item = _row_to_dict(row)
                results.append(item)
            
            return results
    except Exception as e:
        print(f"[VectorDB] Error searching by image embedding: {e}")
        import traceback
        traceback.print_exc()
        return []


async def batch_upsert_items(items: List[Dict], user_id: Optional[str]) -> int:
    """
    批量插入或更新 OpenGraph 数据
    
    Args:
        items: OpenGraph 数据列表（每个包含 url, title, description 等字段）
    
    Returns:
        成功插入/更新的数量
    """
    # ✅ 规范化所有项
    from search.normalize import normalize_opengraph_items
    normalized_items = normalize_opengraph_items(items)
    
    success_count = 0
    for item in normalized_items:
        if await upsert_opengraph_item(
            user_id=user_id,
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


class VectorDBClient:
    """
    简单的数据库客户端，封装用户隔离相关操作
    """
    def __init__(self, table_name: str = ACTIVE_TABLE_NAME):
        self.table_name = table_name
        self.qualified_table = _qualified(table_name)
    
    async def execute_query(self, query: str, params: Tuple = None, *, fetch: bool = False):
        pool = await get_pool()
        async with pool.acquire() as conn:
            if fetch:
                return await conn.fetch(query, *(params or ()))
            return await conn.execute(query, *(params or ()))
    
    async def upsert_item(self, item: Dict, user_id: str):
        metadata_json = json.dumps(item.get("metadata") or {})
        text_vec = to_vector_str(item.get("text_embedding"))
        image_vec = to_vector_str(item.get("image_embedding"))
        await self.execute_query(
            f"""
            INSERT INTO {self.qualified_table} (
                user_id, url, title, description, image, site_name,
                tab_id, tab_title, text_embedding, image_embedding, metadata, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector(1024), $10::vector(1024), $11::jsonb, NOW())
            ON CONFLICT (user_id, url) DO UPDATE SET
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
            """,
            (
                _normalize_user_id(user_id),
                item.get("url"),
                item.get("title"),
                item.get("description"),
                item.get("image"),
                item.get("site_name"),
                item.get("tab_id"),
                item.get("tab_title"),
                text_vec,
                image_vec,
                metadata_json,
            )
        )
    
    async def search_by_vector(
        self,
        query_vec: List[float],
        user_id: str,
        top_k: int = 20,
        min_similarity: float = 0.3
    ) -> List[Dict]:
        user_id = _normalize_user_id(user_id)
        vec_str = to_vector_str(query_vec)
        params = (vec_str, user_id, vec_str, min_similarity, vec_str, top_k)
        
        text_query = f"""
            SELECT *, 1 - (text_embedding <=> $1::vector(1024)) as text_similarity
            FROM {self.qualified_table}
            WHERE user_id = $2
              AND text_embedding IS NOT NULL
              AND 1 - (text_embedding <=> $3::vector(1024)) > $4
            ORDER BY text_embedding <=> $5::vector(1024)
            LIMIT $6
        """
        
        image_query = f"""
            SELECT *, 1 - (image_embedding <=> $1::vector(1024)) as image_similarity
            FROM {self.qualified_table}
            WHERE user_id = $2
              AND image_embedding IS NOT NULL
              AND 1 - (image_embedding <=> $3::vector(1024)) > $4
            ORDER BY image_embedding <=> $5::vector(1024)
            LIMIT $6
        """
        
        text_results = await self.execute_query(text_query, params, fetch=True)
        image_results = await self.execute_query(image_query, params, fetch=True)
        
        from search.rank import _choose_weights
        from search.fuse import fuse_similarity_scores
        
        combined: Dict[str, Dict] = {}
        
        for row in text_results:
            item = _row_to_dict(row)
            url = item["url"]
            combined[url] = item
            combined[url]["text_sim"] = float(row.get("text_similarity") or 0.0)
            combined[url]["image_sim"] = 0.0
        
        for row in image_results:
            item = _row_to_dict(row)
            url = item["url"]
            if url in combined:
                combined[url]["image_sim"] = float(row.get("image_similarity") or 0.0)
            else:
                item["text_sim"] = 0.0
                item["image_sim"] = float(row.get("image_similarity") or 0.0)
                combined[url] = item
        
        results = []
        for item in combined.values():
            weights = _choose_weights(item)
            similarity = fuse_similarity_scores(
                text_sim=item.get("text_sim", 0.0),
                image_sim=item.get("image_sim", 0.0),
                weights=weights,
                has_text=item.get("text_embedding") is not None,
                has_image=item.get("image_embedding") is not None
            )
            item["similarity"] = similarity
            results.append(item)
        
        results.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
        return results[:top_k]


async def soft_delete_tab(user_id: Optional[str], url: str) -> bool:
    """
    软删除一个 tab（OpenGraph item）
    
    Args:
        user_id: 用户ID
        url: 网页 URL
    
    Returns:
        是否成功
    """
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            result = await conn.execute(f"""
                UPDATE {ACTIVE_TABLE}
                SET status = 'deleted',
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1 AND url = $2 AND status = 'active';
            """, user_id, url)
            
            return result == "UPDATE 1"
    except Exception as e:
        print(f"[VectorDB] Error soft deleting tab {url[:50]}...: {e}")
        import traceback
        traceback.print_exc()
        return False


async def soft_delete_session_tabs(user_id: Optional[str], session_id: str) -> int:
    """
    软删除一个 session 下的所有 tabs
    
    Args:
        user_id: 用户ID
        session_id: Session ID（存储在 metadata 中）
    
    Returns:
        删除的 tab 数量
    """
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # 查找该 session 的所有 tabs（通过 metadata 中的 session_id）
            result = await conn.execute(f"""
                UPDATE {ACTIVE_TABLE}
                SET status = 'deleted',
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1 
                  AND status = 'active'
                  AND metadata->>'session_id' = $2;
            """, user_id, session_id)
            
            # 解析 UPDATE 结果获取影响行数
            if result.startswith("UPDATE "):
                count = int(result.split()[1])
                return count
            return 0
    except Exception as e:
        print(f"[VectorDB] Error soft deleting session {session_id}: {e}")
        import traceback
        traceback.print_exc()
        return 0


async def get_user_active_tabs(user_id: Optional[str]) -> List[Dict]:
    """
    获取用户的所有 active tabs
    
    Args:
        user_id: 用户ID
    
    Returns:
        OpenGraph 数据列表
    """
    try:
        user_id = _normalize_user_id(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT user_id, url, title, description, image, screenshot_image, site_name,
                       tab_id, tab_title, text_embedding, image_embedding, metadata
                FROM {ACTIVE_TABLE}
                WHERE user_id = $1 AND status = 'active'
                ORDER BY created_at DESC;
            """, user_id)
            
            return [_row_to_dict(row) for row in rows]
    except Exception as e:
        print(f"[VectorDB] Error getting user active tabs: {e}")
        import traceback
        traceback.print_exc()
        return []

