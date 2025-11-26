/**
 * Masonry 布局配置
 * 统一管理所有 Masonry 相关的参数
 */

export const MASONRY_CONFIG = {
  // 容器配置
  container: {
    maxWidth: 1440,        // 容器最大宽度（px）
    padding: 20,           // 左右内边距（px）
    getContainerWidth: () => {
      // 响应式：根据实际容器宽度计算
      if (typeof window !== 'undefined') {
        const container = document.querySelector('.masonry-container');
        if (container) {
          return container.clientWidth - (MASONRY_CONFIG.container.padding * 2);
        }
      }
      return MASONRY_CONFIG.container.maxWidth - (MASONRY_CONFIG.container.padding * 2);
    },
  },

  // 列配置（Pinterest 风格：固定列宽，紧密排列）
  columns: {
    maxColumns: 7,         // 最大列数
    minColumnWidth: 200,  // 最小列宽（px）
    gutter: 14,            // 列间距（px）- 减小间距让布局更紧密
    getColumnWidth: () => {
      const containerWidth = MASONRY_CONFIG.container.getContainerWidth();
      const { maxColumns, gutter } = MASONRY_CONFIG.columns;
      const calculatedWidth = (containerWidth - (gutter * (maxColumns - 1))) / maxColumns;
      // 确保不小于最小列宽
      return Math.max(calculatedWidth, MASONRY_CONFIG.columns.minColumnWidth);
    },
    getActualColumns: () => {
      const containerWidth = MASONRY_CONFIG.container.getContainerWidth();
      const { gutter, minColumnWidth } = MASONRY_CONFIG.columns;
      // 根据容器宽度和最小列宽计算实际列数
      let columns = 1;
      while (
        columns < MASONRY_CONFIG.columns.maxColumns &&
        (columns * minColumnWidth + (columns - 1) * gutter) <= containerWidth
      ) {
        columns++;
      }
      return columns;
    },
  },

  // 卡片配置（Pinterest 风格：固定宽度，高度自适应）
  card: {
    baseHeight: 120,      // 基础高度（px）- 仅用于计算，实际高度由图片决定
    defaultAspectRatio: 16 / 9,  // 默认宽高比
    marginBottom: 8,       // 卡片底部间距（px）- 减小间距
    borderRadius: 8,       // 圆角（px）
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',  // 阴影（调淡）
  },

  // Masonry 实例配置（Pinterest 风格：紧密排列）
  masonry: {
    itemSelector: '.masonry-item',
    percentPosition: false,  // 不使用百分比定位
    fitWidth: true,          // 适应宽度，居中显示
    transitionDuration: '0.3s',  // 过渡动画时长
    stagger: 30,            // 错开动画延迟（ms）
  },

  // 拖拽配置
  draggable: {
    enabled: true,         // 启用拖拽
    handle: null,         // 整个卡片可拖拽（null = 整个元素）
    axis: null,           // 不限制方向（null = 任意方向）
    containment: false,    // 不限制拖拽范围
    cursor: 'move',       // 拖拽时鼠标样式
    opacity: 0.8,         // 拖拽时透明度
    zIndex: 1000,         // 拖拽时 z-index
  },

  // 图片加载配置
  imageLoading: {
    timeout: 10000,        // 图片加载超时时间（ms）
    retryCount: 2,          // 重试次数
    placeholder: 'https://via.placeholder.com/120',  // 占位图
    onError: (img) => {
      // 图片加载失败时的处理
      console.warn('[Masonry] Image load failed:', img.src);
      // 可以设置一个默认占位图
      if (img.src !== MASONRY_CONFIG.imageLoading.placeholder) {
        img.src = MASONRY_CONFIG.imageLoading.placeholder;
      }
    },
  },

  // 布局更新配置
  layout: {
    debounceDelay: 100,     // 防抖延迟（ms）
    resizeDebounceDelay: 250,  // 窗口大小改变时的防抖延迟（ms）
    imageLoadDelay: 50,    // 图片加载完成后的布局延迟（ms）
  },
};

