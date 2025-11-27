"""
独立运行 schema 初始化脚本
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vector_db import init_schema, close_pool


async def main():
    """初始化数据库 schema"""
    try:
        print("=" * 60)
        print("初始化数据库 Schema")
        print("=" * 60)
        print()
        
        await init_schema()
        print()
        print("✓ Schema initialization completed!")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())

