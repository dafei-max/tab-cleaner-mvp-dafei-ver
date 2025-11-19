// pet.js - 宠物模块，独立处理桌面宠物功能
(function () {
  'use strict';
  
  // ✅ 检查是否已经加载（避免重复加载）
  if (window.__TAB_CLEANER_PET) {
    console.log("[Tab Cleaner Pet] Module already loaded, skipping initialization");
    return;
  }

  let petContainer = null;
  let isPetVisible = false;
  let isButtonsVisible = false;
  
  // ✅ 初始化状态标志：标记容器是否真正添加到 DOM
  let petInitialized = false;
  
  // ✅ 全局状态同步：从 Chrome Storage 读取宠物状态
  let petStateLoaded = false;
  
  /**
   * 从 Chrome Storage 加载宠物状态
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
        
        // 如果应该显示，立即显示（但需要等待容器创建）
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
   */
  function setupStorageSync() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      return;
    }
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      if (changes.petVisible) {
        const newVisible = changes.petVisible.newValue === true;
        console.log('[Tab Cleaner Pet] Pet visibility changed via storage:', newVisible);
        
        if (newVisible !== isPetVisible) {
          if (newVisible) {
            showPet();
          } else {
            hidePet();
          }
        }
      }
      
      if (changes.petPosition && petContainer) {
        const newPosition = changes.petPosition.newValue;
        if (newPosition && newPosition.left && newPosition.top) {
          petContainer.style.left = newPosition.left;
          petContainer.style.top = newPosition.top;
        }
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
          background-image: url("${asset('static/img/avatar.png')}");
          background-size: 100% 100%;
          height: 124px;
          left: 70px;
          position: absolute;
          top: 64px;
          width: 129px;
          cursor: pointer;
        }

        .desktop-pet-main .chat-bubble {
          display: flex;
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
          height: 62.20%;
          left: 38.73%;
          position: absolute;
          top: 37.80%;
          width: 61.27%;
          display: none;
        }

        .desktop-pet-main .choice-overlay.visible {
          display: block;
        }

        .desktop-pet-main .hide-button {
          height: 68px;
          left: 2px;
          position: absolute;
          top: 104px;
          width: 48px;
          cursor: pointer;
        }

        .desktop-pet-main .text-wrapper {
          color: #ffffff;
          font-family: "FZLanTingYuanS-R-GB-Regular", Helvetica;
          font-size: 8px;
          font-weight: 400;
          height: 23.53%;
          left: 33.53%;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          text-align: center;
          top: 76.47%;
          width: 58.32%;
          pointer-events: none;
        }

        .desktop-pet-main .ellipse {
          background-color: #0a78ff;
          border-radius: 22.63px / 13.69px;
          height: 27px;
          left: 1px;
          position: absolute;
          top: 13px;
          transform: rotate(56.00deg);
          width: 45px;
        }

        .desktop-pet-main .text-wrapper-2 {
          color: #ffffff;
          font-family: "Material Icons", Helvetica;
          font-size: 16px;
          font-weight: 400;
          left: 16px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 18px;
          white-space: nowrap;
          pointer-events: none;
        }

        .desktop-pet-main .vector {
          height: 18px;
          left: 20px;
          position: absolute;
          top: 17px;
          width: 10px;
          pointer-events: none;
        }

        .desktop-pet-main .setting-button {
          height: 60px;
          left: 41px;
          position: absolute;
          top: 94px;
          width: 66px;
          cursor: pointer;
        }

        .desktop-pet-main .text-wrapper-3 {
          color: #ffffff;
          font-family: "FZLanTingYuanS-R-GB-Regular", Helvetica;
          font-size: 8px;
          font-weight: 400;
          height: 20.00%;
          left: 15.15%;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          text-align: center;
          top: 80.00%;
          width: 84.85%;
          pointer-events: none;
        }

        .desktop-pet-main .ellipse-2 {
          background-color: #0a78ff;
          border-radius: 22.63px / 13.69px;
          height: 27px;
          left: 3px;
          position: absolute;
          top: 12px;
          transform: rotate(42.81deg);
          width: 45px;
        }

        .desktop-pet-main .text-wrapper-4 {
          color: #ffffff;
          font-family: "Material Icons", Helvetica;
          font-size: 20px;
          font-weight: 400;
          left: 16px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 15px;
          white-space: nowrap;
          pointer-events: none;
        }

        .desktop-pet-main .clean-current-button {
          height: 81px;
          left: 88px;
          position: absolute;
          top: 0;
          width: 135px;
          cursor: pointer;
        }

        .desktop-pet-main .ellipse-3 {
          background-color: #0a78ff;
          border-radius: 52.5px / 29.5px;
          height: 59px;
          left: 0;
          position: absolute;
          top: 0;
          width: 105px;
        }

        .desktop-pet-main .text-wrapper-5 {
          color: #ffffff;
          font-family: "FZLanTingYuanS-R-GB-Regular", Helvetica;
          font-size: 12px;
          font-weight: 400;
          height: 19.75%;
          left: 29.63%;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          text-align: center;
          top: 80.25%;
          width: 70.37%;
          pointer-events: none;
        }

        .desktop-pet-main .text-wrapper-6 {
          color: #ffffff;
          font-family: "Material Icons", Helvetica;
          font-size: 40px;
          font-weight: 400;
          left: 33px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 5px;
          white-space: nowrap;
          pointer-events: none;
        }

        .desktop-pet-main .clean-inoneclick {
          height: 75px;
          left: 65px;
          position: absolute;
          top: 59px;
          width: 111px;
          cursor: pointer;
        }

        .desktop-pet-main .ellipse-4 {
          background-color: #0a78ff;
          border-radius: 32.59px / 19.71px;
          height: 39px;
          left: 5px;
          position: absolute;
          top: 12px;
          transform: rotate(25.46deg);
          width: 65px;
        }

        .desktop-pet-main .text-wrapper-7 {
          color: #ffffff;
          font-family: "FZLanTingYuanS-R-GB-Regular", Helvetica;
          font-size: 10px;
          font-weight: 400;
          height: 22.18%;
          left: 5.11%;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          text-align: center;
          top: 77.82%;
          width: 94.89%;
          pointer-events: none;
        }

        .desktop-pet-main .text-wrapper-8 {
          color: #9d9d9d;
          font-family: "Material Icons", Helvetica;
          font-size: 24px;
          font-weight: 400;
          left: 12px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 15px;
          white-space: nowrap;
          pointer-events: none;
        }

        .desktop-pet-main .text-wrapper-9 {
          color: #cccccc;
          font-family: "Material Icons", Helvetica;
          font-size: 32px;
          font-weight: 400;
          left: 18px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 12px;
          white-space: nowrap;
          pointer-events: none;
        }

        .desktop-pet-main .text-wrapper-10 {
          color: #ffffff;
          font-family: "Material Icons", Helvetica;
          font-size: 36px;
          font-weight: 400;
          left: 27px;
          letter-spacing: 0;
          line-height: normal;
          position: absolute;
          top: 12px;
          white-space: nowrap;
          pointer-events: none;
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
        <div class="choice-overlay">
          <div class="hide-button">
            <div class="text-wrapper">隐藏</div>
            <div class="ellipse"></div>
            <div class="text-wrapper-2"></div>
            <img class="vector" alt="Vector" src="${asset('static/img/vector-665.svg')}" />
          </div>
          <div class="setting-button">
            <div class="text-wrapper-3">桌宠设置</div>
            <div class="ellipse-2"></div>
            <div class="text-wrapper-4"></div>
          </div>
          <div class="clean-current-button">
            <div class="ellipse-3"></div>
            <div class="text-wrapper-5">清理当前页Tab</div>
            <div class="text-wrapper-6"></div>
          </div>
          <div class="clean-inoneclick">
            <div class="ellipse-4"></div>
            <div class="text-wrapper-7">一键清理</div>
            <div class="text-wrapper-8"></div>
            <div class="text-wrapper-9"></div>
            <div class="text-wrapper-10"></div>
          </div>
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
      const hideBtn = shadow.querySelector('.hide-button');
      const settingBtn = shadow.querySelector('.setting-button');
      const cleanCurrentBtn = shadow.querySelector('.clean-current-button');
      const cleanInOneClickBtn = shadow.querySelector('.clean-inoneclick');
      const choiceOverlay = shadow.querySelector('.choice-overlay');

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
        if (target.closest('.hide-button') || 
            target.closest('.setting-button') || 
            target.closest('.clean-current-button') || 
            target.closest('.clean-inoneclick') ||
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
        // ✅ 拖动结束后保存位置
        if (petContainer && isPetVisible) {
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
          isButtonsVisible = !isButtonsVisible;
          if (choiceOverlay) {
            choiceOverlay.classList.toggle('visible', isButtonsVisible);
          }
        });
      }

      // 隐藏按钮
      if (hideBtn) {
        hideBtn.addEventListener('click', () => {
          hidePet();
        });
      }

      // 设置按钮
      if (settingBtn) {
        settingBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "pet-setting" });
        });
      }

      // 清理当前页 Tab
      if (cleanCurrentBtn) {
        cleanCurrentBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "clean-current-tab" });
        });
      }

      // 一键清理
      if (cleanInOneClickBtn) {
        cleanInOneClickBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "clean-all" });
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
      // ✅ 简化：如果容器不存在，直接创建（不等待初始化完成）
      if (!petContainer) {
        await createPet();
      }
      
      // ✅ 立即显示，不等待初始化完成（初始化在后台继续）
      if (petContainer) {
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (petContainer) {
            petContainer.style.display = "block";
            isPetVisible = true;
            isButtonsVisible = false; // 默认隐藏按钮
            const shadow = petContainer.shadowRoot;
            if (shadow) {
              const choiceOverlay = shadow.querySelector('.choice-overlay');
              if (choiceOverlay) {
                choiceOverlay.classList.remove('visible');
              }
            }
            console.log("[Tab Cleaner Pet] Pet shown successfully");
            
            // ✅ 保存状态到存储（同步到所有标签页）
            savePetState();
          }
        });
      } else {
        console.warn("[Tab Cleaner Pet] Pet container not available, initialization may still be in progress");
        // ✅ 即使容器还没创建，也尝试保存状态（下次会重试）
        isPetVisible = true;
        savePetState();
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
    isButtonsVisible = false;
    const shadow = petContainer.shadowRoot;
    if (shadow) {
      const choiceOverlay = shadow.querySelector('.choice-overlay');
      if (choiceOverlay) {
        choiceOverlay.classList.remove('visible');
      }
    }
    
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
    
    // ✅ 设置存储同步监听器
    setupStorageSync();
    
    // ✅ 加载宠物状态（从存储中读取）
    loadPetState();
    
    // 触发加载完成事件，通知监听器
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
      hasForceShow: typeof api.forceShow === 'function', // ✅ v2.1: 日志增强
      module: api
    });
  } catch (e) {
    console.error("[Tab Cleaner Pet] Failed to export API:", e);
  }
})();

