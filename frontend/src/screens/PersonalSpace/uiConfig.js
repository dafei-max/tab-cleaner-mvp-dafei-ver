/**
 * UI 布局配置
 * 集中管理所有可调整的 UI 参数
 * 修改这里的值即可调整界面布局，无需修改代码
 */

export const UI_CONFIG = {
  // ========== 顶部标题区域 ==========
  spaceTitle: {
    fontSize: 16,              // 洗衣房字号（px）
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
    placeholderColor: 'rgba(255, 255, 255, 0.75)', // Placeholder 颜色
    backgroundHeightPercent: 80,   // 背景图占比高度（%）
    inputPaddingLeft: 4,     // 输入框左边距
    searchButton: {
      size: 100,
      marginLeft: -18,
    },
    submitButton: {
      size: 32,
      marginRight: -38,
    },
    elephantIcon: {
      size: 100,
      marginLeft: 20,
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

