/**
 * UI 布局配置
 * 集中管理所有可调整的 UI 参数
 * 修改这里的值即可调整界面布局，无需修改代码
 */

export const UI_CONFIG = {
  // ========== 顶部标题区域 ==========
  spaceTitle: {
    fontSize: 14,              // 洗衣房字号（px）
    leftOffset: -120,          // 左边距偏移（px，负值表示更靠左）
    top: 13,                   // 距离顶部距离（px）
  },

  // ========== 添加 Session 按钮 ==========
  addSessionButton: {
    rightOffset: -120,          // 右边距偏移（px，负值表示更靠右）
    top: 24,                   // 距离顶部距离（px）
  },

  // ========== Session Header ==========
  sessionHeader: {
    title: {
      fontSize: 14,            // Session 名称字号（px）
      marginLeft: 110,          // 左边距（px，对齐 masonry 第一个卡片）
    },
    tabCount: {
      fontSize: 12,            // 标签页数量字号（px）
    },
    actionButtons: {
      size: 32,                // 按钮大小（px）
      marginRight: 20,         // 右边距（px，右对齐 masonry 最右边）
      gap: 12,                 // 按钮之间的间距（px）
    },
  },

  // ========== 卡片 Header ==========
  cardHeader: {
    fontSize: 8,               // 卡片 header 字号（px，可调）
    padding: '1px 10px',       // 内边距
    gap: 6,                    // Favicon 和文字之间的间距（px）
    height: 18,                // Header 最小高度（px），调节灰色区域占比
    background: '#F0F0F0',     // Header 背景色
    borderColor: '#E0E0E0',    // Header 底部分割线颜色
  },

  // ========== Marker Bar (Scroll Spy Indicator) ==========
  markerBar: {
    right: 200,                // 距离右边的距离（px）
    dotSize: 10,               // 小圆点大小（px）
    borderWidth: 1,            // 描边宽度（px）
    borderColor: 'rgba(135, 206, 235, 0.8)',  // 水蓝色描边
    innerShadow: 'inset 0 0 3px rgba(135, 206, 235, 0.3)',  // 内阴影
    gap: 8,                    // 圆点之间的间距（px）
    hoverColor: '#87CEEB',     // 悬浮时的颜色
  },

  // ========== 搜索栏（Search Bar） ==========
  searchBar: {
    width: 380,              // 搜索栏宽度（px）
    height: 60,              // 搜索栏高度（px）
    borderRadius: 72,        // 搜索栏圆角
    placeholderColor: 'rgba(182, 182, 182, 0.75)', // Placeholder 颜色
    backgroundHeightPercent: 80,   // 背景图占比高度（%）
    inputPaddingLeft: 4,     // 输入框左边距
    searchButton: {
      size: 100,
      marginLeft: -42,
    },
    submitButton: {
      size: 32,
      marginRight: -10,
    },
    elephantIcon: {
      size: 100,
      marginLeft: -30, // 往左移
    },
    statusText: {
      fontSize: 6,
      color: '#9bd1e8',
      marginRight: 10,
    },
    // ========== 搜索过程中的背景模糊 ==========
    blurOverlay: {
      blurAmount: 30,        // 模糊程度（px），值越大越模糊
      transitionDuration: 5, // 模糊动画持续时间（秒），值越大越慢
    },
    // ========== Tooltip 位置配置 ==========
    tooltip: {
      placement: 'top',     // 'top' | 'bottom' | 'left' | 'right' - tooltip 显示位置
      offset: 8,            // tooltip 距离按钮的间距（px）
    },
  },

  // ========== 搜索状态 Overlay ==========
  searchOverlay: {
    maxResults: 5,
    cardWidth: 220,
    gap: 20,
    maxWidthPercent: 90,
    backdropBlur: 12,
    backdropColor: 'rgba(202, 226, 237, 0.61)',
    positionYPercent: 50,
    positionXPercent: 50,
    paddingX: 24,
    // ========== 搜索结果动画配置 ==========
    animation: {
      baseDuration: 0.8,      // 基础动画时长（秒）- 参考示例
      staggerDelay: 0.05,     // 每个卡片之间的延迟（秒）- 参考示例
      scaleFrom: 0,           // 初始缩放比例 - 从0开始更有"炸开"感
      scaleTo: 1,             // 最终缩放比例
      glowDuration: 2,        // 呼吸光效持续时间（秒）
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // 弹性缓动函数 - 参考示例
    },
  },

  // ========== 视图切换按钮和 Pan ==========
  viewButtons: {
    right: 100,                // 距离右边的距离（px）
    buttonSize: 60,            // 按钮大小（px）
    gap: 24,                   // 按钮之间的间距（px）
    pan: {
      width: 400,              // Pan 背景宽度百分比（%）
      bottom: -50,             // 距离底部的偏移（px，负值表示向下）
      left: 50,                // 水平位置（%，50表示居中）
      translateX: -190,        // 水平平移百分比（%，负值表示向左）
    },
    // ========== Tooltip 位置配置 ==========
    tooltip: {
      placement: 'top',        // 'top' | 'bottom' | 'left' | 'right' - tooltip 显示位置
      offset: 8,               // tooltip 距离按钮的间距（px）
    },
  },

  // ========== Masonry 布局间距 ==========
  masonry: {
    gutter: 12,                 // 列间距（px）
    marginBottom: 8,           // 卡片底部间距（px）
  },

  // ========== Radial 视图布局 ==========
  radial: {
    baseRadius: 180,           // 第一层半径（px）
    radiusGap: 280,            // 层间距（px）
  },
};

