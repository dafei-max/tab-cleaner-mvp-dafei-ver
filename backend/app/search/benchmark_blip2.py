"""
BLIP2 本地推理速度测试脚本
测试 30 张图片的 caption 生成速度
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
print(f"[BLIP2] Using device: {device}")

# 延迟导入（需要安装 transformers）
try:
    from transformers import Blip2Processor, Blip2ForConditionalGeneration
    from PIL import Image
    import requests
    from io import BytesIO
    BLIP2_AVAILABLE = True
except ImportError as e:
    print(f"[BLIP2] 需要安装依赖: pip install transformers accelerate pillow")
    print(f"[BLIP2] 错误: {e}")
    BLIP2_AVAILABLE = False


class BLIP2Client:
    """BLIP2 本地推理客户端"""
    
    def __init__(self, model_name: str = "Salesforce/blip2-opt-2.7b"):
        """
        初始化 BLIP2 模型
        
        Args:
            model_name: 模型名称，可选：
                - Salesforce/blip2-opt-2.7b (2.7B 参数，需要 ~8GB VRAM)
                - Salesforce/blip2-opt-6.7b (6.7B 参数，需要 ~16GB VRAM)
                - Salesforce/blip2-flan-t5-xl (更强的语言能力)
        """
        print(f"[BLIP2] Loading model: {model_name}...")
        start = time.perf_counter()
        
        self.processor = Blip2Processor.from_pretrained(model_name)
        
        # 根据设备选择精度
        if device == "cuda":
            self.model = Blip2ForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float16,
                device_map="auto"
            )
        elif device == "mps":
            # Mac MPS 支持
            self.model = Blip2ForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float32  # MPS 对 float16 支持有限
            ).to(device)
        else:
            self.model = Blip2ForConditionalGeneration.from_pretrained(model_name)
        
        load_time = time.perf_counter() - start
        print(f"[BLIP2] Model loaded in {load_time:.2f}s")
    
    def generate_caption(self, image: Image.Image, prompt: str = None) -> str:
        """
        为单张图片生成 caption
        
        Args:
            image: PIL Image 对象
            prompt: 可选的提示词（如 "a photo of"）
        
        Returns:
            生成的 caption 文本
        """
        if prompt:
            inputs = self.processor(images=image, text=prompt, return_tensors="pt")
        else:
            inputs = self.processor(images=image, return_tensors="pt")
        
        # 移到正确设备
        if device == "cuda":
            inputs = {k: v.to(device, torch.float16) if v.dtype == torch.float32 else v.to(device) for k, v in inputs.items()}
        elif device == "mps":
            inputs = {k: v.to(device) for k, v in inputs.items()}
        
        generated_ids = self.model.generate(**inputs, max_new_tokens=50)
        caption = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        return caption
    
    def batch_generate_captions(self, images: List[Image.Image], prompt: str = None) -> List[str]:
        """
        批量生成 captions
        
        Args:
            images: PIL Image 对象列表
            prompt: 可选的提示词
        
        Returns:
            caption 列表
        """
        if prompt:
            inputs = self.processor(images=images, text=[prompt] * len(images), return_tensors="pt", padding=True)
        else:
            inputs = self.processor(images=images, return_tensors="pt", padding=True)
        
        # 移到正确设备
        if device == "cuda":
            inputs = {k: v.to(device, torch.float16) if v.dtype == torch.float32 else v.to(device) for k, v in inputs.items()}
        elif device == "mps":
            inputs = {k: v.to(device) for k, v in inputs.items()}
        
        generated_ids = self.model.generate(**inputs, max_new_tokens=50)
        captions = self.processor.batch_decode(generated_ids, skip_special_tokens=True)
        return [c.strip() for c in captions]


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
        print(f"[BLIP2] Failed to download {url[:50]}...: {e}")
        return None


async def get_test_images(user_id: str, max_items: int = 30) -> List[Dict]:
    """从数据库获取测试图片"""
    from vector_db import get_pool, ACTIVE_TABLE, _normalize_user_id, _row_to_dict
    
    pool = await get_pool()
    user_id = _normalize_user_id(user_id)
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT url, title, image, image_caption
            FROM {ACTIVE_TABLE}
            WHERE user_id = $1 
              AND status = 'active' 
              AND image IS NOT NULL 
              AND image != ''
            ORDER BY created_at DESC
            LIMIT $2
        """, user_id, max_items)
        
        return [_row_to_dict(row) for row in rows]


async def run_benchmark(user_id: str, max_items: int = 30):
    """运行 BLIP2 速度测试"""
    if not BLIP2_AVAILABLE:
        print("[BLIP2] 模型不可用，请先安装依赖")
        return
    
    print("=" * 60)
    print("BLIP2 速度测试")
    print("=" * 60)
    
    # 1. 获取测试数据
    print(f"\n[BLIP2] 从数据库获取 {max_items} 张图片...")
    items = await get_test_images(user_id, max_items)
    print(f"[BLIP2] 获取到 {len(items)} 张图片")
    
    if not items:
        print("[BLIP2] 没有找到图片，退出")
        return
    
    # 2. 下载图片
    print(f"\n[BLIP2] 下载图片...")
    download_start = time.perf_counter()
    
    images = []
    valid_items = []
    for item in items:
        image_url = item.get("image", "")
        if image_url.startswith("data:image"):
            # Base64 图片
            import base64
            try:
                base64_data = image_url.split(",", 1)[1]
                image_bytes = base64.b64decode(base64_data)
                img = Image.open(BytesIO(image_bytes)).convert("RGB")
                images.append(img)
                valid_items.append(item)
            except Exception as e:
                print(f"[BLIP2] Failed to decode base64: {e}")
        elif image_url.startswith("http"):
            img = await download_image(image_url)
            if img:
                images.append(img)
                valid_items.append(item)
    
    download_time = time.perf_counter() - download_start
    print(f"[BLIP2] 下载完成: {len(images)} 张, 耗时 {download_time:.2f}s")
    
    if not images:
        print("[BLIP2] 没有可用图片，退出")
        return
    
    # 3. 初始化模型
    print(f"\n[BLIP2] 加载模型...")
    client = BLIP2Client()
    
    # 4. 单张推理测试
    print(f"\n[BLIP2] 单张推理测试...")
    single_start = time.perf_counter()
    single_captions = []
    for i, img in enumerate(images):
        caption = client.generate_caption(img)
        single_captions.append(caption)
        if i < 3:
            print(f"  [{i+1}] {caption[:60]}...")
    single_time = time.perf_counter() - single_start
    
    # 5. 批量推理测试（如果 GPU 内存足够）
    batch_time = None
    batch_captions = []
    if device in ["cuda", "mps"] and len(images) <= 10:
        print(f"\n[BLIP2] 批量推理测试 (batch_size={len(images)})...")
        batch_start = time.perf_counter()
        try:
            batch_captions = client.batch_generate_captions(images)
            batch_time = time.perf_counter() - batch_start
        except Exception as e:
            print(f"[BLIP2] 批量推理失败（可能内存不足）: {e}")
    
    # 6. 输出结果
    print("\n" + "=" * 60)
    print("BLIP2 测试结果")
    print("=" * 60)
    print(f"  设备: {device}")
    print(f"  图片数量: {len(images)}")
    print(f"  下载耗时: {download_time:.2f}s")
    print(f"  单张推理总耗时: {single_time:.2f}s")
    print(f"  单张推理平均: {single_time/len(images)*1000:.1f}ms/张")
    print(f"  单张推理吞吐: {len(images)/single_time:.2f} 张/秒")
    if batch_time:
        print(f"  批量推理总耗时: {batch_time:.2f}s")
        print(f"  批量推理平均: {batch_time/len(images)*1000:.1f}ms/张")
        print(f"  批量推理吞吐: {len(images)/batch_time:.2f} 张/秒")
    print("=" * 60)
    
    # 7. 保存结果
    results = []
    for i, item in enumerate(valid_items):
        results.append({
            "url": item.get("url", ""),
            "title": item.get("title", ""),
            "qwen_caption": item.get("image_caption", ""),
            "blip2_caption": single_captions[i] if i < len(single_captions) else "",
        })
    
    import json
    output_file = f"blip2_benchmark_{user_id}_{int(time.time())}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "config": {
                "device": device,
                "image_count": len(images),
                "download_time": download_time,
                "single_inference_time": single_time,
                "batch_inference_time": batch_time,
            },
            "results": results,
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n[BLIP2] 结果已保存到: {output_file}")
    
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="BLIP2 速度测试")
    parser.add_argument("--user-id", type=str, required=True, help="用户 ID")
    parser.add_argument("--max-items", type=int, default=30, help="测试图片数量")
    args = parser.parse_args()
    
    asyncio.run(run_benchmark(args.user_id, args.max_items))

