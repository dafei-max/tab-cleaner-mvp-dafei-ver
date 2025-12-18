// pet_actions.js - 动作处理模块
(() => {
  'use strict';

  /**
   * 触发清理效果（桌宠周围的泡泡动画）
   */
  function triggerCleaningEffect(duration = 2200, petMainEl = null) {
    if (!petMainEl) return () => {};
    petMainEl.classList.add('pet-cleaning');
    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      petMainEl.classList.remove('pet-cleaning');
    };
    const timeout = setTimeout(clear, duration);
    return () => {
      if (cleared) return;
      clearTimeout(timeout);
      clear();
    };
  }

  /**
   * 处理宠物动作
   */
  function handlePetAction(action, {
    showFullscreenCleaningAnimation,
    hideFullscreenCleaningAnimation,
    triggerCleaningEffect,
    petMainEl,
  }) {
    if (!action) return;
    
    if (action === 'pet-setting') {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "pet-setting" });
      }
      return;
    }

    const actionMap = {
      'clean-current': 'clean-current-tab',
      'clean-all': 'clean-all',
    };
    const runtimeAction = actionMap[action];
    if (!runtimeAction) return;

    // 显示全屏加载动画
    if (showFullscreenCleaningAnimation) {
      showFullscreenCleaningAnimation();
    }
    
    const stopEffect = triggerCleaningEffect(2500, petMainEl);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: runtimeAction }, () => {
          stopEffect();
          // 注意：动画会在 background.js 处理完成后通过消息隐藏
        });
        setTimeout(stopEffect, 5000);
      } catch (err) {
        console.warn('[Tab Cleaner Pet] Failed to send action message:', err);
        stopEffect();
        // 出错时隐藏动画
        if (hideFullscreenCleaningAnimation) {
          hideFullscreenCleaningAnimation();
        }
      }
    } else {
      setTimeout(stopEffect, 1500);
      if (hideFullscreenCleaningAnimation) {
        hideFullscreenCleaningAnimation();
      }
    }
  }

  // 导出 API
  window.TabCleanerPetActions = {
    handlePetAction,
    triggerCleaningEffect,
  };
})();

