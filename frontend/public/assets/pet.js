// pet.js - 宠物模块，独立处理桌面宠物功能
(function () {
  'use strict';
  
  // ✅ v2.3: 检查是否已经加载（避免重复加载）
  // 使用更可靠的标志检查
  if (window.__TAB_CLEANER_PET_LOADED) {
    console.log("[Tab Cleaner Pet] Module already loaded, skipping initialization");
    // ✅ v2.3: 如果模块已加载，检查存储状态并同步（处理页面刷新等情况）
    if (window.__TAB_CLEANER_PET && typeof window.__TAB_CLEANER_PET.show === 'function') {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['petVisible', 'petPosition'], (items) => {
          const shouldBeVisible = items.petVisible === true;
          const currentVisible = window.__TAB_CLEANER_PET.isVisible();
          
          if (shouldBeVisible && !currentVisible) {
            console.log('[Tab Cleaner Pet] State sync: showing pet (was hidden)');
            window.__TAB_CLEANER_PET.show();
          } else if (!shouldBeVisible && currentVisible) {
            console.log('[Tab Cleaner Pet] State sync: hiding pet (was visible)');
            window.__TAB_CLEANER_PET.hide();
          }
        });
      }
    }
    return;
  }
  
  // 设置加载标志
  window.__TAB_CLEANER_PET_LOADED = true;

  let petContainer = null;
  let isPetVisible = false;
  let isButtonsVisible = false;
  let petMainEl = null;
  let choiceOverlayEl = null;
  let cleaningOverlay = null; // 全屏加载动画覆盖层
  
  // ✅ 初始化状态标志：标记容器是否真正添加到 DOM
  let petInitialized = false;
  
  // ✅ 全局状态同步：从 Chrome Storage 读取宠物状态
  let petStateLoaded = false;

  // 🧠 状态机实例（仅大象使用）
  let petFsm = null;
  let petStates = null;
  
  /**
   * 显示全屏加载动画（飘泡泡效果）
   * ✅ 改进：泡泡充满整个页面，水蓝色渐变背景，呼吸感
   */
  function showFullscreenCleaningAnimation() {
    // 如果已经存在，先移除
    if (cleaningOverlay) {
      cleaningOverlay.remove();
    }
    
    // ✅ 动画配置（从 uiConfig 读取，这里使用默认值）
    const config = {
      bubbles: {
        count: 50,                    // 泡泡数量（充满整个页面）
        minSize: 30,                  // 最小尺寸（px）- 放大泡泡
        maxSize: 200,                  // 最大尺寸（px）- 放大泡泡
        minDelay: 0,                  // 最小延迟（秒）
        maxDelay: 2,                  // 最大延迟（秒）
        animationDuration: 3,         // 动画持续时间（秒）
        spreadRadius: 200,            // 扩散半径（%，相对于视口），略微加大
      },
      background: {
        startColor: 'rgba(135, 206, 250, 0.85)',  // 水蓝色（边缘）
        endColor: 'rgba(255, 255, 255, 0.6)',     // 白色（中心）
        gradientRadius: '150%',                   // 渐变半径
        breatheDuration: 4,                       // 呼吸动画持续时间（秒）
        breatheIntensity: 0.15,                   // 呼吸强度
      },
      text: {
        fontSize: 24,
        color: 'rgba(255, 255, 255, 0.95)',
        pulseDuration: 2,
        fontFamily: "'FZLanTingHei-R-GBK', '方正兰亭', 'Microsoft YaHei', '微软雅黑', sans-serif",
      },
    };
    
    // 生成泡泡（充满整个页面）
    const bubbles = Array.from({ length: config.bubbles.count }, (_, i) => {
      const size = Math.random() * (config.bubbles.maxSize - config.bubbles.minSize) + config.bubbles.minSize;
      const left = Math.random() * 100; // 0-100% - 覆盖整个宽度
      const bottom = Math.random() * 100; // 0-100% - 从整个底部区域开始，覆盖全屏
      const delay = Math.random() * (config.bubbles.maxDelay - config.bubbles.minDelay) + config.bubbles.minDelay;
      return `<span style="left: ${left}%; bottom: ${bottom}%; width: ${size}px; height: ${size}px; animation-delay: ${delay}s;"></span>`;
    }).join('');
    
    // 创建全屏覆盖层
    cleaningOverlay = document.createElement('div');
    cleaningOverlay.id = 'tab-cleaner-cleaning-overlay';
    cleaningOverlay.innerHTML = `
      <div class="cleaning-content">
        <div class="cleaning-text">正在清理标签页...</div>
      </div>
      <div class="cleaning-bubbles">
        ${bubbles}
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.id = 'tab-cleaner-cleaning-overlay-style';
    style.textContent = `
      #tab-cleaner-cleaning-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 100vw !important;
        min-height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        /* ✅ 水蓝色到白色的径向渐变背景，有呼吸感 */
        background: radial-gradient(circle at center, ${config.background.endColor} 0%, ${config.background.startColor} ${config.background.gradientRadius}) !important;
        backdrop-filter: blur(8px);
        z-index: 2147483647 !important; /* 使用最大 z-index 值 */
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        pointer-events: all !important;
        animation: fadeIn 0.3s ease-in, breathe ${config.background.breatheDuration}s ease-in-out infinite;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      /* ✅ 呼吸动画：渐变背景的透明度变化 */
      @keyframes breathe {
        0%, 100% {
          background: radial-gradient(circle at center, ${config.background.endColor} 0%, ${config.background.startColor} ${config.background.gradientRadius});
        }
        50% {
          background: radial-gradient(circle at center, 
            rgba(255, 255, 255, ${0.6 + config.background.breatheIntensity}) 0%, 
            rgba(135, 206, 250, ${0.85 + config.background.breatheIntensity}) ${config.background.gradientRadius});
        }
      }
      
      #tab-cleaner-cleaning-overlay .cleaning-content {
        position: relative;
        text-align: center;
        z-index: 2;
        pointer-events: none;
      }
      
      #tab-cleaner-cleaning-overlay .cleaning-text {
        color: ${config.text.color};
        font-size: ${config.text.fontSize}px;
        font-weight: 500;
        font-family: ${config.text.fontFamily};
        margin-bottom: 60px;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        animation: pulse ${config.text.pulseDuration}s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 1; }
      }
      
      #tab-cleaner-cleaning-overlay .cleaning-bubbles {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 100vw !important;
        min-height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important;
        z-index: 1 !important;
      }
      
      #tab-cleaner-cleaning-overlay .cleaning-bubbles span {
        position: absolute;
        border-radius: 50%;
        /* ✅ 泡泡：从白色到水蓝色的径向渐变 */
        background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(135,206,250,0.4) 50%, rgba(255,255,255,0) 100%);
        opacity: 0;
        animation: bubble-rise ${config.bubbles.animationDuration}s infinite ease-out;
      }
      
      @keyframes bubble-rise {
        0% {
          transform: translateY(0) scale(0.3);
          opacity: 0.6;
        }
        50% {
          opacity: 0.8;
        }
        100% {
          transform: translateY(-${config.bubbles.spreadRadius}vh) scale(1.2);
          opacity: 0;
        }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    
    // 移除旧的样式（如果存在）
    const oldStyle = document.getElementById('tab-cleaner-cleaning-overlay-style');
    if (oldStyle) {
      oldStyle.remove();
    }
    document.head.appendChild(style);
    
    // ✅ 确保添加到 body，而不是其他容器
    // 如果 body 不存在，等待 DOM 加载完成
    if (document.body) {
      document.body.appendChild(cleaningOverlay);
    } else {
      // 等待 DOM 加载完成
      const observer = new MutationObserver((mutations, obs) => {
        if (document.body) {
          document.body.appendChild(cleaningOverlay);
          obs.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // 超时保护：如果 1 秒后 body 还没出现，直接添加到 document.documentElement
      setTimeout(() => {
        if (!cleaningOverlay.parentNode) {
          if (document.body) {
            document.body.appendChild(cleaningOverlay);
          } else {
            document.documentElement.appendChild(cleaningOverlay);
          }
        }
        observer.disconnect();
      }, 1000);
    }
    
    // ✅ 调试：检查样式是否正确应用
    const computedStyle = window.getComputedStyle(cleaningOverlay);
    console.log('[Tab Cleaner Pet] Fullscreen cleaning animation shown', {
      background: computedStyle.background,
      backgroundColor: computedStyle.backgroundColor,
      config: {
        startColor: config.background.startColor,
        endColor: config.background.endColor,
      }
    });
  }
  
  /**
   * 隐藏全屏加载动画
   */
  function hideFullscreenCleaningAnimation() {
    if (cleaningOverlay) {
      cleaningOverlay.style.animation = 'fadeOut 0.3s ease-out';
      cleaningOverlay.style.opacity = '0';
      setTimeout(() => {
        if (cleaningOverlay && cleaningOverlay.parentNode) {
          cleaningOverlay.remove();
        }
        cleaningOverlay = null;
      }, 300);
      console.log('[Tab Cleaner Pet] Fullscreen cleaning animation hidden');
    }
  }
  
  // 监听消息，隐藏动画
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req && req.action === 'hide-cleaning-animation') {
        hideFullscreenCleaningAnimation();
        sendResponse?.({ ok: true });
        return true;
      }
      return false;
    });
  }

  function getPetAsset(petId) {
    return PET_IMAGE_MAP[petId] || PET_IMAGE_MAP[DEFAULT_PET_ID];
  }

  async function getSelectedPetFromStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return DEFAULT_PET_ID;
    }
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['selectedPet'], resolve);
      });
      return result && result.selectedPet ? result.selectedPet : DEFAULT_PET_ID;
    } catch (err) {
      console.warn('[Tab Cleaner Pet] Failed to load selected pet from storage:', err);
      return DEFAULT_PET_ID;
    }
  }

  async function syncPetSkinFromStorage() {
    const storedPet = await getSelectedPetFromStorage();
    applyPetSkin(storedPet);
  }

  function applyPetSkin(petId) {
    currentPetId = petId || DEFAULT_PET_ID;
    if (!petContainer) return;
    const shadow = petContainer.shadowRoot;
    if (!shadow) return;
    const avatar = shadow.querySelector('.avatar');
    if (avatar) {
      // 添加淡出效果
      avatar.style.opacity = '0';
      avatar.style.transition = 'opacity 0.3s ease';
      
      // 延迟后切换图片并淡入
      setTimeout(() => {
        avatar.style.backgroundImage = `url("${asset(getPetAsset(currentPetId))}")`;
        avatar.style.opacity = '1';
      }, 150); // 150ms 后切换，形成淡出-切换-淡入的效果
    }
  }

  function setButtonsVisible(visible) {
    isButtonsVisible = visible;
    if (choiceOverlayEl) {
      choiceOverlayEl.classList.toggle('visible', visible);
    }
  }

  function triggerCleaningEffect(duration = 2200) {
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

  function handlePetAction(action) {
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
    showFullscreenCleaningAnimation();
    
    const stopEffect = triggerCleaningEffect(2500);
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
        hideFullscreenCleaningAnimation();
      }
    } else {
      setTimeout(stopEffect, 1500);
      hideFullscreenCleaningAnimation();
    }
  }

  const DEFAULT_PET_ID = 'elephant';
  const PET_IMAGE_MAP = {
    turtle: 'static/img/turtle.svg',
    elephant: 'static/img/elephant.svg',
    squirrel: 'static/img/squrrial.svg',
  };
  let currentPetId = DEFAULT_PET_ID;

  // ========== 按钮组配置 ==========
  // 可以在这里调整按钮组的大小和位置
  const BUTTON_GROUP_CONFIG = {
    // 按钮组位置（相对于宠物头像）
    overlayRight: 80,     // 按钮组距离右边的距离（px，负值表示在右侧，值越大越靠左）
    overlayTop: 60,         // 按钮组距离顶部的距离（px）
    
    // 按钮尺寸
    buttonWidth: 88/2,        // 单个按钮的宽度（px）
    buttonHeight: 74/2,       // 单个按钮的高度（px）
    
    // 按钮间距
    buttonGap: 8,          // 按钮之间的间距（px）
    
    // Tooltip 提示框样式
    tooltipOffset: 6,       // Tooltip 距离按钮的间距（px）
    tooltipPaddingX: 8,     // Tooltip 水平内边距（px）
    tooltipPaddingY: 3,     // Tooltip 垂直内边距（px）
    tooltipFontSize: 10,    // Tooltip 字体大小（px）
    
    // Hover 效果
    hoverTranslateX: -2,    // Hover 时按钮向左移动的距离（px）
    hoverScale: 1.02,       // Hover 时按钮的缩放比例
  };
  // ========== 配置结束 ==========
  
  /**
   * 从 Chrome Storage 加载宠物状态
   * ✅ v2.2: 模块加载时立即检查状态并显示/隐藏（不等待用户操作）
   */
  async function loadPetState() {
    if (petStateLoaded) return;
    
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(['petVisible', 'petPosition', 'selectedPet'], (items) => {
            resolve(items);
          });
        });
        
        // ✅ 修复：初次安装时，如果 petVisible 未设置，默认显示宠物（小象）
        let shouldBeVisible = result.petVisible === true;
        const isFirstInstall = result.petVisible === undefined;
        
        if (isFirstInstall) {
          console.log('[Tab Cleaner Pet] 🎉 First install detected, showing pet by default (elephant)');
          shouldBeVisible = true;
          // 设置默认值：显示宠物，默认小象
          await new Promise((resolve) => {
            chrome.storage.local.set({
              petVisible: true,
              selectedPet: DEFAULT_PET_ID, // 默认小象
            }, () => {
              console.log('[Tab Cleaner Pet] ✅ Default pet state saved');
              resolve();
            });
          });
        }
        
        petStateLoaded = true;
        
        console.log('[Tab Cleaner Pet] Loaded pet state from storage:', {
          petVisible: shouldBeVisible,
          petPosition: result.petPosition,
          selectedPet: result.selectedPet || DEFAULT_PET_ID,
          isFirstInstall: isFirstInstall
        });
        
        // ✅ v2.2: 根据存储状态立即显示或隐藏（模块已加载，响应更快）
        if (shouldBeVisible) {
          // ✅ 立即显示，减少延迟
          const showAndRestorePosition = async () => {
            await showPet();
            // ✅ 恢复位置（在容器创建后）
            if (result.petPosition && petContainer) {
              petContainer.style.left = result.petPosition.left || '0px';
              petContainer.style.top = result.petPosition.top || '0px';
              console.log('[Tab Cleaner Pet] Position restored:', result.petPosition);
            }
          };
          
          // ✅ 如果 DOM 已加载，立即执行；否则等待 DOMContentLoaded
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              showAndRestorePosition();
            }, { once: true });
          } else {
            // DOM 已就绪，立即执行
            showAndRestorePosition();
          }
        } else {
          // ✅ v2.2: 如果应该隐藏，确保容器已创建但隐藏（为后续显示做准备）
          console.log('[Tab Cleaner Pet] Pet should be hidden, ensuring container is ready but hidden');
          if (!petContainer) {
            // 创建容器但不显示（为后续快速显示做准备）
            await createPet();
          }
          // 确保是隐藏状态
          if (petContainer) {
            petContainer.style.display = "none";
            isPetVisible = false;
          }
        }
      }
    } catch (e) {
      console.warn('[Tab Cleaner Pet] Failed to load pet state:', e);
      petStateLoaded = true; // 标记为已加载，避免重复尝试
    }
  }
  
  /**
   * 保存宠物状态到 Chrome Storage
   */
  async function savePetState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // 扩展上下文失效时跳过
        if (!chrome.runtime?.id) {
          console.warn('[Tab Cleaner Pet] Extension context invalidated, skip save');
          return;
        }
        const position = petContainer ? {
          left: petContainer.style.left || '0px',
          top: petContainer.style.top || '0px'
        } : null;
        
        await new Promise((resolve) => {
          chrome.storage.local.set({
            petVisible: isPetVisible,
            petPosition: position
          }, () => {
            if (chrome.runtime.lastError) {
              // 过滤已知的无害错误
              if (!chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
                console.warn('[Tab Cleaner Pet] Failed to save pet state:', chrome.runtime.lastError);
              }
            } else {
              console.log('[Tab Cleaner Pet] Pet state saved:', { petVisible: isPetVisible, position });
            }
            resolve();
          });
        });
        
        // 通知所有标签页更新（通过 storage.onChanged 事件）
        // 这个事件会自动触发所有标签页的 chrome.storage.onChanged 监听器
      }
    } catch (e) {
      console.warn('[Tab Cleaner Pet] Failed to save pet state:', e);
    }
  }
  
  /**
   * 监听存储变化，同步宠物状态到所有标签页
   * ✅ v2.3: 确保监听器只设置一次，避免重复监听
   */
  function setupStorageSync() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      console.warn('[Tab Cleaner Pet] chrome.storage.onChanged not available');
      return;
    }
    
    // ✅ v2.3: 避免重复设置监听器
    if (window.__TAB_CLEANER_PET_STORAGE_SYNC_SETUP) {
      console.log('[Tab Cleaner Pet] Storage sync listener already setup');
      return;
    }
    window.__TAB_CLEANER_PET_STORAGE_SYNC_SETUP = true;
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      if (changes.petVisible) {
        const newVisible = changes.petVisible.newValue === true;
        console.log('[Tab Cleaner Pet] Pet visibility changed via storage:', newVisible, {
          currentIsVisible: isPetVisible,
          containerExists: !!petContainer
        });
        
        // ✅ v2.3: 无论当前状态如何，都执行显示/隐藏操作（确保同步）
        if (newVisible) {
          console.log('[Tab Cleaner Pet] Storage says visible=true, calling showPet()...');
          showPet();
        } else {
          console.log('[Tab Cleaner Pet] Storage says visible=false, calling hidePet()...');
          hidePet();
        }
      }
      
      if (changes.petPosition && petContainer) {
        const newPosition = changes.petPosition.newValue;
        if (newPosition && newPosition.left && newPosition.top) {
          petContainer.style.left = newPosition.left;
          petContainer.style.top = newPosition.top;
          console.log('[Tab Cleaner Pet] Position updated from storage:', newPosition);
        }
      }

      if (changes.selectedPet) {
        const newPet = changes.selectedPet.newValue || DEFAULT_PET_ID;
        console.log('[Tab Cleaner Pet] Selected pet changed via storage:', newPet);
        applyPetSkin(newPet);
      }
    });
    
    console.log('[Tab Cleaner Pet] Storage sync listener setup complete');
  }

  // 获取扩展资源 URL
  function asset(path) {
    let url = null;
    let method = '';
    
    // 方式 1: 使用 chrome.runtime.getURL（如果可用且上下文有效）
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      // ✅ 先检查扩展上下文是否有效（避免 "Extension context invalidated" 错误）
      if (chrome.runtime.id) {
        try {
          url = chrome.runtime.getURL(path);
          method = 'chrome.runtime.getURL';
        } catch (e) {
          // 静默处理，不输出警告（扩展上下文失效是正常情况，会在重新加载时发生）
          // console.warn("[Tab Cleaner Pet] chrome.runtime.getURL failed:", e);
        }
      } else {
        // 扩展上下文已失效，跳过此方式
        // console.log("[Tab Cleaner Pet] Extension context invalidated, skipping chrome.runtime.getURL");
      }
    }
    
    // 方式 2: 从 window.__TAB_CLEANER_EXTENSION_ID 获取（由 background.js 设置）
    if (!url && window.__TAB_CLEANER_EXTENSION_ID) {
      url = `chrome-extension://${window.__TAB_CLEANER_EXTENSION_ID}/${path}`;
      method = 'window.__TAB_CLEANER_EXTENSION_ID';
    }
    
    // 方式 3: 从当前脚本的 URL 推断扩展 ID
    if (!url) {
      const scripts = document.querySelectorAll('script[src*="pet.js"]');
      if (scripts.length > 0) {
        const scriptSrc = scripts[scripts.length - 1].src || '';
        const match = scriptSrc.match(/chrome-extension:\/\/([^/]+)/);
        if (match) {
          window.__TAB_CLEANER_EXTENSION_ID = match[1]; // 缓存扩展 ID
          url = `chrome-extension://${match[1]}/${path}`;
          method = 'script URL inference';
        }
      }
    }
    
    // 方式 4: 从所有脚本中查找扩展 URL
    if (!url) {
      const allScripts = document.querySelectorAll('script[src]');
      for (let script of allScripts) {
        const match = script.src.match(/chrome-extension:\/\/([^/]+)/);
        if (match) {
          window.__TAB_CLEANER_EXTENSION_ID = match[1];
          url = `chrome-extension://${match[1]}/${path}`;
          method = 'all scripts scan';
          break;
        }
      }
    }
    
    // 最后的降级：使用默认扩展 ID（如果已知）
    if (!url) {
      console.warn("[Tab Cleaner Pet] Could not determine extension ID, using fallback");
      const fallbackId = '71231ac5-adc5-470f-bc49-23396f94c4fd';
      url = `chrome-extension://${fallbackId}/${path}`;
      method = 'fallback';
    }
    
    // 调试日志（只记录一次，避免过多日志）
    if (!window.__TAB_CLEANER_ASSET_LOGGED) {
      console.log("[Tab Cleaner Pet] Asset URL method:", method, "Extension ID:", window.__TAB_CLEANER_EXTENSION_ID || 'unknown');
      window.__TAB_CLEANER_ASSET_LOGGED = true;
    }
    
    console.log(`[Tab Cleaner Pet] Asset URL for "${path}":`, url);
    return url;
  }

  // 加载 CSS
  async function loadPetCss() {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');
        @import url('https://fonts.googleapis.com/icon?family=Material+Icons');
        .desktop-pet-main {
          min-height: 246px;
          min-width: 315px;
          position: relative;
          width: 100%;
        }

        .desktop-pet-main .pet-main {
          height: 190px;
          left: 0;
          position: absolute;
          top: 0;
          width: 269px;
        }

        .desktop-pet-main .avatar {
          background-image: url("${asset(getPetAsset(DEFAULT_PET_ID))}");
          background-size: contain;
          background-repeat: no-repeat;
          height: 130px;
          left: 70px;
          position: absolute;
          top: 64px;
          width: 140px;
          cursor: pointer;
          border-radius: 60px;
          transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease;
          box-shadow: 0 0 0 rgba(98, 179, 255, 0);
        }

        .desktop-pet-main .avatar-video {
          height: 130px;
          left: 70px;
          position: absolute;
          top: 64px;
          width: 140px;
          cursor: pointer;
          border-radius: 60px;
          transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease;
          box-shadow: 0 0 0 rgba(98, 179, 255, 0);
          object-fit: contain;
          background: transparent;
        }

        .desktop-pet-main .avatar::after,
        .desktop-pet-main .avatar-video::after {
          /* 去掉包裹桌宠的光圈 / 气泡 */
          content: none;
        }

        .desktop-pet-main .avatar:hover,
        .desktop-pet-main .avatar-video:hover {
          /* 只保留非常轻微的位移，不要任何蓝色发光 */
          transform: translateY(-2px) scale(1.01);
          box-shadow: none;
        }

        .desktop-pet-main .avatar:hover::after {
          /* 不再使用 ::after 做发光效果 */
          opacity: 0;
        }

        .desktop-pet-main .avatar-video:hover::after {
          opacity: 0.9;
        }

        /* 🎯 聊天气泡样式（基于 Figma 设计） */
        .desktop-pet-main .chat-bubble {
          position: absolute;
          left: 315px;  /* 桌宠右边 */
          top: 0px;
          width: 329px;
          height: 225px;
          display: none;
          opacity: 0;
          transform: translateY(10px) scale(0.9);
          pointer-events: none;
          z-index: 10;
        }

        .desktop-pet-main .chat-bubble.visible {
          display: block;
        }

        .desktop-pet-main .chatbubble-bg {
          position: absolute;
          left: 0;
          top: 0;
          width: 329px;
          height: 225px;
          opacity: 0.9;
        }

        .desktop-pet-main .chat-bubble-vector {
          position: absolute;
          left: 147px;
          top: 24px;
          width: 28.94px;
          height: 28.9px;
          stroke: #231815;
          stroke-width: 0.99px;
        }

        .desktop-pet-main .chat-bubble-text {
          position: absolute;
          left: 58px;
          top: 41px;
          width: 226px;
          height: 133px;
          font-family: 'FZLanTingYuanS-R-GB', '方正兰亭', 'Microsoft YaHei', '微软雅黑', sans-serif;
          font-weight: 400;
          font-size: 18px;
          line-height: 1.15625em;
          letter-spacing: 5.56%;
          color: #000000;
          text-align: left;
          display: flex;
          align-items: center;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .desktop-pet-main .choice-overlay {
          position: absolute;
          right: ${BUTTON_GROUP_CONFIG.overlayRight}px;
          top: ${BUTTON_GROUP_CONFIG.overlayTop}px;
          display: flex;
          flex-direction: column;
          gap: ${BUTTON_GROUP_CONFIG.buttonGap}px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease, transform 0.25s ease;
          transform: translateX(20px);
        }

        .desktop-pet-main .choice-overlay.visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateX(0);
        }

        .desktop-pet-main .action-button {
          width: ${BUTTON_GROUP_CONFIG.buttonWidth}px;
          height: ${BUTTON_GROUP_CONFIG.buttonHeight}px;
          border: none;
          background: none;
          padding: 0;
          cursor: pointer;
          position: relative;
          transition: transform 0.2s ease, filter 0.2s ease;
        }

        .desktop-pet-main .action-button .label {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          border: 0;
        }

        .desktop-pet-main .action-button img.icon {
          width: 100%;
          height: 100%;
          display: block;
          filter: grayscale(1) brightness(0.9);
          transition: filter 0.25s ease, transform 0.25s ease;
        }

        .desktop-pet-main .action-button .tooltip {
          position: absolute;
          right: calc(100% + ${BUTTON_GROUP_CONFIG.tooltipOffset}px);
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0, 0, 0, 0.85);
          color: #ffffff;
          border-radius: 999px;
          padding: ${BUTTON_GROUP_CONFIG.tooltipPaddingY}px ${BUTTON_GROUP_CONFIG.tooltipPaddingX}px;
          font-size: ${BUTTON_GROUP_CONFIG.tooltipFontSize}px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          white-space: nowrap;
        }

        .desktop-pet-main .action-button:hover img.icon {
          filter: none;
        }

        .desktop-pet-main .action-button:hover {
          transform: translateX(${BUTTON_GROUP_CONFIG.hoverTranslateX}px) scale(${BUTTON_GROUP_CONFIG.hoverScale});
        }

        .desktop-pet-main .action-button:hover .tooltip {
          opacity: 1;
        }

        .desktop-pet-main.pet-cleaning .avatar::after,
        .desktop-pet-main.pet-cleaning .avatar-video::after {
          opacity: 1;
          animation: pet-bubble 1.6s infinite ease-out;
        }

        .desktop-pet-main .cleaning-bubbles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
        }

        .desktop-pet-main.pet-cleaning .cleaning-bubbles {
          opacity: 1;
        }

        .desktop-pet-main .cleaning-bubbles span {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(130,199,255,0.2) 60%, rgba(255,255,255,0) 100%);
          width: 24px;
          height: 24px;
          opacity: 0;
          animation: bubble-rise 1.6s infinite ease-out;
        }

        .desktop-pet-main .cleaning-bubbles span:nth-child(1) {
          left: 30%;
          top: 60%;
          animation-delay: 0s;
        }

        .desktop-pet-main .cleaning-bubbles span:nth-child(2) {
          left: 50%;
          top: 55%;
          animation-delay: 0.2s;
        }

        .desktop-pet-main .cleaning-bubbles span:nth-child(3) {
          left: 65%;
          top: 62%;
          animation-delay: 0.4s;
        }

        .desktop-pet-main .cleaning-bubbles span:nth-child(4) {
          left: 40%;
          top: 45%;
          animation-delay: 0.6s;
        }

        @keyframes pet-bubble {
          0% {
            transform: scale(1);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }

        @keyframes bubble-rise {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0.6;
          }
          100% {
            transform: translateY(-50px) scale(1.2);
            opacity: 0;
          }
        }

        /* 🎯 拖拽释放时的弹性回弹 */
        #tab-cleaner-pet-container.released {
          transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* 🎯 被甩动时的晃动 */
        @keyframes wobble {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(6deg); }
          60% { transform: rotate(-4deg); }
          80% { transform: rotate(2deg); }
        }

        #tab-cleaner-pet-container.shaken {
          animation: wobble 0.5s ease-out;
        }

        /* 🎯 落地时的压扁回弹 */
        @keyframes squish {
          0% { transform: scaleY(1) scaleX(1); }
          30% { transform: scaleY(0.85) scaleX(1.15); }  /* 压扁 */
          50% { transform: scaleY(1.1) scaleX(0.9); }    /* 拉长 */
          70% { transform: scaleY(0.95) scaleX(1.05); }
          100% { transform: scaleY(1) scaleX(1); }
        }

        #tab-cleaner-pet-container.landed {
          animation: squish 0.4s ease-out;
          transform-origin: bottom center;  /* 从底部变形 */
        }

        /* 🎯 点击反馈：Ripple 效果 */
        @keyframes ripple {
          0% {
            transform: scale(0);
            opacity: 0.8;
          }
          50% {
            opacity: 0.4;
          }
          100% {
            transform: scale(4);
            opacity: 0;
          }
        }

        .pet-ripple {
          position: fixed;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(98, 179, 255, 0.9);
          background: rgba(98, 179, 255, 0.2);
          pointer-events: none;
          z-index: 2147483647;
          animation: ripple 0.6s ease-out;
          transform-origin: center;
          box-shadow: 0 0 10px rgba(98, 179, 255, 0.6);
        }
      </style>
    `;
  }

  // 生成宠物 HTML
  function generatePetHTML() {
    // 根据当前宠物类型决定使用视频还是图片
    const isElephant = currentPetId === 'elephant';
    const avatarContent = isElephant 
      ? `<video class="avatar-video" autoplay loop muted playsinline>
           <source src="${asset('static/video/idle-elephant.webm')}" type="video/webm">
         </video>`
      : `<div class="avatar"></div>`;
    
    return `
      <div class="desktop-pet-main">
        <div class="pet-main">
          ${avatarContent}
          <div class="chat-bubble">
            <img class="chatbubble-bg" alt="Chatbubble bg" src="${asset('static/img/chatbubble/text-bubble-bg.svg')}" />
            <img class="chat-bubble-vector" alt="Vector" src="${asset('static/img/chatbubble/text-bubble-vector.svg')}" />
            <div class="chat-bubble-text"></div>
          </div>
        </div>
        <div class="cleaning-bubbles" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="choice-overlay">
          <button class="action-button" data-action="clean-current">
            <img class="icon" alt="Clean current tab" src="${asset('static/img/clean-one-tab.svg')}" />
            <span class="label">清理当前页</span>
            <span class="tooltip">清理当前页 Tab</span>
          </button>
          <button class="action-button" data-action="clean-all">
            <img class="icon" alt="Clean all tabs" src="${asset('static/img/clean-all-tab.svg')}" />
            <span class="label">清理所有页</span>
            <span class="tooltip">一键清理全部 Tab</span>
          </button>
          <button class="action-button" data-action="pet-setting">
            <img class="icon" alt="Pet settings" src="${asset('static/img/pet-setting.svg')}" />
            <span class="label">宠物设置</span>
            <span class="tooltip">打开宠物设置</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * ✅ 确保宠物容器已初始化（等待函数）
   * 最多等待 100 次 × 50ms = 5 秒
   * 优化：立即尝试创建容器，不必等待
   */
  async function ensureInitialized() {
    if (petInitialized) {
      return true;
    }
    
    // ✅ 立即尝试创建容器（如果还没创建）
    if (!petContainer) {
      try {
        await createPet();
      } catch (e) {
        console.warn("[Tab Cleaner Pet] Failed to create pet during initialization check:", e);
      }
    }
    
    // 如果已经初始化，直接返回
    if (petInitialized) {
      return true;
    }
    
    // ✅ 增加最大等待时间：100 次 × 50ms = 5 秒（容忍更慢的 DOM 加载）
    let attempts = 0;
    const maxAttempts = 100;
    
    while (!petInitialized && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    
    if (petInitialized) {
      console.log(`[Tab Cleaner Pet] ✅ Initialized after ${attempts} attempts`);
      return true;
    } else {
      console.warn(`[Tab Cleaner Pet] ⚠️ Initialization timeout after ${maxAttempts} attempts`);
      return false;
    }
  }

  // 创建宠物容器（改进为 Promise，确保真正添加到 DOM 后才 resolve）
  async function createPet() {
    if (petContainer && petInitialized) {
      return Promise.resolve();
    }
    
    if (petContainer && !petInitialized) {
      // 容器已创建但还没添加到 DOM，等待初始化
      return ensureInitialized();
    }

    return new Promise(async (resolve) => {
      petContainer = document.createElement("div");
      petContainer.id = "tab-cleaner-pet-container";
      // 先定位到屏幕中央，便于调试
      const centerX = (window.innerWidth - 315) / 2;
      const centerY = (window.innerHeight - 246) / 2;
      Object.assign(petContainer.style, {
        position: "fixed",
        left: `${centerX}px`,
        top: `${centerY}px`,
        zIndex: String(2147483646),
        width: "315px",
        height: "246px",
        background: "transparent",
        pointerEvents: "auto",
        display: "none",
      });

      const shadow = petContainer.attachShadow({ mode: "open" });
      // 使用 pet_ui.js 模块（如果可用）
      const petUI = window.TabCleanerPetUI;
      let css, html;
      if (petUI && petUI.loadPetCss && petUI.generatePetHTML) {
        css = petUI.loadPetCss(asset, currentPetId);
        html = petUI.generatePetHTML(asset, currentPetId);
      } else {
        // 降级：使用本地函数
        css = await loadPetCss();
        html = generatePetHTML();
      }
      shadow.innerHTML = `${css}${html}`;

      // 绑定事件（支持图片 avatar 和视频 avatar-video）
      const avatar = shadow.querySelector('.avatar') || shadow.querySelector('.avatar-video');
      const avatarVideo = shadow.querySelector('.avatar-video');
      const choiceOverlay = shadow.querySelector('.choice-overlay');
      const actionButtons = shadow.querySelectorAll('.action-button');
      petMainEl = shadow.querySelector('.desktop-pet-main');
      choiceOverlayEl = choiceOverlay;

      // ✅ 添加拖动功能 - 让整个 petContainer 可以拖动
      // 🎯 拖拽锚点配置（从 pet_config.js 读取）
      const globalCfg = window.__TAB_CLEANER_PET_CONFIG || {};
      const DRAG_ANCHOR = {
        x: globalCfg.dragAnchorX ?? 0.75,  // 容器宽度的百分比（默认 75%）
        y: globalCfg.dragAnchorY ?? 0.15,  // 容器高度的百分比（默认 15%）
      };
      
      // 计算锚点像素偏移（基于默认容器尺寸 315x246）
      const PET_DEFAULT_WIDTH = 315;
      const PET_DEFAULT_HEIGHT = 246;
      
      let isDragging = false;
      let lastPositions = []; // 用于甩动检测
      let dragStartTime = 0; // 记录拖拽开始时间
      let dragStartX = 0; // 记录拖拽开始位置
      let dragStartY = 0;
      let targetX = 0; // 目标位置（用于垂摆效果）
      let targetY = 0;
      let currentX = 0; // 当前位置（用于垂摆效果）
      let currentY = 0;
      let animationFrameId = null; // 垂摆动画的 requestAnimationFrame ID
      
      // 🎯 连续点击检测（用于触发 DIZZY）
      let clickCount = 0;
      let lastClickTime = 0;
      const globalCfgForClick = window.__TAB_CLEANER_PET_CONFIG || {};
      const DIZZY_CLICK_THRESHOLD = globalCfgForClick.dizzyClickThreshold ?? 3;
      const DIZZY_CLICK_RESET_TIME = globalCfgForClick.dizzyClickResetTime ?? 1000;
      const LONG_PRESS_THRESHOLD = 200; // 长按阈值（ms），超过此时间才触发拖拽
      
      // 🔧 实时获取锚点偏移（修复延迟问题：每次都读取最新配置）
      const getAnchorOffset = () => {
        const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
        const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
        const currentCfg = window.__TAB_CLEANER_PET_CONFIG || {};
        const currentAnchorX = currentCfg.dragAnchorX ?? DRAG_ANCHOR.x;
        const currentAnchorY = currentCfg.dragAnchorY ?? DRAG_ANCHOR.y;
        return {
          x: containerWidth * currentAnchorX,
          y: containerHeight * currentAnchorY
        };
      };
      
      // ⚡ 节流函数（约 60fps）
      function throttle(fn, delay = 16) {
        let lastCall = 0;
        return function(...args) {
          const now = Date.now();
          if (now - lastCall >= delay) {
            lastCall = now;
            fn.apply(this, args);
          }
        };
      }
      
      // 🎭 甩动检测（仅用于动画，不触发 DIZZY）
      const SHAKE_VELOCITY_THRESHOLD = 800; // px/s（用于触发晃动动画）
      
      // 计算当前速度
      function calculateVelocity() {
        if (lastPositions.length < 2) return 0;
        const now = performance.now();
        const recent = lastPositions.filter(p => now - p.time < 100);
        if (recent.length < 2) return 0;
        
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.time - first.time) / 1000; // 秒
        if (dt === 0) return 0;
        const distance = Math.hypot(last.x - first.x, last.y - first.y);
        return distance / dt;
      }
      
      function trackVelocity(x, y) {
        const now = performance.now();
        lastPositions.push({ x, y, time: now });
        
        // 只保留最近 100ms 的数据（仅用于计算速度，不触发 DIZZY）
        lastPositions = lastPositions.filter(p => now - p.time < 100);
      }

      // 🎯 创建点击 Ripple 效果（使用内联样式，因为 CSS 在 shadow DOM 中）
      function createRipple(x, y) {
        const ripple = document.createElement('div');
        // 使用内联样式，确保样式生效
        ripple.style.cssText = `
          position: fixed;
          left: ${x - 10}px;
          top: ${y - 10}px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(98, 179, 255, 0.9);
          background: rgba(98, 179, 255, 0.2);
          pointer-events: none;
          z-index: 2147483647;
          transform-origin: center;
          box-shadow: 0 0 10px rgba(98, 179, 255, 0.6);
          animation: pet-ripple-animation 0.6s ease-out forwards;
        `;
        
        // 添加动画关键帧到主文档（如果还没有）
        if (!document.getElementById('pet-ripple-style')) {
          const style = document.createElement('style');
          style.id = 'pet-ripple-style';
          style.textContent = `
            @keyframes pet-ripple-animation {
              0% {
                transform: scale(0);
                opacity: 0.8;
              }
              50% {
                opacity: 0.4;
              }
              100% {
                transform: scale(4);
                opacity: 0;
              }
            }
          `;
          document.head.appendChild(style);
        }
        
        document.body.appendChild(ripple);
        
        setTimeout(() => {
          if (ripple.parentNode) {
            ripple.remove();
          }
        }, 600);
      }

      // 🎯 垂摆动画循环（让桌宠跟随鼠标时有延迟感）
      function updatePendulumAnimation() {
        if (!isDragging) {
          animationFrameId = null;
          return;
        }
        
        // 使用缓动函数实现垂摆效果
        const damping = 0.15; // 阻尼系数，越小越有垂摆感
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        
        currentX += dx * damping;
        currentY += dy * damping;
        
        // 应用位置
        petContainer.style.left = `${currentX}px`;
        petContainer.style.top = `${currentY}px`;
        
        // 继续动画
        animationFrameId = requestAnimationFrame(updatePendulumAnimation);
      }

      // 拖动处理函数
      const handleMouseDown = (e) => {
        // 只允许通过 avatar 或 petContainer 拖动，避免按钮点击时触发
        const target = e.target;
        if (target.closest('.action-button') || 
            target.closest('.choice-overlay')) {
          return; // 按钮区域不拖动
        }
        
        // 🎯 记录开始时间和位置
        dragStartTime = Date.now();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // 🔧 初始化位置变量（但不立即应用，避免点击时移动）
        const rect = petContainer.getBoundingClientRect();
        currentX = rect.left;
        currentY = rect.top;
        
        lastPositions = []; // 重置速度追踪
        petContainer.style.cursor = 'grabbing';
        e.preventDefault();
        
        // 🎯 延迟触发拖拽（只有长按才触发）
        const longPressTimer = setTimeout(() => {
          isDragging = true;
          
          // 🔧 长按后立即计算并应用锚点偏移（修复长按不动时的错位问题）
          const anchorOffset = getAnchorOffset();
          targetX = dragStartX - anchorOffset.x;
          targetY = dragStartY - anchorOffset.y;
          
          // 边界约束
          const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
          const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
          const maxLeft = window.innerWidth - containerWidth * 0.7;
          const maxTop = window.innerHeight - containerHeight * 0.8;
          const minLeft = -containerWidth * 0.3;
          const minTop = -containerHeight * 0.2;
          
          targetX = Math.max(minLeft, Math.min(targetX, maxLeft));
          targetY = Math.max(minTop, Math.min(targetY, maxTop));
          
          // 🎯 应用初始位置（只在真正开始拖拽时）
          petContainer.style.left = `${targetX}px`;
          petContainer.style.top = `${targetY}px`;
          currentX = targetX;
          currentY = targetY;
          
          // 🎯 添加弹簧感：初始拖拽时的弹性效果
          petContainer.classList.remove('released', 'shaken', 'landed');
          petContainer.style.transition = 'transform 0.15s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
          requestAnimationFrame(() => {
            petContainer.style.transform = 'scale(1.05) rotate(2deg)';
            setTimeout(() => {
              petContainer.style.transition = '';
              petContainer.style.transform = '';
            }, 150);
          });

          // 🧠 拖动开始时触发 LIFTED 状态
          try {
            if (petFsm && petStates && petStates.LIFTED) {
              petFsm.setState(petStates.LIFTED, { loop: true });
            }
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set LIFTED state:', err);
          }
          
          // 🎯 启动垂摆动画
          if (!animationFrameId) {
            updatePendulumAnimation();
          }
        }, LONG_PRESS_THRESHOLD);
        
        // 🎯 保存 timer，用于在 mouseup 时清理
        petContainer._longPressTimer = longPressTimer;
      };

      const handleMouseMove = (e) => {
        // 🎯 只有真正开始拖拽后才更新位置
        if (!isDragging) return;
        
        // 🔧 实时获取最新锚点偏移
        const anchorOffset = getAnchorOffset();
        
        // 🎯 计算目标位置（让鼠标位置 = 锚点位置）
        let newTargetX = e.clientX - anchorOffset.x;
        let newTargetY = e.clientY - anchorOffset.y;
        
        // 边界约束（允许部分超出，更自然）
        const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
        const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
        const maxLeft = window.innerWidth - containerWidth * 0.7;
        const maxTop = window.innerHeight - containerHeight * 0.8;
        const minLeft = -containerWidth * 0.3;
        const minTop = -containerHeight * 0.2;
        
        targetX = Math.max(minLeft, Math.min(newTargetX, maxLeft));
        targetY = Math.max(minTop, Math.min(newTargetY, maxTop));
        
        // 🎯 启动垂摆动画
        if (!animationFrameId) {
          updatePendulumAnimation();
        }
        // 🎭 追踪速度（用于甩动检测）
        trackVelocity(e.clientX, e.clientY);
      };
      
      // 节流移动事件
      const throttledMouseMove = throttle(handleMouseMove, 16);

      const handleMouseUp = (e) => {
        // 🎯 清理长按定时器
        if (petContainer._longPressTimer) {
          clearTimeout(petContainer._longPressTimer);
          petContainer._longPressTimer = null;
        }
        
        // 🎯 停止垂摆动画
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        
        // 🎯 判断是点击还是拖拽
        const pressDuration = Date.now() - dragStartTime;
        const isLongPress = pressDuration >= LONG_PRESS_THRESHOLD;
        const moveDistance = Math.hypot(
          e.clientX - dragStartX,
          e.clientY - dragStartY
        );
        const isClick = !isLongPress && moveDistance < 5; // 移动距离小于5px认为是点击
        
        if (isDragging) {
          isDragging = false;
          petContainer.style.cursor = '';
          
          // 🎯 检测是否被快速甩动
          const velocity = calculateVelocity();
          
          // 清除之前的动画类
          petContainer.classList.remove('released', 'shaken', 'landed');
          petContainer.style.transition = '';
          petContainer.style.transform = '';
          
          if (velocity > SHAKE_VELOCITY_THRESHOLD) {
            // 甩动 → 晃动
            petContainer.classList.add('shaken');
            setTimeout(() => {
              petContainer.classList.remove('shaken');
            }, 500);
          } else {
            // 正常释放 → 轻微落地弹跳
            petContainer.classList.add('landed');
            setTimeout(() => {
              petContainer.classList.remove('landed');
            }, 400);
          }

          // 🧠 拖动结束回到 IDLE
          try {
            if (petFsm && petStates && petStates.IDLE) {
              petFsm.setState(petStates.IDLE, { loop: true });
            }
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set IDLE state after drag:', err);
          }
        }
        // 注意：ripple 效果在 handleAvatarClick 中处理，不在这里
      };

      // 在 petContainer 上添加拖动事件
      petContainer.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', throttledMouseMove);
      document.addEventListener('mouseup', (e) => {
        handleMouseUp(e);
        // ✅ v2.3: 拖动结束后保存位置（无论是否可见，都保存位置）
        if (petContainer && isDragging) {
          savePetState();
        }
      });
      
      // 设置可拖动样式
      petContainer.style.cursor = 'grab';
      petContainer.style.userSelect = 'none';

      // 点击 avatar 显示/隐藏按钮（支持图片和视频两种模式）
      const handleAvatarClick = (e) => {
        // 如果正在拖动，不触发点击
        if (isDragging) {
          return;
        }
        // 阻止事件冒泡，避免触发其他点击事件
        e.stopPropagation();
        
        // 🎯 创建 Ripple 效果（点击反馈）
        createRipple(e.clientX, e.clientY);
        
        // 🎯 连续点击检测（触发 DIZZY）
        const now = Date.now();
        if (now - lastClickTime < DIZZY_CLICK_RESET_TIME) {
          clickCount++;
        } else {
          clickCount = 1; // 重置计数
        }
        lastClickTime = now;
        
        // 如果连续点击达到阈值，触发 DIZZY 状态
        if (clickCount >= DIZZY_CLICK_THRESHOLD) {
          console.log('[Pet] 连续点击触发 DIZZY，点击次数:', clickCount);
          try {
            if (petFsm && petStates && petStates.DIZZY) {
              petFsm.setState(petStates.DIZZY, {
                loop: false,
                nextState: petStates.IDLE,
              });
              clickCount = 0; // 重置计数
              return; // 不切换按钮，直接返回
            }
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set DIZZY state on click:', err);
          }
        }
        
        setButtonsVisible(!isButtonsVisible);
        console.log('[Tab Cleaner Pet] Avatar clicked, buttons visible:', !isButtonsVisible, 'clickCount:', clickCount);
      };
      
      // 同时绑定到 avatar 和 avatarVideo（确保两种模式都能点击）
      if (avatar) {
        avatar.addEventListener('click', handleAvatarClick);
      }
      if (avatarVideo) {
        avatarVideo.addEventListener('click', handleAvatarClick);
      }
      // 如果都没有，绑定到 petMainEl 作为后备
      if (!avatar && !avatarVideo && petMainEl) {
        petMainEl.addEventListener('click', handleAvatarClick);
      }

      // 首次展示时给一个拖拽提示气泡
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['petDragHintShown'], (items) => {
            if (items.petDragHintShown) return;
            const main = shadow.querySelector('.desktop-pet-main');
            if (!main) return;

            const hint = document.createElement('div');
            hint.textContent = '拖拽网页图片到我这里即可收藏';
            hint.style.cssText = `
              position: absolute;
              bottom: 210px;
              left: 50%;
              transform: translateX(-50%);
              background: rgba(15,23,42,0.92);
              color: #F9FAFB;
              padding: 6px 12px;
              border-radius: 999px;
              font-size: 12px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              box-shadow: 0 6px 18px rgba(15,23,42,0.4);
              z-index: 9999;
              opacity: 0;
              pointer-events: none;
              white-space: nowrap;
              transition: opacity 0.25s ease-out, transform 0.25s ease-out;
            `;

            main.appendChild(hint);

            requestAnimationFrame(() => {
              hint.style.opacity = '1';
              hint.style.transform = 'translateX(-50%) translateY(-4px)';
            });

            setTimeout(() => {
              hint.style.opacity = '0';
              hint.style.transform = 'translateX(-50%) translateY(0)';
              setTimeout(() => hint.remove(), 250);
            }, 3500);

            chrome.storage.local.set({ petDragHintShown: true }, () => {});
          });
        }
      } catch (e) {
        // 忽略提示错误
      }

      if (actionButtons && actionButtons.length > 0) {
        actionButtons.forEach((btn) => {
          btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const action = btn.getAttribute('data-action');
            // 使用 pet_actions.js 模块（如果可用）
            const petActions = window.TabCleanerPetActions;
            if (petActions && petActions.handlePetAction) {
              petActions.handlePetAction(action, {
                showFullscreenCleaningAnimation: window.TabCleanerPetCleaningAnimation?.show || showFullscreenCleaningAnimation,
                hideFullscreenCleaningAnimation: window.TabCleanerPetCleaningAnimation?.hide || hideFullscreenCleaningAnimation,
                triggerCleaningEffect: (dur) => triggerCleaningEffect(dur),
                petMainEl: petMainEl,
              });
            } else {
              // 降级：使用本地函数
              handlePetAction(action);
            }
            setButtonsVisible(false);
          });
        });
      }

      // 🧠 初始化大象状态机（仅当存在视频元素且状态机脚本已加载时）
      if (avatarVideo && window.TabCleanerPetFSM) {
        try {
          const { createPetStateMachine, PET_STATES } = window.TabCleanerPetFSM;
          petStates = PET_STATES;
          petFsm = createPetStateMachine({
            assetFn: asset,
            petContainerRef: () => petContainer,
            videoElRef: () => avatarVideo,
            getPetId: () => currentPetId,
            getIsDragging: () => isDragging,
            openPersonalSpace: () => {
              try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                  chrome.runtime.sendMessage({ action: "open-personalspace" });
                }
              } catch (_) {}
            },
            config: {},
          });
          if (petFsm && petFsm.setState) {
            petFsm.setState(PET_STATES.IDLE, { loop: true });
          }
        } catch (e) {
          console.warn('[Tab Cleaner Pet] Failed to init FSM:', e);
        }
      }

      // 💬 初始化聊天气泡状态机
      if (window.TabCleanerPetChatBubble) {
        try {
          const chatBubbleEl = shadow.querySelector('.chat-bubble');
          const textContentEl = shadow.querySelector('.chat-bubble-text');
          
          if (chatBubbleEl && textContentEl) {
            const chatBubbleCfg = (window.__TAB_CLEANER_PET_CONFIG || {}).chatBubble || {};
            
            // 根据配置调整位置（基于新的默认位置：left: 180px, top: -20px）
            // 始终设置位置，确保覆盖 CSS 默认值
            const offsetX = chatBubbleCfg.positionOffsetX !== undefined ? chatBubbleCfg.positionOffsetX : 0;
            const offsetY = chatBubbleCfg.positionOffsetY !== undefined ? chatBubbleCfg.positionOffsetY : 0;
            chatBubbleEl.style.left = `${180 + offsetX}px`;
            chatBubbleEl.style.top = `${-20 + offsetY}px`;
            
            const chatBubbleFsm = window.TabCleanerPetChatBubble.createChatBubbleStateMachine({
              assetFn: asset,
              chatBubbleEl: chatBubbleEl,
              textContentEl: textContentEl,
              config: chatBubbleCfg,
            });
            
            // 启动自动显示循环
            if (chatBubbleFsm && chatBubbleFsm.scheduleNext) {
              chatBubbleFsm.scheduleNext();
            }
            
            // 暴露到全局，方便其他功能触发
            window.__TAB_CLEANER_PET_CHAT_BUBBLE = chatBubbleFsm;
            
            console.log('[Tab Cleaner Pet] ✅ Chat bubble initialized');
          }
        } catch (e) {
          console.warn('[Tab Cleaner Pet] Failed to init chat bubble:', e);
        }
      }

      // 初始皮肤同步（非大象或后备）
      applyPetSkin(currentPetId);

      // ✅ 确保 body 存在后再添加，只有真正添加到 DOM 后才标记为初始化完成
      const addToDOM = () => {
        if (document.body && petContainer) {
          document.body.appendChild(petContainer);
          // 初始状态：隐藏
          petContainer.style.display = "none";
          isPetVisible = false;
          // ✅ 只有容器真正添加到 DOM 后才标记为初始化完成
          petInitialized = true;
          console.log("[Tab Cleaner Pet] ✅ Pet container initialized and added to DOM");
          resolve();
        } else {
          console.warn("[Tab Cleaner Pet] ⚠️ Cannot add container: body or container missing");
          resolve(); // 即使失败也 resolve，避免无限等待
        }
      };

      if (document.body) {
        addToDOM();
      } else {
        // 如果 body 还没准备好，等待 DOMContentLoaded
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            addToDOM();
          }, { once: true });
        } else {
          // 如果已经加载完成，直接添加
          addToDOM();
        }
      }
    });
  }

  // 显示宠物（简化版本：直接创建并显示，初始化在后台进行）
  async function showPet() {
    try {
      console.log("[Tab Cleaner Pet] showPet() called, petContainer:", !!petContainer);
      
      // ✅ 简化：如果容器不存在，直接创建（不等待初始化完成）
      if (!petContainer) {
        console.log("[Tab Cleaner Pet] Container not found, creating...");
        await createPet();
      }
      
      // ✅ 立即显示，不等待初始化完成（初始化在后台继续）
      if (petContainer) {
        // ✅ 直接设置显示，不使用 requestAnimationFrame（减少延迟）
        petContainer.style.display = "block";
        isPetVisible = true;
        setButtonsVisible(false);
        console.log("[Tab Cleaner Pet] Pet shown successfully", {
          containerExists: !!petContainer,
          display: petContainer.style.display,
          isVisible: isPetVisible
        });
        
        // ✅ 保存状态到存储（同步到所有标签页）
        savePetState();
      } else {
        console.warn("[Tab Cleaner Pet] Pet container not available after createPet(), initialization may still be in progress");
        // ✅ 即使容器还没创建，也尝试保存状态（下次会重试）
        isPetVisible = true;
        savePetState();
        
        // ✅ v2.3: 如果容器创建失败，延迟重试
        setTimeout(async () => {
          if (!petContainer) {
            console.log("[Tab Cleaner Pet] Retrying container creation...");
            await createPet();
            if (petContainer) {
              petContainer.style.display = "block";
              isPetVisible = true;
              savePetState();
              console.log("[Tab Cleaner Pet] Pet shown after retry");
            }
          }
        }, 500);
      }
    } catch (err) {
      console.error("[Tab Cleaner Pet] Error in showPet:", err);
      // ✅ 即使出错，也尝试保存状态（可能部分成功）
      if (isPetVisible) {
        savePetState();
      }
    }
  }

  // 隐藏宠物
  function hidePet() {
    if (!petContainer) return;
    petContainer.style.display = "none";
    isPetVisible = false;
    setButtonsVisible(false);
    
    // ✅ 保存状态到存储（同步到所有标签页）
    savePetState();
  }

  // 切换宠物显示
  function togglePet() {
    if (isPetVisible) {
      hidePet();
    } else {
      showPet();
    }
  }

  /**
   * ✅ v2.1: forceShow() - 强制显示宠物，不管初始化状态
   * 作为 show() 失败时的备选方案
   */
  async function forceShow() {
    try {
      if (!petContainer) {
        await createPet();
      }
      if (petContainer) {
        petContainer.style.display = "block";
        isPetVisible = true;
        await savePetState();
        console.log("[Tab Cleaner Pet] forceShow called, forcing display...");
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Tab Cleaner Pet] Error in forceShow:", e);
      return false;
    }
  }

  // ✅ 导出 API
  const api = {
    show: showPet,
    hide: hidePet,
    toggle: togglePet,
    isVisible: () => isPetVisible,
    ensureInitialized: ensureInitialized, // ✅ 新增：等待初始化完成的方法
    forceShow: forceShow, // ✅ v2.1: 强制显示方法
    // 🧠 状态机接口：允许外部触发 raise-attention / clean-success / dizzy 等状态
    setState: (state, options) => {
      if (petFsm && typeof petFsm.setState === 'function') {
        petFsm.setState(state, options || {});
      } else {
        console.warn('[Tab Cleaner Pet] setState called but FSM not initialized');
      }
    },
  };
  
  try {
    window.__TAB_CLEANER_PET = api;
    
    // ✅ v2.3: 设置存储同步监听器（必须在 API 导出后）
    setupStorageSync();
    
    // ✅ v2.3: 加载宠物状态（从存储中读取，自动显示/隐藏）
    loadPetState();
    syncPetSkinFromStorage();
    
    // 触发加载完成事件，通知监听器（如果有的话）
    const event = new CustomEvent('__TAB_CLEANER_PET_LOADED', {
      detail: { api: api }
    });
    window.dispatchEvent(event);
    
    // ✅ v2.1: 监听强制显示事件（作为最后的备选方案）
    window.addEventListener('__TAB_CLEANER_FORCE_SHOW_PET', () => {
      console.log("[Tab Cleaner Pet] Force show event received");
      forceShow();
    });
    
    console.log("[Tab Cleaner Pet] Module loaded successfully!", {
      hasToggle: typeof api.toggle === 'function',
      hasShow: typeof api.show === 'function',
      hasHide: typeof api.hide === 'function',
      hasForceShow: typeof api.forceShow === 'function',
      module: api
    });
  } catch (e) {
    console.error("[Tab Cleaner Pet] Failed to export API:", e);
    // 如果导出失败，重置标志允许重试
    window.__TAB_CLEANER_PET_LOADED = false;
  }
})();

