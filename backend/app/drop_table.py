#!/usr/bin/env python3
"""
手动删除 opengraph_items 表的辅助脚本
用于修复 Greenplum/ADBPG 的约束冲突问题

警告：这会删除表中的所有数据！
"""
import asyncio
from vector_db import drop_table_if_exists, close_pool


async def main():
    print("[DropTable] ⚠ Warning: This will delete all data in opengraph_items table!")
    print("[DropTable] Press Ctrl+C to cancel, or Enter to continue...")
    
    try:
        input()
    except KeyboardInterrupt:
        print("\n[DropTable] Cancelled.")
        return
    
    print("[DropTable] Dropping table...")
    success = await drop_table_if_exists()
    
    if success:
        print("[DropTable] ✓ Table dropped successfully!")
        print("[DropTable] ✓ Restart your application to recreate the table with correct schema.")
    else:
        print("[DropTable] ✗ Failed to drop table. Check error messages above.")
    
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())



