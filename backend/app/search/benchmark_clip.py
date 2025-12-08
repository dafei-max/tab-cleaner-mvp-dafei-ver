"""
CLIP 本地推理速度测试脚本
测试 30 张图片的标签分类速度（CLIP 不直接生成 caption，但可以做多标签分类）
"""
import asyncio
import time
import sys
from pathlib import Path
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# 添加父目录到路径
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

# 检查是否有 GPU
import torch
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print(f"[CLIP] Using device: {device}")

# 延迟导入
try:
    from transformers import CLIPProcessor, CLIPModel
    from PIL import Image
    import requests
    from io import BytesIO
    CLIP_AVAILABLE = True
except ImportError as e:
    print(f"[CLIP] 需要安装依赖: pip install transformers pillow")
    print(f"[CLIP] 错误: {e}")
    CLIP_AVAILABLE = False


# 预定义的标签候选集
COLOR_LABELS = [
    "red", "orange", "yellow", "green", "blue", "purple", "pink", 
    "brown", "black", "white", "gray", "gold", "silver", "beige"
]

STYLE_LABELS = [
    "modern", "minimalist", "vintage", "retro", "industrial", "rustic",
    "elegant", "luxury", "casual", "playful", "artistic", "professional",
    "natural", "organic", "geometric", "abstract", "romantic", "cozy"
]

OBJECT_LABELS = [
    "furniture", "chair", "table", "sofa", "lamp", "plant", "flower",
    "food", "drink", "clothing", "shoe", "bag", "jewelry", "book",
    "electronics", "phone", "computer", "car", "building", "landscape",
    "person", "animal", "art", "decoration", "toy"
]


class CLIPClient:
    """CLIP 本地推理客户端"""
    
    def __init__(self, model_name: str = "openai/clip-vit-large-patch14"):
        """
        初始化 CLIP 模型
        
        Args:
            model_name: 模型名称，可选：
                - openai/clip-vit-base-patch32 (快速，精度较低)
                - openai/clip-vit-base-patch16 (平衡)
                - openai/clip-vit-large-patch14 (慢，精度高)
                - openai/clip-vit-large-patch14-336 (最慢，最高精度)
        """
        print(f"[CLIP] Loading model: {model_name}...")
        start = time.perf_counter()
        
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.model = CLIPModel.from_pretrained(model_name).to(device)
        self.model.eval()
        
        load_time = time.perf_counter() - start
        print(f"[CLIP] Model loaded in {load_time:.2f}s")
    
    def classify_image(
        self, 
        image: Image.Image, 
        labels: List[str],
        top_k: int = 3
    ) -> List[Dict[str, float]]:
        """
        对图片进行多标签分类
        
        Args:
            image: PIL Image 对象
            labels: 候选标签列表
            top_k: 返回 top-k 个标签
        
        Returns:
            [{"label": "red", "score": 0.85}, ...]
        """
        # 构建提示词
        text_inputs = [f"a photo of {label}" for label in labels]
        
        inputs = self.processor(
            text=text_inputs, 
            images=image, 
            return_tensors="pt", 
            padding=True
        ).to(device)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits_per_image = outputs.logits_per_image
            probs = logits_per_image.softmax(dim=1)
        
        # 获取 top-k
        scores = probs[0].cpu().numpy()
        top_indices = scores.argsort()[-top_k:][::-1]
        
        results = []
        for idx in top_indices:
            results.append({
                "label": labels[idx],
                "score": float(scores[idx])
            })
        
        return results
    
    def extract_tags(self, image: Image.Image) -> Dict[str, List[str]]:
        """
        提取图片的颜色、风格、物体标签
        
        Args:
            image: PIL Image 对象
        
        Returns:
            {
                "colors": ["red", "white"],
                "styles": ["modern", "minimalist"],
                "objects": ["chair", "furniture"]
            }
        """
        colors = self.classify_image(image, COLOR_LABELS, top_k=3)
        styles = self.classify_image(image, STYLE_LABELS, top_k=3)
        objects = self.classify_image(image, OBJECT_LABELS, top_k=3)
        
        return {
            "colors": [c["label"] for c in colors if c["score"] > 0.1],
            "styles": [s["label"] for s in styles if s["score"] > 0.1],
            "objects": [o["label"] for o in objects if o["score"] > 0.1],
            "color_scores": colors,
            "style_scores": styles,
            "object_scores": objects,
        }
    
    def batch_extract_tags(self, images: List[Image.Image]) -> List[Dict]:
        """
        批量提取标签
        
        Args:
            images: PIL Image 列表
        
        Returns:
            标签结果列表
        """
        results = []
        for img in images:
            tags = self.extract_tags(img)
            results.append(tags)
        return results


async def download_image(url: str, timeout: float = 10.0) -> Optional[Image.Image]:
    """下载图片并转为 PIL Image"""
    try:
        import httpx
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        }
        if "xiaohongshu.com" in url or "xhscdn.com" in url:
            headers["Referer"] = "https://www.xiaohongshu.com/"
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return Image.open(BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        print(f"[CLIP] Failed to download {url[:50]}...: {e}")
        return None


async def get_test_images(user_id: str, max_items: int = 30) -> List[Dict]:
    """从数据库获取测试图片"""
    from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id, _row_to_dict
    
    pool = await get_pool()
    user_id = _normalize_user_id(user_id)
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT url, title, image, thumbnail, image_caption, dominant_colors, style_tags, object_tags
            FROM {ACTIVE_TABLE}
            WHERE user_id = $1 
              AND status = 'active' 
              AND (image IS NOT NULL AND image != '' OR thumbnail IS NOT NULL AND thumbnail != '')
            ORDER BY created_at DESC
            LIMIT $2
        """, user_id, max_items)
        
        return [_row_to_dict(row) for row in rows]


async def run_benchmark(user_id: str, max_items: int = 30):
    """运行 CLIP 速度测试"""
    if not CLIP_AVAILABLE:
        print("[CLIP] 模型不可用，请先安装依赖")
        return
    
    print("=" * 60)
    print("CLIP 速度测试")
    print("=" * 60)
    
    # 1. 获取测试数据
    print(f"\n[CLIP] 从数据库获取 {max_items} 张图片...")
    items = await get_test_images(user_id, max_items)
    print(f"[CLIP] 获取到 {len(items)} 张图片")
    
    if not items:
        print("[CLIP] 没有找到图片，退出")
        return
    
    # 2. 下载图片（🆕 优先使用 thumbnail）
    print(f"\n[CLIP] 加载图片...")
    download_start = time.perf_counter()
    
    images = []
    valid_items = []
    thumbnail_count = 0
    download_count = 0
    
    for item in items:
        # 🆕 优先使用 thumbnail（无需下载）
        thumbnail = item.get("thumbnail", "")
        image_url = item.get("image", "")
        
        img = None
        
        # 优先 thumbnail
        if thumbnail and thumbnail.startswith("data:image"):
            import base64
            try:
                base64_data = thumbnail.split(",", 1)[1]
                image_bytes = base64.b64decode(base64_data)
                img = Image.open(BytesIO(image_bytes)).convert("RGB")
                thumbnail_count += 1
            except Exception as e:
                print(f"[CLIP] Failed to decode thumbnail: {e}")
        
        # 回退到 image 字段
        if img is None and image_url:
            if image_url.startswith("data:image"):
                import base64
                try:
                    base64_data = image_url.split(",", 1)[1]
                    image_bytes = base64.b64decode(base64_data)
                    img = Image.open(BytesIO(image_bytes)).convert("RGB")
                except Exception as e:
                    print(f"[CLIP] Failed to decode base64: {e}")
            elif image_url.startswith("http"):
                img = await download_image(image_url)
                if img:
                    download_count += 1
        
        if img:
            images.append(img)
            valid_items.append(item)
    
    download_time = time.perf_counter() - download_start
    print(f"[CLIP] 加载完成: {len(images)} 张 ({thumbnail_count} 缩略图, {download_count} 下载), 耗时 {download_time:.2f}s")
    
    if not images:
        print("[CLIP] 没有可用图片，退出")
        return
    
    # 3. 初始化模型
    print(f"\n[CLIP] 加载模型...")
    client = CLIPClient()
    
    # 4. 标签提取测试
    print(f"\n[CLIP] 标签提取测试...")
    extract_start = time.perf_counter()
    clip_tags = []
    for i, img in enumerate(images):
        tags = client.extract_tags(img)
        clip_tags.append(tags)
        if i < 3:
            print(f"  [{i+1}] colors={tags['colors']}, styles={tags['styles'][:2]}, objects={tags['objects'][:2]}")
    extract_time = time.perf_counter() - extract_start
    
    # 5. 输出结果
    print("\n" + "=" * 60)
    print("CLIP 测试结果")
    print("=" * 60)
    print(f"  设备: {device}")
    print(f"  图片数量: {len(images)}")
    print(f"  下载耗时: {download_time:.2f}s")
    print(f"  标签提取总耗时: {extract_time:.2f}s")
    print(f"  标签提取平均: {extract_time/len(images)*1000:.1f}ms/张")
    print(f"  标签提取吞吐: {len(images)/extract_time:.2f} 张/秒")
    print("=" * 60)
    
    # 6. 保存结果
    results = []
    for i, item in enumerate(valid_items):
        results.append({
            "url": item.get("url", ""),
            "title": item.get("title", ""),
            "qwen_caption": item.get("image_caption", ""),
            "qwen_colors": item.get("dominant_colors", []),
            "qwen_styles": item.get("style_tags", []),
            "qwen_objects": item.get("object_tags", []),
            "clip_colors": clip_tags[i]["colors"] if i < len(clip_tags) else [],
            "clip_styles": clip_tags[i]["styles"] if i < len(clip_tags) else [],
            "clip_objects": clip_tags[i]["objects"] if i < len(clip_tags) else [],
        })
    
    import json
    output_file = f"clip_benchmark_{user_id}_{int(time.time())}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "config": {
                "device": device,
                "image_count": len(images),
                "download_time": download_time,
                "extract_time": extract_time,
            },
            "results": results,
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n[CLIP] 结果已保存到: {output_file}")
    
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CLIP 速度测试")
    parser.add_argument("--user-id", type=str, required=True, help="用户 ID")
    parser.add_argument("--max-items", type=int, default=30, help="测试图片数量")
    args = parser.parse_args()
    
    asyncio.run(run_benchmark(args.user_id, args.max_items))

