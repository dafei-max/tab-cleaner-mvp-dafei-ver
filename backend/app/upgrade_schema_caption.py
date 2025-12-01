"""
数据库 Schema 升级脚本
添加 Caption 相关字段和索引
"""
import asyncio
import os
from dotenv import load_dotenv
from vector_db import get_pool, close_pool, ACTIVE_TABLE, ACTIVE_TABLE_NAME, NAMESPACE

# 加载环境变量
load_dotenv()


async def check_column_exists(conn, column_name: str) -> bool:
    """检查列是否存在"""
    exists = await conn.fetchval(f"""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = '{NAMESPACE}'
              AND table_name = '{ACTIVE_TABLE_NAME}'
              AND column_name = '{column_name}'
        );
    """)
    return exists


async def check_index_exists(conn, index_name: str) -> bool:
    """检查索引是否存在"""
    exists = await conn.fetchval(f"""
        SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = '{NAMESPACE}'
              AND tablename = '{ACTIVE_TABLE_NAME}'
              AND indexname = '{index_name}'
        );
    """)
    return exists


async def upgrade_schema():
    """升级数据库 Schema，添加 Caption 相关字段和索引"""
    try:
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            print("=" * 60)
            print("数据库 Schema 升级：添加 Caption 相关字段")
            print("=" * 60)
            
            # 1. 添加 image_caption 字段
            if not await check_column_exists(conn, "image_caption"):
                print("\n[Upgrade] 添加 image_caption 字段...")
                await conn.execute(f"""
                    ALTER TABLE {ACTIVE_TABLE}
                    ADD COLUMN image_caption TEXT;
                """)
                print("✓ image_caption 字段已添加")
            else:
                print("✓ image_caption 字段已存在")
            
            # 2. 添加 caption_embedding 字段
            if not await check_column_exists(conn, "caption_embedding"):
                print("\n[Upgrade] 添加 caption_embedding 字段...")
                await conn.execute(f"""
                    ALTER TABLE {ACTIVE_TABLE}
                    ADD COLUMN caption_embedding vector(1024);
                """)
                print("✓ caption_embedding 字段已添加")
            else:
                print("✓ caption_embedding 字段已存在")
            
            # 3. 添加 dominant_colors 字段
            if not await check_column_exists(conn, "dominant_colors"):
                print("\n[Upgrade] 添加 dominant_colors 字段...")
                await conn.execute(f"""
                    ALTER TABLE {ACTIVE_TABLE}
                    ADD COLUMN dominant_colors TEXT[];
                """)
                print("✓ dominant_colors 字段已添加")
            else:
                print("✓ dominant_colors 字段已存在")
            
            # 4. 添加 style_tags 字段
            if not await check_column_exists(conn, "style_tags"):
                print("\n[Upgrade] 添加 style_tags 字段...")
                await conn.execute(f"""
                    ALTER TABLE {ACTIVE_TABLE}
                    ADD COLUMN style_tags TEXT[];
                """)
                print("✓ style_tags 字段已添加")
            else:
                print("✓ style_tags 字段已存在")
            
            # 5. 添加 object_tags 字段
            if not await check_column_exists(conn, "object_tags"):
                print("\n[Upgrade] 添加 object_tags 字段...")
                await conn.execute(f"""
                    ALTER TABLE {ACTIVE_TABLE}
                    ADD COLUMN object_tags TEXT[];
                """)
                print("✓ object_tags 字段已添加")
            else:
                print("✓ object_tags 字段已存在")
            
            print("\n" + "=" * 60)
            print("创建索引")
            print("=" * 60)
            
            # 6. 创建 GIN 索引：dominant_colors
            index_name_colors = f"idx_{ACTIVE_TABLE_NAME}_dominant_colors_gin"
            if not await check_index_exists(conn, index_name_colors):
                print(f"\n[Upgrade] 创建 GIN 索引: {index_name_colors}...")
                try:
                    await conn.execute(f"""
                        CREATE INDEX {index_name_colors}
                        ON {ACTIVE_TABLE}
                        USING GIN (dominant_colors);
                    """)
                    print(f"✓ {index_name_colors} 索引已创建")
                except Exception as e:
                    print(f"⚠️  创建 {index_name_colors} 索引失败: {e}")
            else:
                print(f"✓ {index_name_colors} 索引已存在")
            
            # 7. 创建 GIN 索引：style_tags
            index_name_styles = f"idx_{ACTIVE_TABLE_NAME}_style_tags_gin"
            if not await check_index_exists(conn, index_name_styles):
                print(f"\n[Upgrade] 创建 GIN 索引: {index_name_styles}...")
                try:
                    await conn.execute(f"""
                        CREATE INDEX {index_name_styles}
                        ON {ACTIVE_TABLE}
                        USING GIN (style_tags);
                    """)
                    print(f"✓ {index_name_styles} 索引已创建")
                except Exception as e:
                    print(f"⚠️  创建 {index_name_styles} 索引失败: {e}")
            else:
                print(f"✓ {index_name_styles} 索引已存在")
            
            # 8. 创建 GIN 索引：object_tags
            index_name_objects = f"idx_{ACTIVE_TABLE_NAME}_object_tags_gin"
            if not await check_index_exists(conn, index_name_objects):
                print(f"\n[Upgrade] 创建 GIN 索引: {index_name_objects}...")
                try:
                    await conn.execute(f"""
                        CREATE INDEX {index_name_objects}
                        ON {ACTIVE_TABLE}
                        USING GIN (object_tags);
                    """)
                    print(f"✓ {index_name_objects} 索引已创建")
                except Exception as e:
                    print(f"⚠️  创建 {index_name_objects} 索引失败: {e}")
            else:
                print(f"✓ {index_name_objects} 索引已存在")
            
            # 9. 创建 IVFFlat 索引：caption_embedding
            index_name_caption_emb = f"idx_{ACTIVE_TABLE_NAME}_caption_embedding"
            if not await check_index_exists(conn, index_name_caption_emb):
                print(f"\n[Upgrade] 创建 IVFFlat 索引: {index_name_caption_emb}...")
                try:
                    await conn.execute(f"""
                        CREATE INDEX {index_name_caption_emb}
                        ON {ACTIVE_TABLE}
                        USING ann(caption_embedding)
                        WITH (
                            distancemeasure = cosine,
                            hnsw_m           = 64,
                            pq_enable        = 0
                        );
                    """)
                    print(f"✓ {index_name_caption_emb} 索引已创建")
                except Exception as e:
                    print(f"⚠️  创建 {index_name_caption_emb} 索引失败: {e}")
            else:
                print(f"✓ {index_name_caption_emb} 索引已存在")
            
            # 10. 创建全文索引：image_caption
            index_name_fts = f"idx_{ACTIVE_TABLE_NAME}_image_caption_fts"
            if not await check_index_exists(conn, index_name_fts):
                print(f"\n[Upgrade] 创建全文索引: {index_name_fts}...")
                try:
                    await conn.execute(f"""
                        CREATE INDEX {index_name_fts}
                        ON {ACTIVE_TABLE}
                        USING GIN (to_tsvector('english', COALESCE(image_caption, '')));
                    """)
                    print(f"✓ {index_name_fts} 索引已创建")
                except Exception as e:
                    print(f"⚠️  创建 {index_name_fts} 索引失败: {e}")
            else:
                print(f"✓ {index_name_fts} 索引已存在")
            
            print("\n" + "=" * 60)
            print("✅ Schema 升级完成")
            print("=" * 60)
            
    except Exception as e:
        print(f"\n❌ Schema 升级失败: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


async def main():
    """主函数"""
    # 检查数据库配置
    db_host = os.getenv("ADBPG_HOST", "")
    if not db_host:
        print("❌ 错误: 未找到 ADBPG_HOST 环境变量")
        print("请在 .env 文件中设置数据库配置")
        return
    
    print("数据库配置:")
    print(f"  - Host: {db_host}")
    print(f"  - Database: {os.getenv('ADBPG_DBNAME', 'postgres')}")
    print(f"  - Namespace: {NAMESPACE}")
    print(f"  - Table: {ACTIVE_TABLE}")
    
    try:
        await upgrade_schema()
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

