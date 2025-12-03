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
      marginRight: 40,         // 右边距（px，右对齐 masonry 最右边）
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
    right: 50,                // 距离右边的距离（px）
    dotSize: 10,               // 小圆点大小（px）
    borderWidth: 1,            // 描边宽度（px）
    borderColor: 'rgba(135, 206, 235, 0.8)',  // 水蓝色描边
    activeBorderColor: 'rgba(64, 158, 255, 1)',
    activeColor: 'rgba(64, 158, 255, 0.9)',
    inactiveColor: '#ffffff',
    innerShadow: 'inset 0 0 3px rgba(135, 206, 235, 0.3)',  // 内阴影
    gap: 8,                    // 圆点之间的间距（px）
    hoverColor: '#87CEEB',     // 悬浮时的颜色
  },

  // ========== 搜索栏（Search Bar） ==========
  searchBar: {
    width: 320,
    height: 40,
    borderRadius: 35,
    placeholderColor: 'rgba(182, 182, 182, 0.75)',
    backgroundHeightPercent: 80,
    inputPaddingLeft: -210,
    searchButton: {
      size: 100,
      marginLeft: -62,
    },
    submitButton: {
      size: 28,
      marginRight: -10,
    },
    elephantIcon: {
      size: 90,
      marginLeft: -30,
    },
    statusText: {
      fontSize: 6,
      color: '#9bd1e8',
      marginRight: 170,
      background: 'rgba(255, 255, 255, 0.28)',
      paddingX: 10,
      paddingY: 4,
      borderRadius: 999,
    },
    // ========== 搜索过程中的背景模糊 ==========
    blurOverlay: {
      blurAmount: 40,        // 模糊程度（px），值越大越模糊
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
    maxWidth: 1800,             // 容器最大宽度（px）- ✅ 与masonryConfig.js同步
    gutter: 24,                 // 列间距（px）- ✅ 与masonryConfig.js同步，从30改为24
    marginBottom: 16,           // 卡片底部间距（px）
  },

  // ========== Radial 视图布局 ==========
  radial: {
    baseRadius: 250,           // 第一层半径（px）- 增大内圆半径
    radiusGap: 280,            // 层间距（px）- 会根据卡片数量动态调整
    minRadiusGap: 200,         // 最小层间距（避免卡片重叠）
    maxRadiusGap: 400,         // 最大层间距
    autoAdjustRadius: true,    // 是否自动调整 radiusGap 避免重叠
  },
  radialCamera: {
    defaultZoom: 0.5,          // 降低默认缩放（镜头离画布更远，视野更广）
    minZoom: 0.2,              // 最小缩放（可以看更远）
    maxZoom: 2.5,
    zoomStep: 0.08,
  },

  // ========== 清理动画配置 ==========
  cleaningAnimation: {
    // 泡泡配置
    bubbles: {
      count: 50,                    // 泡泡数量（充满整个页面）
      minSize: 40,                  // 最小尺寸（px）
      maxSize: 420,                  // 最大尺寸（px）
      minDelay: 0,                  // 最小延迟（秒）
      maxDelay: 2,                  // 最大延迟（秒）
      animationDuration: 3,         // 动画持续时间（秒）
      spreadRadius: 120,            // 扩散半径（%，相对于视口）
    },
    // 背景渐变配置
    background: {
      // 渐变：从边缘的水蓝色到中心的白色
      startColor: 'rgba(135, 206, 250, 0.85)',  // 水蓝色（边缘）
      endColor: 'rgba(255, 255, 255, 0.6)',     // 白色（中心）
      gradientRadius: '150%',                   // 渐变半径（%，越大越扩散）
      // 呼吸动画
      breatheDuration: 4,                       // 呼吸动画持续时间（秒）
      breatheIntensity: 0.15,                   // 呼吸强度（0-1，值越大变化越明显）
    },
    // 文字配置
    text: {
      fontSize: 24,                 // 文字大小（px）
      color: 'rgba(255, 255, 255, 0.95)',  // 文字颜色
      pulseDuration: 2,             // 脉冲动画持续时间（秒）
      fontFamily: "'FZLanTingHei-R-GBK', '方正兰亭', 'Microsoft YaHei', '微软雅黑', sans-serif",  // 字体设置
    },
  },

  // ========== 插件卡片（点击插件按钮弹出的卡片） ==========
  pluginCard: {
    // 卡片大小
    width: 320,                  // 卡片宽度（px）
    height: 485,                 // 卡片高度（px）
    scale: 0.70,                 // 卡片缩放比例（0-1，值越小卡片越小）
    // 卡片起始位置（相对于浏览器窗口）
    position: {
      top: 0,                   // 距离顶部距离（px）
      right: 20,                  // 距离右侧距离（px）
    },
  },

  // ========== 宠物设置页面 ==========
  petSetting: {
    // Bar 高度配置
    bar: {
      width: 400,              // Bar 宽度（px）
      height: 74,              // Bar 高度（px）
      offsetY: -300,              // Bar 垂直偏移（px，负值向上，正值向下）
    },
    description: {
      offsetY: -200,              // 灰色英文描述垂直偏移（px，负值向上，正值向下）
    },
    petSelection: {
      offsetX: -130,            // 宠物选择区域水平偏移（px，负值向左，正值向右）
      offsetY: -60,              // 宠物选择区域垂直偏移（px，负值向上，正值向下）
      gap: 90,                  // 宠物之间的间距（px），值越大间距越大
    },
    // Bubble 高度配置
    bubble: {
      selectedSize: 260,        // 选中宠物的 bubble 大小（px）
      unselectedSize: 220,      // 未选中宠物的 bubble 大小（px）
    },
    // 状态按钮高度配置
    statusButton: {
      chosenWidth: 91,          // 选中按钮宽度（px）
      chosenHeight: 93,         // 选中按钮高度（px）
      unchosenWidth: 39,        // 未选中按钮宽度（px）
      unchosenHeight: 38,       // 未选中按钮高度（px）
    },
  },
};

