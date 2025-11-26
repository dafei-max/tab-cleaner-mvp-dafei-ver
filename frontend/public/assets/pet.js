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
  
  // ✅ 初始化状态标志：标记容器是否真正添加到 DOM
  let petInitialized = false;
  
  // ✅ 全局状态同步：从 Chrome Storage 读取宠物状态
  let petStateLoaded = false;

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

    const stopEffect = triggerCleaningEffect(2500);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: runtimeAction }, () => {
          stopEffect();
        });
        setTimeout(stopEffect, 5000);
      } catch (err) {
        console.warn('[Tab Cleaner Pet] Failed to send action message:', err);
        stopEffect();
      }
    } else {
      setTimeout(stopEffect, 1500);
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
          chrome.storage.local.get(['petVisible', 'petPosition'], (items) => {
            resolve(items);
          });
        });
        
        const shouldBeVisible = result.petVisible === true;
        petStateLoaded = true;
        
        console.log('[Tab Cleaner Pet] Loaded pet state from storage:', {
          petVisible: shouldBeVisible,
          petPosition: result.petPosition
        });
        
        // ✅ v2.2: 根据存储状态立即显示或隐藏（模块已加载，响应更快）
        if (shouldBeVisible) {
          // 延迟一下确保页面已加载
          const showAndRestorePosition = async () => {
            await showPet();
            // ✅ 恢复位置（在容器创建后）
            if (result.petPosition && petContainer) {
              petContainer.style.left = result.petPosition.left;
              petContainer.style.top = result.petPosition.top;
              console.log('[Tab Cleaner Pet] Position restored:', result.petPosition);
            }
          };
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => showAndRestorePosition(), 100);
            }, { once: true });
          } else {
            setTimeout(() => showAndRestorePosition(), 100);
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
        const position = petContainer ? {
          left: petContainer.style.left,
          top: petContainer.style.top
        } : null;
        
        await new Promise((resolve) => {
          chrome.storage.local.set({
            petVisible: isPetVisible,
            petPosition: position
          }, () => {
            if (chrome.runtime.lastError) {
              console.warn('[Tab Cleaner Pet] Failed to save pet state:', chrome.runtime.lastError);
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
    
    // 方式 1: 使用 chrome.runtime.getURL（如果可用）
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      try {
        url = chrome.runtime.getURL(path);
        method = 'chrome.runtime.getURL';
      } catch (e) {
        console.warn("[Tab Cleaner Pet] chrome.runtime.getURL failed:", e);
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

        .desktop-pet-main .props {
          height: 113px;
          left: 0;
          position: absolute;
          top: 78px;
          width: 84px;
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

        .desktop-pet-main .avatar::after {
          content: "";
          position: absolute;
          inset: -20px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(130,199,255,0.2) 60%, rgba(255,255,255,0) 100%);
          opacity: 0;
          transition: opacity 0.25s ease;
          filter: blur(4px);
          pointer-events: none;
        }

        .desktop-pet-main .avatar:hover {
          transform: translateY(-6px) scale(1.03);
          box-shadow: 0 10px 18px rgba(82, 160, 255, 0.35);
        }

        .desktop-pet-main .avatar:hover::after {
          opacity: 0.9;
        }

        .desktop-pet-main .chat-bubble {
          display: none;
          height: 89px;
          left: 160px;
          position: absolute;
          top: 0;
          width: 109px;
        }

        .desktop-pet-main .div {
          flex: 1;
          position: relative;
          width: 111px;
        }

        .desktop-pet-main .chatbubble-bg {
          height: 100.00%;
          left: 0;
          position: absolute;
          top: 0;
          width: 98.16%;
        }

        .desktop-pet-main .rectangle {
          background-color: #fdfdfd;
          height: 19.07%;
          left: 38.74%;
          position: absolute;
          top: 20.19%;
          width: 20.72%;
        }

        .desktop-pet-main .emoji-status {
          align-items: center;
          color: #000000;
          display: flex;
          font-family: "Inter", Helvetica;
          font-size: 10px;
          font-weight: 400;
          height: 33.66%;
          justify-content: center;
          left: 0;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          text-align: center;
          top: 26.92%;
          width: 98.20%;
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

        .desktop-pet-main.pet-cleaning .avatar::after {
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
      </style>
    `;
  }

  // 生成宠物 HTML
  function generatePetHTML() {
    return `
      <div class="desktop-pet-main">
        <div class="pet-main">
          <img class="props" alt="Props" src="${asset('static/img/props.svg')}" />
          <div class="avatar"></div>
          <div class="chat-bubble">
            <div class="div">
              <img class="chatbubble-bg" alt="Chatbubble bg" src="${asset('static/img/chatbubble-bg.png')}" />
              <div class="rectangle"></div>
              <div class="emoji-status">💦</div>
            </div>
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
      const css = await loadPetCss();
      const html = generatePetHTML();
      shadow.innerHTML = `${css}${html}`;

      // 绑定事件
      const avatar = shadow.querySelector('.avatar');
      const choiceOverlay = shadow.querySelector('.choice-overlay');
      const actionButtons = shadow.querySelectorAll('.action-button');
      petMainEl = shadow.querySelector('.desktop-pet-main');
      choiceOverlayEl = choiceOverlay;
      applyPetSkin(currentPetId);

      // ✅ 添加拖动功能 - 让整个 petContainer 可以拖动
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      // 拖动处理函数
      const handleMouseDown = (e) => {
        // 只允许通过 avatar 或 petContainer 拖动，避免按钮点击时触发
        const target = e.target;
        if (target.closest('.action-button') || 
            target.closest('.choice-overlay')) {
          return; // 按钮区域不拖动
        }
        
        isDragging = true;
        const rect = petContainer.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        
        petContainer.style.cursor = 'grabbing';
        e.preventDefault();
      };

      const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        const newLeft = initialLeft + dx;
        const newTop = initialTop + dy;
        
        // 限制在可视区域内
        const maxLeft = window.innerWidth - petContainer.offsetWidth;
        const maxTop = window.innerHeight - petContainer.offsetHeight;
        
        petContainer.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
        petContainer.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
        petContainer.style.right = 'auto';
        petContainer.style.bottom = 'auto';
      };

      const handleMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          petContainer.style.cursor = '';
        }
      };

      // 在 petContainer 上添加拖动事件
      petContainer.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', () => {
        handleMouseUp();
        // ✅ v2.3: 拖动结束后保存位置（无论是否可见，都保存位置）
        if (petContainer) {
          savePetState();
        }
      });
      
      // 设置可拖动样式
      petContainer.style.cursor = 'grab';
      petContainer.style.userSelect = 'none';

      // 点击 avatar 显示/隐藏按钮
      if (avatar) {
        avatar.addEventListener('click', (e) => {
          // 如果正在拖动，不触发点击
          if (isDragging) {
            return;
          }
          setButtonsVisible(!isButtonsVisible);
        });
      }

      if (actionButtons && actionButtons.length > 0) {
        actionButtons.forEach((btn) => {
          btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const action = btn.getAttribute('data-action');
            handlePetAction(action);
            setButtonsVisible(false);
          });
        });
      }

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
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (petContainer) {
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
            console.warn("[Tab Cleaner Pet] petContainer became null in requestAnimationFrame");
          }
        });
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

