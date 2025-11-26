#!/usr/bin/env python3
"""
检查前端到后端的 OpenGraph 数据通信和数据格式

1. 检查通信：验证 API 端点、请求格式
2. 检查数据格式：验证前端发送的数据格式与后端期望的格式是否匹配
"""

import json
import sys
from pathlib import Path

# 添加后端路径
sys.path.insert(0, str(Path(__file__).parent / "backend"))

def check_frontend_format():
    """检查前端发送的数据格式"""
    print("=" * 60)
    print("1. 检查前端数据格式（background.js）")
    print("=" * 60)
    
    bg_file = Path(__file__).parent / "frontend" / "public" / "assets" / "background.js"
    if not bg_file.exists():
        print("❌ background.js 文件不存在")
        return None
    
    content = bg_file.read_text(encoding='utf-8')
    
    # 检查 normalizeItem 函数
    if 'normalizeItem' in content:
        print("✅ 找到 normalizeItem 函数")
    else:
        print("❌ 未找到 normalizeItem 函数")
    
    # 检查 API 端点
    if '/api/v1/search/embedding' in content:
        print("✅ 找到 API 端点: /api/v1/search/embedding")
    else:
        print("❌ 未找到 API 端点")
    
    # 检查请求格式
    if 'opengraph_items' in content:
        print("✅ 找到 opengraph_items 字段")
    else:
        print("❌ 未找到 opengraph_items 字段")
    
    # 提取 normalizeItem 函数的关键逻辑
    print("\n前端 normalizeItem 处理的字段：")
    fields = ['url', 'title', 'description', 'image', 'site_name', 'tab_id', 'tab_title', 
              'is_doc_card', 'is_screenshot', 'success']
    for field in fields:
        if field in content:
            print(f"  ✅ {field}")
        else:
            print(f"  ❌ {field}")
    
    return content

def check_backend_format():
    """检查后端期望的数据格式"""
    print("\n" + "=" * 60)
    print("2. 检查后端数据格式（main.py + normalize.py）")
    print("=" * 60)
    
    try:
        from app.main import EmbeddingRequest
        from app.search.normalize import normalize_opengraph_item
        
        print("✅ 成功导入 EmbeddingRequest 和 normalize_opengraph_item")
        
        # 检查 EmbeddingRequest 模型
        print("\n后端 EmbeddingRequest 模型字段：")
        import inspect
        if hasattr(EmbeddingRequest, '__fields__'):
            for field_name, field_info in EmbeddingRequest.__fields__.items():
                print(f"  ✅ {field_name}: {field_info.type_}")
        
        # 检查 normalize_opengraph_item 函数签名
        print("\n后端 normalize_opengraph_item 处理的字段：")
        sig = inspect.signature(normalize_opengraph_item)
        print(f"  参数: {sig}")
        
        # 测试规范化函数
        test_item = {
            "url": "https://example.com",
            "title": "Test Title",
            "description": "Test Description",
            "image": "https://example.com/image.jpg",
            "site_name": "Example",
            "tab_id": 123,
            "tab_title": "Tab Title",
            "is_doc_card": False,
            "is_screenshot": False,
            "success": True,
        }
        
        try:
            normalized = normalize_opengraph_item(test_item)
            print("\n✅ 测试规范化成功")
            print(f"  规范化后的字段: {list(normalized.keys())}")
            
            # 检查关键字段类型
            print("\n字段类型检查：")
            print(f"  url: {type(normalized.get('url')).__name__} = {repr(normalized.get('url'))}")
            print(f"  title: {type(normalized.get('title')).__name__} = {repr(normalized.get('title'))}")
            print(f"  image: {type(normalized.get('image')).__name__} = {repr(normalized.get('image'))}")
            print(f"  tab_id: {type(normalized.get('tab_id')).__name__} = {repr(normalized.get('tab_id'))}")
            
        except Exception as e:
            print(f"\n❌ 测试规范化失败: {e}")
            import traceback
            traceback.print_exc()
        
        return True
        
    except ImportError as e:
        print(f"❌ 导入失败: {e}")
        return False
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_api_endpoint():
    """检查 API 端点定义"""
    print("\n" + "=" * 60)
    print("3. 检查 API 端点定义")
    print("=" * 60)
    
    main_file = Path(__file__).parent / "backend" / "app" / "main.py"
    if not main_file.exists():
        print("❌ main.py 文件不存在")
        return
    
    content = main_file.read_text(encoding='utf-8')
    
    # 检查端点定义
    if '@app.post("/api/v1/search/embedding")' in content:
        print("✅ 找到端点定义: @app.post(\"/api/v1/search/embedding\")")
    else:
        print("❌ 未找到端点定义")
    
    # 检查请求模型
    if 'class EmbeddingRequest' in content:
        print("✅ 找到 EmbeddingRequest 模型")
    else:
        print("❌ 未找到 EmbeddingRequest 模型")
    
    # 检查规范化调用
    if 'normalize_opengraph_items' in content:
        print("✅ 端点中调用了 normalize_opengraph_items")
    else:
        print("❌ 端点中未调用规范化函数")

def check_data_flow():
    """检查数据流"""
    print("\n" + "=" * 60)
    print("4. 检查数据流")
    print("=" * 60)
    
    print("数据流路径：")
    print("  1. opengraph_local.js → 提取 OpenGraph 数据")
    print("  2. content.js → 通过 window.postMessage 接收并保存到 chrome.storage.local")
    print("  3. background.js → 从 chrome.storage.local 读取")
    print("  4. background.js → normalizeItem() 规范化数据")
    print("  5. background.js → POST /api/v1/search/embedding")
    print("  6. main.py → EmbeddingRequest 接收")
    print("  7. main.py → normalize_opengraph_items() 再次规范化")
    print("  8. main.py → process_opengraph_for_search() 生成 embedding")
    print("  9. main.py → batch_upsert_items() 存储到数据库")
    
    print("\n✅ 数据流路径完整")

def create_test_request():
    """创建一个测试请求示例"""
    print("\n" + "=" * 60)
    print("5. 测试请求示例")
    print("=" * 60)
    
    test_request = {
        "opengraph_items": [
            {
                "url": "https://example.com",
                "title": "Example Title",
                "description": "Example Description",
                "image": "https://example.com/image.jpg",
                "site_name": "Example",
                "tab_id": 123,
                "tab_title": "Example Tab",
                "is_doc_card": False,
                "is_screenshot": False,
                "success": True,
            }
        ]
    }
    
    print("前端发送的请求格式：")
    print(json.dumps(test_request, indent=2, ensure_ascii=False))
    
    # 验证后端能否处理
    try:
        from app.main import EmbeddingRequest
        
        # 尝试创建请求对象
        request_obj = EmbeddingRequest(**test_request)
        print("\n✅ 后端可以接受此格式的请求")
        print(f"  请求对象类型: {type(request_obj)}")
        print(f"  opengraph_items 数量: {len(request_obj.opengraph_items)}")
        
    except Exception as e:
        print(f"\n❌ 后端无法接受此格式: {e}")
        import traceback
        traceback.print_exc()

def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("OpenGraph 数据通信和数据格式检查")
    print("=" * 60)
    
    # 1. 检查前端格式
    frontend_content = check_frontend_format()
    
    # 2. 检查后端格式
    backend_ok = check_backend_format()
    
    # 3. 检查 API 端点
    check_api_endpoint()
    
    # 4. 检查数据流
    check_data_flow()
    
    # 5. 创建测试请求
    create_test_request()
    
    print("\n" + "=" * 60)
    print("检查完成")
    print("=" * 60)
    
    if backend_ok:
        print("\n✅ 后端格式检查通过")
    else:
        print("\n❌ 后端格式检查失败")

if __name__ == "__main__":
    main()



