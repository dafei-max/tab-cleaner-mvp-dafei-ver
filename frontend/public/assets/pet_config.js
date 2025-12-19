(() => {
  // 全局可覆写：window.__TAB_CLEANER_PET_CONFIG
  const defaults = {
    roamIntervalMin: 20000,
    roamIntervalMax: 40000,
    walkSpeed: 80,         // px/s（降低走路速度）
    walkDurationMin: 4000, // ms（增加最小持续时间）
    walkDurationMax: 8000, // ms（增加最大持续时间）
    idlePlaybackRate: 0.7, // idle 动画播放速度（0.7 = 70%，更慢）
    walkPlaybackRate: 0.7, // 走路动画播放速度（0.7 = 70%，更慢）
    walkStrideMin: 0.6,    // 最小步幅倍数（相对于计算距离）
    walkStrideMax: 1.2,    // 最大步幅倍数（相对于计算距离）
    // 🎯 拖拽锚点配置（衣服尖端位置）
    // 调整说明：
    // - dragAnchorX: 0.0-1.0，表示容器宽度的百分比（0=最左边，1=最右边）
    // - dragAnchorY: 0.0-1.0，表示容器高度的百分比（0=最上边，1=最下边）
    dragAnchorX: 0.51,  // 容器宽度的 51%（衣服尖位置）
    dragAnchorY: 0.215,  // 容器高度的 21.5%（衣服尖位置）
    // 🎯 连续点击配置（用于触发 DIZZY 状态）
    dizzyClickThreshold: 3,      // 连续点击次数阈值（默认 3 次）
    dizzyClickResetTime: 1000,   // 点击间隔重置时间（ms，默认 1 秒）
    // 🎯 聊天气泡配置
    chatBubble: {
      showIntervalMin: 8000,     // 最小显示间隔（ms，默认 8 秒）
      showIntervalMax: 15000,    // 最大显示间隔（ms，默认 15 秒）
      displayDuration: 100000,     // 显示持续时间（ms，默认 4 秒）
      fadeInDuration: 300,       // 淡入动画时长（ms）
      fadeOutDuration: 300,       // 淡出动画时长（ms）
      positionOffsetX: 0,        // 相对默认位置的 X 偏移（px，默认位置 left: 180px）
      positionOffsetY: 0,       // 相对默认位置的 Y 偏移（px，默认位置 top: -20px）
    },
  };
  if (!window.__TAB_CLEANER_PET_CONFIG) {
    window.__TAB_CLEANER_PET_CONFIG = { ...defaults };
  } else {
    window.__TAB_CLEANER_PET_CONFIG = { ...defaults, ...window.__TAB_CLEANER_PET_CONFIG };
  }
})();


