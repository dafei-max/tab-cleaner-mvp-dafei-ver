import os

# ---- Model & Endpoint ----
DASHSCOPE_API_URL = "https://dashscope.aliyuncs.com/api/v1"

# 统一使用 Qwen Multimodal-Embedding API 处理文本和图像
# 根据文档：https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding
MM_EMBED_MODEL = "qwen2.5-vl-embedding"  # 支持文本和图像的多模态模型
MM_EMBED_ENDPOINT = f"{DASHSCOPE_API_URL}/services/embeddings/multimodal-embedding/multimodal-embedding"
# qwen2.5-vl-embedding 支持 dimensions 参数：2048, 1024, 768, 512
# 设置为 1024 确保文本和图像向量在同一维度空间
MM_EMBED_DIM = 1024  # 统一的向量维度（文本和图像都使用此维度）

# ---- Pipeline switches ----
USE_REMOTE_EMBEDDING = True
USE_IMAGE_EMBEDDING = True
ENABLE_CAPTION_FALLBACK = False  # 需要接入 CLIP Caption 时打开

# ---- Preprocess ----
MIN_IMAGE_DIMENSION = 100
TARGET_IMAGE_DIMENSION = 1024
MAX_IMAGE_DIMENSION = 4096
MAX_IMAGE_SIZE = 20 * 1024 * 1024

# ---- Throttle / Batch ----
BATCH_SIZE = 10
EMBED_SLEEP_S = 0.15
QUERY_SLEEP_S = 0.05

# ---- Fusion weights (text, image) ----
# 用于融合文本相似度和图像相似度分数
# 格式：(text_weight, image_weight)
# 设计师找图场景：默认更偏向图像
DEFAULT_WEIGHTS = (0.2, 0.8)  # 默认：文本 20%，图像 80%（设计师找图，图像优先）
IMAGE_FOCUSED_WEIGHTS = (0.05, 0.95)  # 视觉站（Pinterest/Behance/Dribbble/INS）：文本 5%，图像 95%
DOC_FOCUSED_WEIGHTS = (0.6, 0.4)  # 文本站（博客/文档/知乎）：文本 60%，图像 40%（即使文档站也保留图像权重）

# ---- Search thresholds ----
# 最小相似度阈值（过滤掉几乎无关的结果）
MIN_SIMILARITY_THRESHOLD = 0.15  # 低于此阈值的搜索结果将被过滤


def get_api_key() -> str:
    return os.getenv("DASHSCOPE_API_KEY", "")


