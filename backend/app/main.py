from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import os
from opengraph import fetch_multiple_opengraph
from ai_insight import analyze_opengraph_data
from search import process_opengraph_for_search, search_relevant_items
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


# OpenGraph API
class TabItem(BaseModel):
    url: str
    title: Optional[str] = None
    id: Optional[int] = None


class OpenGraphRequest(BaseModel):
    tabs: List[TabItem]


@app.post("/api/v1/tabs/opengraph")
async def fetch_tabs_opengraph(request: OpenGraphRequest):
    """
    批量抓取多个 tabs 的 OpenGraph 数据
    """
    try:
        urls = [tab.url for tab in request.tabs]
        if not urls:
            return {"ok": True, "data": []}
        
        results = await fetch_multiple_opengraph(urls)
        
        # 将结果与原始 tab 信息合并
        opengraph_data = []
        for i, result in enumerate(results):
            opengraph_data.append({
                **result,
                "tab_id": request.tabs[i].id,
                "tab_title": request.tabs[i].title,
                # 确保 is_screenshot 字段被包含
                "is_screenshot": result.get("is_screenshot", False),
            })
        
        # 统计截图数量
        screenshot_count = sum(1 for item in opengraph_data if item.get("is_screenshot", False))
        print(f"[API] OpenGraph data: {len(opengraph_data)} items, {screenshot_count} screenshots")
        
        return {"ok": True, "data": opengraph_data}
    except Exception as e:
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
    query_text: Optional[str] = None
    query_image_url: Optional[str] = None
    opengraph_items: List[Dict[str, Any]]


@app.post("/api/v1/search/embedding")
async def generate_embeddings(request: EmbeddingRequest):
    """
    为OpenGraph数据生成Embedding向量（批量处理）
    优先从向量数据库读取，如果没有才生成新的
    """
    try:
        if not request.opengraph_items:
            return {"ok": True, "data": []}
        
        print(f"[API] Processing {len(request.opengraph_items)} items (checking DB first)")
        
        # 优先从数据库读取 embedding（如果数据库配置了）
        result_data = []
        items_to_process = []  # 需要生成 embedding 的项
        
        db_host = os.getenv("ADBPG_HOST", "")
        print(f"[API] ADBPG_HOST configured: {bool(db_host)}")
        if db_host:
            try:
                from vector_db import get_opengraph_item
                
                for item in request.opengraph_items:
                    url = item.get("url")
                    if not url:
                        continue
                    
                    # 尝试从数据库读取
                    try:
                        db_item = await get_opengraph_item(url)
                        if db_item:
                            has_text_emb = db_item.get("text_embedding") and len(db_item.get("text_embedding", [])) > 0
                            has_image_emb = db_item.get("image_embedding") and len(db_item.get("image_embedding", [])) > 0
                            if has_text_emb or has_image_emb:
                                # 数据库有 embedding，直接使用
                                print(f"[API] ✓ Found in DB: {url[:50]}... (text_emb: {has_text_emb}, image_emb: {has_image_emb})")
                                result_data.append({
                                    "url": db_item.get("url"),
                                    "title": db_item.get("title") or item.get("tab_title", ""),
                                    "description": db_item.get("description", ""),
                                    "image": db_item.get("image", ""),
                                    "site_name": db_item.get("site_name", ""),
                                    "tab_id": db_item.get("tab_id") or item.get("tab_id"),
                                    "tab_title": db_item.get("tab_title") or item.get("tab_title"),
                                    "embedding": None,
                                    "text_embedding": db_item.get("text_embedding"),
                                    "image_embedding": db_item.get("image_embedding"),
                                    "has_embedding": True,
                                    "similarity": item.get("similarity")
                                })
                                continue
                            else:
                                print(f"[API] ⚠ DB item exists but no embeddings: {url[:50]}...")
                        else:
                            print(f"[API] ⚠ Not found in DB: {url[:50]}...")
                    except Exception as db_error:
                        print(f"[API] ✗ DB read error for {url[:50]}...: {db_error}")
                        import traceback
                        traceback.print_exc()
                    
                    # 数据库没有，需要生成
                    items_to_process.append(item)
            except Exception as db_init_error:
                print(f"[API] Vector DB not available: {db_init_error}, processing all items")
                items_to_process = request.opengraph_items
        else:
            # 数据库未配置，处理所有项
            items_to_process = request.opengraph_items
        
        # 为没有 embedding 的项生成 embedding
        if items_to_process:
            print(f"[API] Generating embeddings for {len(items_to_process)} new items")
            processed_items = await process_opengraph_for_search(items_to_process)
            
            # 添加到结果中
            for item in processed_items:
                has_text_emb = item.get("text_embedding") and len(item.get("text_embedding", [])) > 0
                has_image_emb = item.get("image_embedding") and len(item.get("image_embedding", [])) > 0
                has_emb_flag = item.get("has_embedding", False)
                
                if not has_emb_flag and (has_text_emb or has_image_emb):
                    # 如果 has_embedding 标志为 False 但实际有 embedding，更新标志
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
        
        # 统计信息
        items_with_embedding = sum(1 for r in result_data if 
            r.get("has_embedding", False) or
            (r.get("text_embedding") and len(r.get("text_embedding", [])) > 0) or
            (r.get("image_embedding") and len(r.get("image_embedding", [])) > 0)
        )
        items_with_text_emb = sum(1 for r in result_data if 
            r.get("text_embedding") and len(r.get("text_embedding", [])) > 0
        )
        items_with_image_emb = sum(1 for r in result_data if 
            r.get("image_embedding") and len(r.get("image_embedding", [])) > 0
        )
        from_db = len(result_data) - len(items_to_process) if items_to_process else len(result_data)
        newly_generated = len(items_to_process) if items_to_process else 0
        
        print(f"[API] ===== Summary =====")
        print(f"[API] Total items returned: {len(result_data)}")
        print(f"[API]   - From DB: {from_db}")
        print(f"[API]   - Newly generated: {newly_generated}")
        print(f"[API] Items with embedding: {items_with_embedding}")
        print(f"[API]   - With text_embedding: {items_with_text_emb}")
        print(f"[API]   - With image_embedding: {items_with_image_emb}")
        if len(result_data) > 0:
            sample = result_data[0]
            print(f"[API] Sample item: {sample.get('url', '')[:50]}...")
            print(f"[API]   - has_embedding flag: {sample.get('has_embedding')}")
            print(f"[API]   - text_embedding: {bool(sample.get('text_embedding'))} (length: {len(sample.get('text_embedding', []))})")
            print(f"[API]   - image_embedding: {bool(sample.get('image_embedding'))} (length: {len(sample.get('image_embedding', []))})")
        
        return {"ok": True, "data": result_data}
    except Exception as e:
        print(f"[API] CRITICAL ERROR in generate_embeddings: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        error_detail = f"{type(e).__name__}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/api/v1/search/query")
async def search_content(request: SearchRequest):
    """
    搜索相关内容（支持文本和图片查询）
    优先从向量数据库搜索，如果没有结果再使用传入的 opengraph_items
    
    请求参数:
    - query_text: 查询文本（可选）
    - query_image_url: 查询图片URL（可选，至少需要提供query_text或query_image_url之一）
    - opengraph_items: 包含Embedding的OpenGraph数据列表（作为后备方案）
    
    返回:
    - 按相关性排序的OpenGraph数据列表（包含similarity分数）
    """
    try:
        if not request.query_text and not request.query_image_url:
            raise HTTPException(status_code=400, detail="至少需要提供query_text或query_image_url之一")
        
        print(f"[API] Search request: query_text='{request.query_text}', query_image_url={request.query_image_url}")
        
        # 优先从向量数据库搜索
        results = []
        db_host = os.getenv("ADBPG_HOST", "")
        
        if db_host:
            try:
                from vector_db import search_by_text_embedding, search_by_image_embedding
                from search.embed import embed_text, embed_image
                from search.preprocess import download_image, process_image
                
                # 文本搜索
                if request.query_text:
                    try:
                        # 生成查询文本的 embedding
                        query_emb = await embed_text(request.query_text)
                        if query_emb:
                            # 从数据库搜索
                            db_results = await search_by_text_embedding(query_emb, top_k=20)
                            if db_results:
                                print(f"[API] Found {len(db_results)} results from vector DB")
                                results.extend(db_results)
                    except Exception as e:
                        print(f"[API] Vector DB text search failed: {e}, falling back to local search")
                
                # 图像搜索
                if request.query_image_url:
                    try:
                        # 下载并处理图像
                        image_data = await download_image(request.query_image_url)
                        if image_data:
                            img_b64 = process_image(image_data)
                            if img_b64:
                                # 生成查询图像的 embedding
                                query_emb = await embed_image(img_b64)
                                if query_emb:
                                    # 从数据库搜索
                                    db_results = await search_by_image_embedding(query_emb, top_k=20)
                                    if db_results:
                                        print(f"[API] Found {len(db_results)} image results from vector DB")
                                        results.extend(db_results)
                    except Exception as e:
                        print(f"[API] Vector DB image search failed: {e}, falling back to local search")
            except Exception as e:
                print(f"[API] Vector DB search error: {e}, falling back to local search")
                import traceback
                traceback.print_exc()
        
        # 如果数据库没有结果，使用传入的 opengraph_items 进行本地搜索
        if not results and request.opengraph_items:
            print(f"[API] No DB results, using local search with {len(request.opengraph_items)} items")
            results = await search_relevant_items(
                query_text=request.query_text,
                query_image_url=request.query_image_url,
                opengraph_items=request.opengraph_items,
                top_k=20
            )
        
        # 格式化返回结果
        result_data = []
        for item in results[:20]:  # 限制返回 20 个
            result_data.append({
                "url": item.get("url"),
                "title": item.get("title") or item.get("tab_title", ""),
                "description": item.get("description", ""),
                "image": item.get("image", ""),
                "site_name": item.get("site_name", ""),
                "tab_id": item.get("tab_id"),
                "tab_title": item.get("tab_title"),
                "similarity": item.get("similarity", 0.0)
            })
        
        # 保存搜索结果到本地文件（用于调试）
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            query_safe = (request.query_text or "empty")[:50].replace("/", "_").replace("\\", "_")
            output_file = Path(__file__).parent / f"search_results_{query_safe}_{timestamp}.json"
            
            output_data = {
                "query": request.query_text,
                "query_image_url": request.query_image_url,
                "timestamp": timestamp,
                "total_results": len(result_data),
                "results": [
                    {
                        "rank": idx + 1,
                        "title": item.get("title") or item.get("tab_title", ""),
                        "url": item.get("url"),
                        "description": item.get("description", ""),
                        "similarity": item.get("similarity", 0.0),
                        "similarity_precise": f"{item.get('similarity', 0.0):.15f}",
                    }
                    for idx, item in enumerate(result_data)
                ]
            }
            
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            
            print(f"[API] Search results saved to: {output_file}")
            if result_data:
                print(f"[API] Total results: {len(result_data)}, similarity range: "
                      f"min={min(r.get('similarity', 0.0) for r in result_data):.10f}, "
                      f"max={max(r.get('similarity', 0.0) for r in result_data):.10f}")
        except Exception as save_error:
            print(f"[API] Failed to save search results: {save_error}")
        
        return {"ok": True, "data": result_data}
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
