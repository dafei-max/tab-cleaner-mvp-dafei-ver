"""
聚类功能配置
"""
import os
from pathlib import Path

# ---- 聚类数量限制 ----
MAX_LABELS = 3  # 用户自定义标签最多3个
MIN_DISCOVER_CLUSTERS = 3  # 自发现聚类最少3组
MAX_DISCOVER_CLUSTERS = 5  # 自发现聚类最多5组

# ---- 布局参数 ----
DEFAULT_IMAGE_SIZE = 120  # 图片大小
DEFAULT_SPACING = 150  # 每圈之间的间距
DEFAULT_CLUSTER_RADIUS = 200  # 聚类圆形排列的半径

# ---- AI 生成名称参数 ----
CLUSTER_NAME_MAX_LENGTH = 8  # 聚类名称最大长度（6-8个字）
CLUSTER_NAME_MIN_LENGTH = 6  # 聚类名称最小长度

# ---- 结果保存路径 ----
RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# ---- API 配置 ----
DASHSCOPE_API_URL = "https://dashscope.aliyuncs.com/api/v1"
QWEN_CHAT_ENDPOINT = f"{DASHSCOPE_API_URL}/services/aigc/text-generation/generation"


def get_api_key() -> str:
    """获取 DashScope API Key"""
    return os.getenv("DASHSCOPE_API_KEY", "")




