from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
from opengraph import fetch_multiple_opengraph
from ai_insight import analyze_opengraph_data
from search import process_opengraph_for_search, search_relevant_items
from clustering import create_manual_cluster, classify_by_labels, discover_clusters
from clustering.storage import save_clustering_result, save_multiple_clusters

app = FastAPI(title="Tab Cleaner MVP", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve static pages (for share link)
static_dir = Path(__file__).parent / "static"
app.mount("/public", StaticFiles(directory=static_dir, html=True), name="public")

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
    注意：这个API会处理大量数据，建议分批调用避免过载
    """
    try:
        if not request.opengraph_items:
            return {"ok": True, "data": []}
        
        print(f"[API] Generating embeddings for {len(request.opengraph_items)} items")
        
        # 处理OpenGraph数据，生成Embedding
        processed_items = await process_opengraph_for_search(request.opengraph_items)
        
        # 返回必要的字段，包括 text_embedding 和 image_embedding（用于分别计算相似度）
        result_data = []
        for item in processed_items:
            result_data.append({
                "url": item.get("url"),
                "title": item.get("title") or item.get("tab_title", ""),
                "description": item.get("description", ""),
                "image": item.get("image", ""),
                "site_name": item.get("site_name", ""),
                "tab_id": item.get("tab_id"),
                "tab_title": item.get("tab_title"),
                "embedding": item.get("embedding"),  # 融合向量（用于向后兼容）
                "text_embedding": item.get("text_embedding"),  # 文本向量（用于分别计算相似度）
                "image_embedding": item.get("image_embedding"),  # 图像向量（用于分别计算相似度）
                "has_embedding": item.get("has_embedding", False),
                "similarity": item.get("similarity")  # 如果有相似度分数
            })
        
        items_with_embedding = sum(1 for r in result_data if r.get("has_embedding", False))
        print(f"[API] Returning {len(result_data)} items, {items_with_embedding} have embedding")
        
        return {"ok": True, "data": result_data}
    except Exception as e:
        print(f"[API] CRITICAL ERROR in generate_embeddings: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        # 返回更详细的错误信息
        error_detail = f"{type(e).__name__}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/api/v1/search/query")
async def search_content(request: SearchRequest):
    """
    搜索相关内容（支持文本和图片查询）
    
    请求参数:
    - query_text: 查询文本（可选）
    - query_image_url: 查询图片URL（可选，至少需要提供query_text或query_image_url之一）
    - opengraph_items: 包含Embedding的OpenGraph数据列表（应该已经通过/embedding接口处理过）
    
    返回:
    - 按相关性排序的OpenGraph数据列表（包含similarity分数）
    """
    try:
        if not request.query_text and not request.query_image_url:
            raise HTTPException(status_code=400, detail="至少需要提供query_text或query_image_url之一")
        
        if not request.opengraph_items:
            return {"ok": True, "data": []}
        
        # 调试：检查接收到的数据
        items_with_embedding = sum(1 for item in request.opengraph_items if item.get("embedding"))
        print(f"[API] Received {len(request.opengraph_items)} items, {items_with_embedding} have embedding")
        if items_with_embedding > 0:
            first_embedding = request.opengraph_items[0].get("embedding")
            if first_embedding:
                print(f"[API] First item embedding type: {type(first_embedding)}, length: {len(first_embedding) if isinstance(first_embedding, list) else 'N/A'}")
        
        # 执行搜索
        results = await search_relevant_items(
            query_text=request.query_text,
            query_image_url=request.query_image_url,
            opengraph_items=request.opengraph_items,
            top_k=20
        )
        
        # 格式化返回结果
        result_data = []
        for item in results:
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
                        "similarity_precise": f"{item.get('similarity', 0.0):.15f}",  # 保留15位小数
                    }
                    for idx, item in enumerate(result_data)
                ]
            }
            
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            
            print(f"[API] Search results saved to: {output_file}")
            print(f"[API] Total results: {len(result_data)}, similarity range: "
                  f"min={min(r.get('similarity', 0.0) for r in result_data):.10f}, "
                  f"max={max(r.get('similarity', 0.0) for r in result_data):.10f}")
        except Exception as save_error:
            print(f"[API] Failed to save search results: {save_error}")
        
        return {"ok": True, "data": result_data}
    except Exception as e:
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
