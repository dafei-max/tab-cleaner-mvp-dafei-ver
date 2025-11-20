from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import os
# ✅ 已移除：不再从后端抓取 OpenGraph，只接收客户端数据
# from opengraph import fetch_multiple_opengraph
from ai_insight import analyze_opengraph_data
from search import process_opengraph_for_search
from clustering import create_manual_cluster, classify_by_labels, discover_clusters
from clustering.storage import save_clustering_result, save_multiple_clusters

app = FastAPI(title="Tab Cleaner MVP", version="0.0.1")


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化向量数据库"""
    try:
        # 检查是否配置了数据库连接
        db_host = os.getenv("ADBPG_HOST", "")
        if db_host:
            try:
                from vector_db import init_schema
                print("[Startup] Initializing vector database...")
                await init_schema()
                print("[Startup] ✓ Vector database initialized successfully")
            except ImportError as import_error:
                print(f"[Startup] ⚠ Vector DB module import failed: {import_error}")
                print("[Startup] ⚠ This is expected if asyncpg is not installed. Vector DB features will be disabled.")
                print("[Startup] ⚠ To enable vector DB, ensure asyncpg is installed: pip install asyncpg>=0.30.0")
            except Exception as db_error:
                print(f"[Startup] ⚠ Vector DB initialization failed: {db_error}")
                print("[Startup] ⚠ Continuing without vector database...")
                import traceback
                traceback.print_exc()
        else:
            print("[Startup] ADBPG_HOST not configured, skipping vector database initialization")
    except Exception as e:
        print(f"[Startup] ⚠ Startup event error (non-critical): {e}")
        # 不阻止应用启动


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    try:
        from vector_db import close_pool
        await close_pool()
        print("[Shutdown] Vector database connection pool closed")
    except Exception as e:
        print(f"[Shutdown] Error closing vector database: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve static pages (for share link)
# 注意：如果不需要静态文件服务，可以删除 static 目录
static_dir = Path(__file__).parent / "static"
# 只有当 static 目录存在且不为空时才挂载
if static_dir.exists() and static_dir.is_dir():
    try:
        app.mount("/public", StaticFiles(directory=static_dir, html=True), name="public")
    except Exception as e:
        # 如果挂载失败（例如目录为空），记录警告但不影响应用启动
        print(f"[Warning] Failed to mount static directory: {e}")

@app.get("/")
def root():
    return {"ok": True, "message": "Hello Tab Cleaner"}


@app.get("/favicon.ico")
async def favicon():
    """返回 favicon 图标"""
    # 优先尝试 .ico 格式
    favicon_path = Path(__file__).parent / "static" / "favicon.ico"
    if not favicon_path.exists():
        # 如果没有 .ico，尝试 .png
        favicon_path = Path(__file__).parent / "static" / "favicon.png"
    
    if favicon_path.exists():
        return FileResponse(favicon_path)
    # 如果没有 favicon，返回 204 No Content
    from fastapi.responses import Response
    return Response(status_code=204)


# OpenGraph API
class TabItem(BaseModel):
    url: str
    title: Optional[str] = None
    id: Optional[int] = None


class OpenGraphRequest(BaseModel):
    tabs: List[TabItem]
    # 可选：前端已抓取的 OpenGraph 数据（用于需要登录的网站）
    local_opengraph_data: Optional[List[Dict[str, Any]]] = None


@app.post("/api/v1/tabs/opengraph")
async def fetch_tabs_opengraph(request: OpenGraphRequest):
    """
    接收客户端发送的本地 OpenGraph 数据
    后端不再主动抓取 OpenGraph，只接收和处理客户端数据
    """
    try:
        print(f"[API] 📥 /api/v1/tabs/opengraph endpoint called")
        print(f"[API] Request details: tabs={len(request.tabs)}, local_opengraph_data={len(request.local_opengraph_data) if request.local_opengraph_data else 0}")
        
        # ✅ 简化：只接收客户端发送的 local_opengraph_data
        if request.local_opengraph_data and len(request.local_opengraph_data) > 0:
            print(f"[API] ✅ Received local OpenGraph data for {len(request.local_opengraph_data)} items")
            
            # 打印第一个 item 的详细信息
            if len(request.local_opengraph_data) > 0:
                first_item = request.local_opengraph_data[0]
                print(f"[API] 📋 First local OG item sample:", {
                    "url": first_item.get("url"),
                    "has_title": bool(first_item.get("title")),
                    "has_description": bool(first_item.get("description")),
                    "has_image": bool(first_item.get("image")),
                    "image_preview": str(first_item.get("image"))[:60] + "..." if first_item.get("image") else None,
                    "success": first_item.get("success"),
                    "is_local_fetch": first_item.get("is_local_fetch"),
                })
            
            # 创建 tab URL 到 tab 信息的映射
            tab_map = {tab.url: tab for tab in request.tabs}
            
            # 处理本地数据：标记为 is_local_fetch=True，并合并 tab 信息
            opengraph_data = []
            for item in request.local_opengraph_data:
                url = item.get("url")
                if not url:
                    continue
                
                tab = tab_map.get(url)
                normalized_item = {
                    **item,
                    "is_local_fetch": True,  # ✅ 标记为本地抓取
                    "tab_id": tab.id if tab else None,
                    "tab_title": tab.title if tab else None,
                }
                opengraph_data.append(normalized_item)
            
            print(f"[API] ✅ Processed {len(opengraph_data)} items from local OpenGraph data")
            return {"ok": True, "data": opengraph_data}
        else:
            # ✅ 如果没有本地数据，返回空列表并记录警告
            print("[API] ⚠️ No local_opengraph_data provided; backend no longer fetches OG by itself.")
            return {"ok": True, "data": []}
    except Exception as e:
        print(f"[API] ❌ Error processing OpenGraph request: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# AI 洞察 API
class AIInsightRequest(BaseModel):
    opengraph_items: List[Dict[str, Any]]


@app.post("/api/v1/ai/insight")
async def get_ai_insight(request: AIInsightRequest):
    """
    使用通义千问分析 OpenGraph 数据并生成总结
    """
    try:
        if not request.opengraph_items:
            raise HTTPException(status_code=400, detail="No OpenGraph items provided")
        
        result = analyze_opengraph_data(request.opengraph_items)
        
        if result["success"]:
            return {
                "ok": True,
                "summary": result["summary"],
                "error": None
            }
        else:
            return {
                "ok": False,
                "summary": None,
                "error": result.get("error", "Unknown error")
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 搜索 API
class EmbeddingRequest(BaseModel):
    opengraph_items: List[Dict[str, Any]]


class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 20


@app.post("/api/v1/search/embedding")
async def generate_embeddings(request: EmbeddingRequest):
    """
    为OpenGraph数据生成Embedding向量并存储到数据库
    
    流程：
    1. 调用 process_opengraph_for_search() 生成 text_embedding 和 image_embedding
    2. 调用 batch_upsert_items() 批量存储到数据库
    3. 返回包含 saved 字段的响应
    """
    try:
        if not request.opengraph_items:
            print("[API] ⚠️ No opengraph_items provided in request")
            return {"ok": True, "saved": 0, "data": []}
        
        print(f"[API] 📥 Received request with {len(request.opengraph_items)} items for embedding generation")
        print(f"[API] 🔍 Endpoint: /api/v1/search/embedding")
        
        # ✅ 添加详细日志：打印第一个 item 的字段
        if len(request.opengraph_items) > 0:
            first_item = request.opengraph_items[0]
            print(f"[API] 📋 First item sample:", {
                "url": first_item.get("url"),
                "has_title": bool(first_item.get("title")),
                "has_description": bool(first_item.get("description")),
                "has_image": bool(first_item.get("image")),
                "image_type": type(first_item.get("image")).__name__ if first_item.get("image") else None,
                "image_preview": str(first_item.get("image"))[:60] + "..." if first_item.get("image") else None,
                "tab_id": first_item.get("tab_id"),
                "is_doc_card": first_item.get("is_doc_card"),
                "success": first_item.get("success"),
                "is_local_fetch": first_item.get("is_local_fetch"),  # ✅ 检查是否是本地抓取
            })
        
        # ✅ 步骤 0: 规范化输入数据
        from search.normalize import normalize_opengraph_items
        normalized_items = normalize_opengraph_items(request.opengraph_items)
        print(f"[API] Normalized {len(normalized_items)} items from {len(request.opengraph_items)} input items")
        
        # 1. 调用 process_opengraph_for_search() 生成 embedding
        enriched_items = await process_opengraph_for_search(normalized_items)
        print(f"[API] Generated embeddings for {len(enriched_items)} items")
        
        # 2. 准备批量存储的数据（使用规范化后的数据）
        items_to_store = []
        for item in enriched_items:
            # 只存储有 embedding 的项
            if item.get("text_embedding") or item.get("image_embedding"):
                # 确保 metadata 包含所有必要字段
                metadata = item.get("metadata") or {}
                if not isinstance(metadata, dict):
                    metadata = {}
                
                items_to_store.append({
                    "url": item.get("url"),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "image": item.get("image"),  # ✅ 已经是规范化后的字符串
                    "site_name": item.get("site_name"),
                    "tab_id": item.get("tab_id"),
                    "tab_title": item.get("tab_title"),
                    "text_embedding": item.get("text_embedding"),
                    "image_embedding": item.get("image_embedding"),
                    "metadata": {
                        **metadata,
                        "is_screenshot": item.get("is_screenshot", False),
                        "is_doc_card": item.get("is_doc_card", False),
                        "success": item.get("success", False),
                    }
                })
        
        # 3. 调用 batch_upsert_items() 存储到数据库
        saved_count = 0
        db_host = os.getenv("ADBPG_HOST", "")
        if db_host and items_to_store:
            try:
                from vector_db import batch_upsert_items
                saved_count = await batch_upsert_items(items_to_store)
                if saved_count > 0:
                    print(f"[API] ✓ Stored {saved_count}/{len(items_to_store)} items to vector DB")
                else:
                    print(f"[API] ⚠ Failed to store items to vector DB (saved_count=0)")
            except Exception as e:
                print(f"[API] ⚠ Failed to store embeddings to DB: {e}")
                import traceback
                traceback.print_exc()
        elif not db_host:
            print(f"[API] ⚠ ADBPG_HOST not configured, skipping database storage")
        elif not items_to_store:
            print(f"[API] ⚠ No items with embeddings to store")
        
        # 4. 格式化返回数据
        result_data = []
        for item in enriched_items:
            has_text_emb = item.get("text_embedding") and len(item.get("text_embedding", [])) > 0
            has_image_emb = item.get("image_embedding") and len(item.get("image_embedding", [])) > 0
            has_emb_flag = item.get("has_embedding", False)
            
            if not has_emb_flag and (has_text_emb or has_image_emb):
                has_emb_flag = True
            
            result_data.append({
                "url": item.get("url"),
                "title": item.get("title") or item.get("tab_title", ""),
                "description": item.get("description", ""),
                "image": item.get("image", ""),
                "site_name": item.get("site_name", ""),
                "tab_id": item.get("tab_id"),
                "tab_title": item.get("tab_title"),
                "embedding": None,  # 不再使用融合 embedding
                "text_embedding": item.get("text_embedding"),
                "image_embedding": item.get("image_embedding"),
                "has_embedding": has_emb_flag,
                "similarity": item.get("similarity")
            })
        
        # 5. 返回包含 saved 字段的响应
        return {
            "ok": True,
            "saved": saved_count,
            "data": result_data
        }
    except Exception as e:
        print(f"[API] CRITICAL ERROR in generate_embeddings: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        error_detail = f"{type(e).__name__}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/api/v1/search/query")
async def search_content(request: SearchRequest):
    """
    搜索相关内容（从向量数据库检索）
    
    请求参数:
    - query: 查询文本（必需）
    - top_k: 返回前 K 个结果（可选，默认 20）
    
    返回:
    - 按相关性排序的OpenGraph数据列表（包含similarity分数）
    """
    try:
        if not request.query or not request.query.strip():
            raise HTTPException(status_code=400, detail="query parameter is required")
        
        top_k = request.top_k or 20
        print(f"[API] Search request: query='{request.query}', top_k={top_k}")
        
        # 检查数据库配置
        db_host = os.getenv("ADBPG_HOST", "")
        if not db_host:
            raise HTTPException(
                status_code=503,
                detail="Vector database not configured. Please set ADBPG_HOST environment variable."
            )
        
        # 1. 使用 embed_text() 生成查询的文本 embedding
        from search.embed import embed_text
        from vector_db import search_by_text_embedding
        
        query_embedding = await embed_text(request.query)
        if not query_embedding:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate query embedding"
            )
        
        print(f"[API] Generated query embedding (dimension: {len(query_embedding)})")
        
        # 2. 使用 search_by_text_embedding() 从数据库检索
        db_results = await search_by_text_embedding(query_embedding, top_k=top_k)
        
        if not db_results:
            print(f"[API] No results found in database for query: '{request.query}'")
            return {
                "ok": True,
                "results": []
            }
        
        print(f"[API] Found {len(db_results)} results from vector DB")
        
        # 3. 格式化返回结果（保持与前端 useSearch 兼容）
        results = []
        for item in db_results:
            results.append({
                "url": item.get("url", ""),
                "title": item.get("title") or item.get("tab_title", ""),
                "description": item.get("description", ""),
                "image": item.get("image", ""),
                "site_name": item.get("site_name", ""),
                "tab_id": item.get("tab_id"),
                "tab_title": item.get("tab_title"),
                "similarity": float(item.get("similarity", 0.0))
            })
        
        # 打印相似度范围（用于调试）
        if results:
            similarities = [r.get("similarity", 0.0) for r in results]
            print(f"[API] Similarity range: min={min(similarities):.6f}, max={max(similarities):.6f}")
        
        # 4. 返回 JSON 响应
        return {
            "ok": True,
            "results": results
        }
    except Exception as e:
        print(f"[API] Error searching: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# 聚类 API
class ManualClusterRequest(BaseModel):
    item_ids: List[str]
    cluster_name: str
    items_data: List[Dict[str, Any]]
    center_x: Optional[float] = 720
    center_y: Optional[float] = 512


class AIClassifyRequest(BaseModel):
    labels: List[str]
    items_data: List[Dict[str, Any]]
    exclude_item_ids: Optional[List[str]] = None


class AIDiscoverRequest(BaseModel):
    items_data: List[Dict[str, Any]]
    exclude_item_ids: Optional[List[str]] = None
    n_clusters: Optional[int] = None


@app.post("/api/v1/clustering/manual")
async def create_manual_cluster_api(request: ManualClusterRequest):
    """
    创建用户自定义聚类
    
    请求参数:
    - item_ids: 选中的卡片 ID 列表
    - cluster_name: 聚类名称
    - items_data: 所有卡片数据
    - center_x: 聚类中心 X 坐标（可选，默认 720）
    - center_y: 聚类中心 Y 坐标（可选，默认 512）
    
    返回:
    - 聚类对象，包含 id, name, type, items, center, radius 等信息
    """
    try:
        if not request.item_ids or not request.cluster_name:
            raise HTTPException(status_code=400, detail="item_ids and cluster_name are required")
        
        cluster = create_manual_cluster(
            item_ids=request.item_ids,
            cluster_name=request.cluster_name,
            items_data=request.items_data,
            center_x=request.center_x or 720,
            center_y=request.center_y or 512,
        )
        
        # 保存结果到本地
        try:
            save_clustering_result(cluster, result_type="manual")
        except Exception as save_error:
            print(f"[API] Failed to save clustering result: {save_error}")
        
        return {"ok": True, "cluster": cluster}
    except Exception as e:
        print(f"[API] ERROR in create_manual_cluster: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/clustering/ai-classify")
async def classify_by_labels_api(request: AIClassifyRequest):
    """
    AI 按标签分类
    
    请求参数:
    - labels: 用户定义的标签列表（最多3个）
    - items_data: 所有卡片数据（需要包含 text_embedding 和 image_embedding）
    - exclude_item_ids: 要排除的卡片 ID 列表（可选，例如用户自定义聚类中的卡片）
    
    返回:
    - 分类结果，包含每个标签对应的聚类
    """
    try:
        if not request.labels or len(request.labels) == 0:
            raise HTTPException(status_code=400, detail="labels are required")
        
        result = await classify_by_labels(
            labels=request.labels,
            items_data=request.items_data,
            exclude_item_ids=request.exclude_item_ids,
        )
        
        # 保存结果到本地
        try:
            save_multiple_clusters(result.get("clusters", []), result_type="ai-classify")
        except Exception as save_error:
            print(f"[API] Failed to save clustering result: {save_error}")
        
        return {"ok": True, **result}
    except Exception as e:
        print(f"[API] ERROR in classify_by_labels: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/clustering/ai-discover")
async def discover_clusters_api(request: AIDiscoverRequest):
    """
    AI 自发现聚类（使用 K-means 对所有卡片进行无监督聚类）
    
    请求参数:
    - items_data: 所有卡片数据（需要包含 text_embedding 和 image_embedding）
    - exclude_item_ids: 要排除的卡片 ID 列表（可选，例如用户自定义聚类中的卡片）
    - n_clusters: 聚类数量（可选，如果不指定，自动确定3-5组）
    
    返回:
    - 聚类结果，包含每个聚类的信息（包括 AI 生成的名称）
    """
    try:
        if not request.items_data:
            raise HTTPException(status_code=400, detail="items_data is required")
        
        result = await discover_clusters(
            items_data=request.items_data,
            exclude_item_ids=request.exclude_item_ids,
            n_clusters=request.n_clusters,
        )
        
        # 保存结果到本地
        try:
            save_multiple_clusters(result.get("clusters", []), result_type="ai-discover")
        except Exception as save_error:
            print(f"[API] Failed to save clustering result: {save_error}")
        
        return {"ok": True, **result}
    except Exception as e:
        print(f"[API] ERROR in discover_clusters: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
