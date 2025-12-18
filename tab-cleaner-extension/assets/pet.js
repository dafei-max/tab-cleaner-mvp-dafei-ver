// pet.js - 宠物模块，独立处理桌面宠物功能
(function () {
  'use strict';
  
  console.log('[Tab Cleaner Pet] 🚀 pet.js script loaded!', {
    timestamp: new Date().toISOString(),
    url: window.location.href
  });
  
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
  
  // ✅ 全局状态同步：从 Chrome Storage 读取宠物状态（已移至模块）

  // 🧠 状态机实例（仅大象使用）
  let petFsm = null;
  let petStates = null;
  
  // 使用模块：清理动画
  function showFullscreenCleaningAnimation() {
    const module = window.TabCleanerPetCleaningAnimation;
    if (module && module.show) {
      module.show();
    } else {
      console.warn('[Tab Cleaner Pet] Cleaning animation module not loaded');
    }
  }
  
  function hideFullscreenCleaningAnimation() {
    const module = window.TabCleanerPetCleaningAnimation;
    if (module && module.hide) {
      module.hide();
    }
  }

  // 使用模块：从 pet_ui.js 获取
  function getPetAsset(petId) {
    const petUI = window.TabCleanerPetUI;
    if (petUI && petUI.PET_IMAGE_MAP) {
      return petUI.PET_IMAGE_MAP[petId] || petUI.PET_IMAGE_MAP[petUI.DEFAULT_PET_ID];
    }
    // 降级
    const PET_IMAGE_MAP = {
      turtle: 'static/img/turtle.svg',
      elephant: 'static/img/elephant.svg',
      squirrel: 'static/img/squrrial.svg',
    };
    const DEFAULT_PET_ID = 'elephant';
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
    
    const isElephant = currentPetId === 'elephant';
    const avatar = shadow.querySelector('.avatar');
    const avatarVideo = shadow.querySelector('.avatar-video');
    
    if (isElephant && avatarVideo) {
      // 大象使用视频
      avatarVideo.style.opacity = '0';
      avatarVideo.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        const source = avatarVideo.querySelector('source');
        if (source) {
          source.src = asset('static/video/idle-elephant.webm');
          avatarVideo.load(); // 重新加载视频
        }
        avatarVideo.style.opacity = '1';
      }, 150);
    } else if (avatar) {
      // 其他宠物使用静态图片
      avatar.style.opacity = '0';
      avatar.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        avatar.style.backgroundImage = `url("${asset(getPetAsset(currentPetId))}")`;
        avatar.style.opacity = '1';
      }, 150);
    }
  }

  function setButtonsVisible(visible) {
    isButtonsVisible = visible;
    if (choiceOverlayEl) {
      choiceOverlayEl.classList.toggle('visible', visible);
    }
  }

  // 使用模块：动作处理
  function triggerCleaningEffect(duration = 2200) {
    const module = window.TabCleanerPetActions;
    if (module && module.triggerCleaningEffect) {
      return module.triggerCleaningEffect(duration, petMainEl);
    }
    // 降级
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
    const module = window.TabCleanerPetActions;
    if (module && module.handlePetAction) {
      module.handlePetAction(action, {
        showFullscreenCleaningAnimation,
        hideFullscreenCleaningAnimation,
        triggerCleaningEffect,
        petMainEl,
      });
    } else {
      // 降级
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
    showFullscreenCleaningAnimation();
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
        hideFullscreenCleaningAnimation();
      }
    } else {
      setTimeout(stopEffect, 1500);
      hideFullscreenCleaningAnimation();
      }
    }
  }

  // 使用模块：从 pet_ui.js 获取配置
  const petUI = window.TabCleanerPetUI;
  const DEFAULT_PET_ID = petUI?.DEFAULT_PET_ID || 'elephant';
  const PET_IMAGE_MAP = petUI?.PET_IMAGE_MAP || {
    turtle: 'static/img/turtle.svg',
    elephant: 'static/img/elephant.svg',
    squirrel: 'static/img/squrrial.svg',
  };
  let currentPetId = DEFAULT_PET_ID;

  // 使用模块：存储同步
  async function loadPetState() {
    const module = window.TabCleanerPetStorage;
    if (module && module.loadPetState) {
      return await module.loadPetState({
        petContainer,
        isPetVisible,
        setPetVisible: (v) => { isPetVisible = v; },
        showPet,
        createPet,
      });
    }
    return null;
  }
  
  async function savePetState() {
    const module = window.TabCleanerPetStorage;
    if (module && module.savePetState) {
      await module.savePetState({
        petContainer,
        isPetVisible,
      });
    }
  }
  
  function setupStorageSync() {
    const module = window.TabCleanerPetStorage;
    if (module && module.setupStorageSync) {
      module.setupStorageSync({
        showPet,
        hidePet,
        petContainer,
        setPetVisible: (v) => { isPetVisible = v; },
      });
    }
  }
  
  function setPetVisible(visible) {
    isPetVisible = visible;
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

  // 降级函数：如果模块未加载，使用本地实现（保留作为后备）
  async function loadPetCss() {
    const petUI = window.TabCleanerPetUI;
    if (petUI && petUI.loadPetCss) {
      return petUI.loadPetCss(asset, currentPetId);
    }
    // 降级实现（简化版，使用默认配置）
    const BUTTON_GROUP_CONFIG = {
      overlayRight: 80,
      overlayTop: 60,
      buttonWidth: 44,
      buttonHeight: 37,
      buttonGap: 8,
      tooltipOffset: 6,
      tooltipPaddingX: 8,
      tooltipPaddingY: 3,
      tooltipFontSize: 10,
      hoverTranslateX: -2,
      hoverScale: 1.02,
    };
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');
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
          height: 130px;
          left: 70px;
          position: absolute;
          top: 64px;
          width: 140px;
          cursor: pointer;
        }
        .desktop-pet-main .avatar-video {
          height: 130px;
          left: 70px;
          position: absolute;
          top: 64px;
          width: 140px;
          cursor: pointer;
          object-fit: contain;
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
        }
        .desktop-pet-main .choice-overlay.visible {
          opacity: 1;
          pointer-events: auto;
        }
        .desktop-pet-main .action-button {
          width: ${BUTTON_GROUP_CONFIG.buttonWidth}px;
          height: ${BUTTON_GROUP_CONFIG.buttonHeight}px;
          border: none;
          background: none;
          padding: 0;
          cursor: pointer;
        }
      </style>
    `;
  }

  function generatePetHTML() {
    const petUI = window.TabCleanerPetUI;
    if (petUI && petUI.generatePetHTML) {
      return petUI.generatePetHTML(asset, currentPetId);
    }
    // 降级实现（简化版）- 必须包含 chat-bubble
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
      // 使用 pet_ui.js 模块
      const petUIModule = window.TabCleanerPetUI;
      let css, html;
      if (petUIModule && petUIModule.loadPetCss && petUIModule.generatePetHTML) {
        css = petUIModule.loadPetCss(asset, currentPetId);
        html = petUIModule.generatePetHTML(asset, currentPetId);
      } else {
        // 降级：使用本地函数（如果存在）
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

      // 🧠 先初始化大象状态机（仅当存在视频元素且状态机脚本已加载时）
      // 这样 petFsm 和 petStates 可以在 setupDragHandlers 中使用
      // 使用一个可变引用来解决循环依赖
      let isDraggingRef = { value: false };
      let getIsDragging = () => isDraggingRef.value;
      
      if (avatarVideo && window.TabCleanerPetFSM) {
        try {
          const { createPetStateMachine, PET_STATES } = window.TabCleanerPetFSM;
          petStates = PET_STATES;
          petFsm = createPetStateMachine({
            assetFn: asset,
            petContainerRef: () => petContainer,
            videoElRef: () => avatarVideo,
            getPetId: () => currentPetId,
            getIsDragging: getIsDragging, // 使用函数引用
            openPersonalSpace: () => {
              try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                  chrome.runtime.sendMessage({ action: "open-personalspace" });
                }
              } catch (_) {}
            },
            config: {},
          });
          // 默认进入闲置并允许漫步
          if (petFsm && petFsm.setState) {
            petFsm.setState(PET_STATES.IDLE, { loop: true });
          }
          console.log('[Tab Cleaner Pet] ✅ State machine initialized:', {
            hasPetFsm: !!petFsm,
            hasPetStates: !!petStates,
            hasQUESTION: !!(petStates && petStates.QUESTION)
          });
        } catch (e) {
          console.warn('[Tab Cleaner Pet] Failed to init FSM:', e);
        }
      }

      // ✅ 使用模块：拖拽功能（在状态机初始化之后）
      console.log('[Tab Cleaner Pet] Setting up drag handlers:', {
        hasDragModule: !!window.TabCleanerPetDrag,
        hasSetupDragHandlers: !!(window.TabCleanerPetDrag && window.TabCleanerPetDrag.setupDragHandlers),
        hasPetFsm: !!petFsm,
        hasPetStates: !!petStates,
        hasAvatar: !!avatar,
        hasAvatarVideo: !!avatarVideo
      });
      
      const dragModule = window.TabCleanerPetDrag;
      let dragHandlers = null;
      if (dragModule && dragModule.setupDragHandlers) {
        console.log('[Tab Cleaner Pet] ✅ Calling setupDragHandlers');
        dragHandlers = dragModule.setupDragHandlers({
          petContainer,
          shadow,
          avatar,
          avatarVideo,
          petMainEl,
          setButtonsVisible,
          petFsm,
          petStates,
          savePetState,
        });
        console.log('[Tab Cleaner Pet] ✅ Drag handlers setup complete:', {
          hasHandlers: !!dragHandlers,
          hasIsDragging: !!(dragHandlers && dragHandlers.isDragging)
        });
        // 更新 isDragging 引用，让状态机可以访问
        if (dragHandlers?.isDragging) {
          const originalIsDragging = dragHandlers.isDragging;
          getIsDragging = () => {
            const result = originalIsDragging();
            isDraggingRef.value = result;
            return result;
          };
        }
      } else {
        // 降级：基本拖拽功能（简化版）
        petContainer.style.cursor = 'grab';
        petContainer.style.userSelect = 'none';
        petContainer.style.contain = 'layout style';
        petContainer.style.willChange = 'transform';
        
        // 降级：添加基本的点击处理（确保 chat bubble 和 QUESTION 动画能触发）
        const handleAvatarClickFallback = (e) => {
          e.stopPropagation();
          console.log('[Tab Cleaner Pet] Fallback click handler called');
          
          // 优先使用状态机的统一处理
          if (window.TabCleanerPetFSM && typeof window.TabCleanerPetFSM.handleAvatarClick === 'function') {
            try {
              console.log('[Tab Cleaner Pet] Using state machine handleAvatarClick (fallback)');
              window.TabCleanerPetFSM.handleAvatarClick(petFsm, petStates);
            } catch (err) {
              console.error('[Tab Cleaner Pet] Error in state machine handleAvatarClick (fallback):', err);
            }
          } else {
            // 如果状态机不可用，使用降级逻辑
            console.warn('[Tab Cleaner Pet] State machine not available, using direct fallback');
            
            // 💬 触发互动对话（点击小象时显示 id:26 的对话）
            if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.trigger) {
              try {
                console.log('[Tab Cleaner Pet] 💬 Triggering chat bubble with dialogue ID: 26 (fallback)');
                window.__TAB_CLEANER_PET_CHAT_BUBBLE.trigger(null, 26);
              } catch (err) {
                console.error('[Tab Cleaner Pet] Failed to trigger chat bubble on click (fallback):', err);
              }
            }
            
            // 🎬 播放 question 动画（单击时）
            if (petFsm && petStates && petStates.QUESTION) {
              try {
                console.log('[Tab Cleaner Pet] 🎬 Setting QUESTION state (fallback)...');
                petFsm.setState(petStates.QUESTION, {
                  loop: false,
                  nextState: petStates.IDLE,
                });
              } catch (err) {
                console.error('[Tab Cleaner Pet] Failed to set QUESTION state on click (fallback):', err);
              }
            }
          }
          
          // 切换按钮显示
          if (setButtonsVisible) {
            const choiceOverlay = shadow.querySelector('.choice-overlay');
            const isCurrentlyVisible = choiceOverlay && choiceOverlay.classList.contains('visible');
            setButtonsVisible(!isCurrentlyVisible);
          }
        };
        
        if (avatar) avatar.addEventListener('click', handleAvatarClickFallback);
        if (avatarVideo) avatarVideo.addEventListener('click', handleAvatarClickFallback);
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

      // 💬 初始化聊天气泡状态机
      console.log('[Tab Cleaner Pet] Checking chat bubble module:', {
        exists: !!window.TabCleanerPetChatBubble,
        hasCreate: !!(window.TabCleanerPetChatBubble && window.TabCleanerPetChatBubble.createChatBubbleStateMachine)
      });
      
      if (window.TabCleanerPetChatBubble) {
        try {
          const chatBubbleEl = shadow.querySelector('.chat-bubble');
          const textContentEl = shadow.querySelector('.chat-bubble-text');
          
          console.log('[Tab Cleaner Pet] Chat bubble elements:', {
            chatBubbleEl: !!chatBubbleEl,
            textContentEl: !!textContentEl,
            shadowHTML: shadow.innerHTML.substring(0, 200)
          });
          
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
            
            console.log('[Tab Cleaner Pet] ✅ Chat bubble initialized:', {
              hasTrigger: !!chatBubbleFsm.trigger,
              hasShow: !!chatBubbleFsm.show,
              hasHide: !!chatBubbleFsm.hide
            });
          } else {
            console.error('[Tab Cleaner Pet] ❌ Chat bubble elements not found in shadow DOM!');
          }
        } catch (e) {
          console.error('[Tab Cleaner Pet] Failed to init chat bubble:', e);
        }
      } else {
        console.error('[Tab Cleaner Pet] ❌ TabCleanerPetChatBubble module not loaded!');
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

