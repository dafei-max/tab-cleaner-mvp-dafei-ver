(function () {
  if (window.__TAB_CLEANER_CONTENT_INSTALLED) return;
  window.__TAB_CLEANER_CONTENT_INSTALLED = true;

  // 加载本地 OpenGraph 抓取工具
  (function loadOpenGraphLocal() {
    // 如果函数已经存在，说明脚本已经加载成功
    if (typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function') {
      console.log('[Tab Cleaner] OpenGraph local already loaded and ready');
      window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = true;
      return;
    }
    
    // 如果标志已设置但函数不存在，重置标志（可能是之前的加载失败了）
    if (window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED) {
      console.warn('[Tab Cleaner] OpenGraph flag set but function missing, reloading...');
      window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = false;
    }
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/opengraph_local.js');
    script.onload = () => {
      console.log('[Tab Cleaner] OpenGraph local script loaded');
      // 等待一下确保函数已定义
      setTimeout(() => {
        if (typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function') {
          console.log('[Tab Cleaner] ✅ OpenGraph function ready');
          // 只有在函数确实可用时才设置标志
          window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = true;
        } else {
          console.warn('[Tab Cleaner] ⚠️ OpenGraph function not found after load');
          window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = false; // 允许重试
        }
      }, 300); // 增加等待时间
      // 不立即移除，保留脚本以便函数可用
    };
    script.onerror = (e) => {
      console.error('[Tab Cleaner] Failed to load opengraph_local.js:', e);
      window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = false; // 允许重试
    };
    (document.head || document.documentElement).appendChild(script);
  })();

  // 加载 pet 模块
  (function loadPetModule() {
    if (window.__TAB_CLEANER_PET) {
      console.log("[Tab Cleaner] Pet module already loaded");
      return; // 已经加载
    }
    console.log("[Tab Cleaner] Loading pet module...");
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/pet.js');
    script.onload = () => {
      console.log("[Tab Cleaner] Pet script loaded, checking module:", window.__TAB_CLEANER_PET);
      script.remove();
    };
    script.onerror = (e) => {
      console.error("[Tab Cleaner] Failed to load pet.js:", e);
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  })();

  let cardContainer = null;
  let isVisible = false;

  // 确保 asset() 可用（将相对路径转为扩展 URL）
  if (typeof asset !== 'function') {
    var asset = function (path) {
      return chrome.runtime.getURL(path);
    };
  }

  // 加载 CSS（把 url(static/img/...) 改为扩展路径）
  async function loadCss(relPath) {
    try {
      const url = asset(relPath);
      let cssText = await (await fetch(url)).text();
      cssText = cssText.replace(
        /url\((["']?)(?:\.\.\/)*(?:\.\/)?static\/img\/([^"')]+)\1\)/g,
        (_m, _q, name) => `url("${asset("static/img/" + name)}")`
      );
      return cssText;
    } catch (err) {
      console.error("Failed to load CSS:", relPath, err);
      return "";
    }
  }

  async function loadCardHTMLFromTemplate() {
    try {
      const url = asset("assets/card.html");
      console.log("[Tab Cleaner] Loading card.html from:", url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      let html = await response.text();
      const map = {
        DRAGGABLE: asset('static/img/draggable-2.svg'),
        VECTOR6: asset('static/img/vector-6.svg'),
        WINDOW: asset('static/img/window.png'),
        HOME: asset('static/img/home-button-2.png'),
        CLEAN: asset('static/img/clean-button.png'),
        DETAILS: asset('static/img/details-button.svg'),
        DETAILS_IMAGE: asset('static/img/洗衣机详情.png'),
      };
      html = html.replace(/\{\{(DRAGGABLE|VECTOR6|WINDOW|HOME|CLEAN|DETAILS|DETAILS_IMAGE)\}\}/g, (_m, k) => map[k] || "");
      return html;
    } catch (e) {
      console.error("Failed to load card.html template:", e);
      return "";
    }
  }

  function buildInlineOverrides(guideCss, mainCss, backgroundUrl) {
    return `
      <style>
        :host { all: initial; display:block; --tc-radius: 28px; background: transparent !important; }
        *, *::before, *::after { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        ${guideCss}
        ${mainCss}
        /* 恢复背景图片 */
        .card .div { 
          display: block !important; 
          position: relative !important; 
          width: 100% !important; 
          height: 100% !important;
          background-image: url("${backgroundUrl}") !important;
          background-size: 100% 100% !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
        /* 其他层保持透明 */
        .card, .window, .image { background: transparent !important; backdrop-filter: none !important; filter: none !important; }
        .card, .card .div { border-radius: var(--tc-radius) !important; overflow: hidden; clip-path: inset(0 round var(--tc-radius)); }
        .card { box-shadow: none !important; pointer-events: auto !important; }
        .card::before, .card::after { content: none !important; box-shadow:none !important; filter:none !important; }
        .window-img { position:absolute; left:0; top:0; width:100%; height:100%; object-fit:contain; z-index:2; pointer-events:none; }
        .window-button { pointer-events: auto !important; }
        /* 确保按钮可点击，但不改变定位 */
        #tc-card, .buttons, .home-button, .clean-button, .details-button { 
          pointer-events: auto !important; 
        }
        /* 关闭按钮确保在右上角 */
        #tc-close {
          position: absolute !important;
          top: 10px !important;
          right: 10px !important;
          z-index: 10000 !important;
          pointer-events: auto !important;
        }
        /* Tooltip 样式 */
        .button-wrapper, .window-button-wrapper {
          position: relative;
          display: inline-block;
        }
        .tooltip {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-top: 8px;
          padding: 6px 12px;
          background-color: #000;
          color: #fff;
          font-size: 12px;
          white-space: nowrap;
          border-radius: 4px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s, visibility 0.2s;
          pointer-events: none;
          z-index: 10001;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        /* Tooltip 箭头（向上指向按钮） */
        .tooltip::after {
          content: '';
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-bottom-color: #000;
        }
        /* Hover 时显示 tooltip */
        .button-wrapper:hover .tooltip,
        .window-button-wrapper:hover .tooltip {
          opacity: 1;
          visibility: visible;
        }
        /* 确保按钮在 wrapper 内正确定位，不影响原有绝对定位 */
        .buttons .button-wrapper {
          position: absolute;
          /* wrapper 包含按钮和 tooltip 的空间 */
        }
        .buttons .button-wrapper .home-button,
        .buttons .button-wrapper .clean-button,
        .buttons .button-wrapper .details-button {
          position: absolute;
          left: 0;
          top: 0;
          /* 保持原有尺寸 */
        }
        .buttons .home-wrapper .home-button {
          width: 88px;
          height: 99px;
        }
        .buttons .clean-wrapper .clean-button {
          width: 96px;
          height: 135px;
        }
        .buttons .details-wrapper .details-button {
          width: 88px;
          height: 99px;
        }
        /* 调整 wrapper 位置以匹配原按钮位置 */
        .buttons .home-wrapper {
          left: 160px;
          top: 19px;
        }
        .buttons .clean-wrapper {
          left: calc(50% - 49px);
          top: 0;
        }
        .buttons .details-wrapper {
          left: -10px;
          top: 18px;
        }
        /* 底部三个按钮的 tooltip 定位：相对于按钮底部居中 */
        .buttons .button-wrapper .tooltip {
          top: auto;
          bottom: auto;
          /* 定位在按钮底部下方 */
          margin-top: 0;
          margin-bottom: 0;
        }
        /* 根据按钮视觉底部（不含阴影）定位 tooltip */
        /* 按钮图片包含阴影，所以需要基于按钮的可视区域来定位 */
        .buttons .home-wrapper .tooltip {
          top: 65px; /* 调高一点：减小 top 值 */
          left: calc(50% + 43px); /* 往右调：向右偏移 43px */
          transform: translateX(-50%);
        }
        .buttons .clean-wrapper .tooltip {
          top: 85px; /* clean-button tooltip 位置 */
          left: calc(50% + 48px); /* 往右调：向右偏移 48px */
          transform: translateX(-50%);
        }
        .buttons .details-wrapper .tooltip {
          top: 65px; /* 调高一点：减小 top 值 */
          left: calc(50% + 43px); /* 往右调：向右偏移 43px */
          transform: translateX(-50%);
        }
        /* window-button-wrapper 定位，完全不影响原有 window-button 的定位 */
        .window-button-wrapper {
          position: absolute;
          left: 32px;
          top: 49px;
          width: 268px;
          height: 268px;
          /* wrapper 不影响内部元素的样式，保持原有 CSS 定义的 window-button 样式 */
        }
        /* 确保 wrapper 内的 window-button 保持原有样式，只调整定位为相对于 wrapper */
        .window-button-wrapper .window-button {
          position: absolute;
          left: 0 !important;
          top: 0 !important;
          width: 268px !important;
          height: 268px !important;
        }
        /* 确保 window-button 内的子元素保持原有样式 */
        .window-button-wrapper .window-button .image {
          height: 100%;
          width: 100%;
          position: relative;
        }
        /* 详情图片覆盖层样式 */
        .details-overlay {
          position: absolute;
          left: 0;
          top: 5px;
          width: 268px;
          height: 268px;
          z-index: 1000;
          pointer-events: none;
          display: none;
        }
        .details-overlay .details-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 50%;
        }
      </style>
    `;
  }

  async function createCard() {
    if (cardContainer) return;

    cardContainer = document.createElement("div");
    cardContainer.id = "tab-cleaner-card-container";
    
    // 计算位置：右上角，插件图标下方（通常图标在工具栏右侧，距离顶部约10px，距离右侧约20px）
    const topOffset = 60; // 插件图标下方约60px
    const rightOffset = 20; // 距离右侧20px
    
    Object.assign(cardContainer.style, {
      position: "fixed",
      top: `${topOffset}px`,
      right: `${rightOffset}px`,
      left: "auto",
      bottom: "auto",
      zIndex: String(2147483647),
      width: "320px",
      height: "485px",
      background: "transparent",
      pointerEvents: "auto", // 改为 auto，确保可交互
      boxShadow: "none",
      filter: "none",
      backdropFilter: "none",
    });

    const shadow = cardContainer.attachShadow({ mode: "open" });

    const guideCss = await loadCss("assets/styleguide.css");
    const mainCss = await loadCss("assets/style.css");
    const backgroundUrl = asset('static/img/background-2.png');

    const tpl = await loadCardHTMLFromTemplate();
    shadow.innerHTML = `${buildInlineOverrides(guideCss, mainCss, backgroundUrl)}${tpl}`;

    const card = shadow.getElementById('tc-card');
    const closeBtn = shadow.getElementById('tc-close');
    const homeBtn = shadow.getElementById('homeBtn');
    const cleanBtn = shadow.getElementById('cleanBtn');
    const detailsBtn = shadow.getElementById('detailsBtn');
    const windowButton = shadow.querySelector('.window-button');
    const dragHandle = shadow.querySelector('.draggable') || card;

    // 确保所有交互元素可点击，但不改变其原有定位
    [card, homeBtn, cleanBtn, detailsBtn, windowButton].forEach(el => {
      if (el) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
      }
    });
    
    // 关闭按钮确保在右上角且可点击
    if (closeBtn) {
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '10px';
      closeBtn.style.right = '10px';
      closeBtn.style.zIndex = '10000';
      closeBtn.style.pointerEvents = 'auto';
    }

    // 确保拖动函数存在
    if (typeof enableDrag !== 'function') {
      var enableDrag = function (handle, container) {
        if (!handle || !container) return;
        let startX = 0, startY = 0, origLeft = 0, origTop = 0, dragging = false;
        const parsePx = (v, fallback) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : fallback;
        };
        const onDown = (e) => {
          const pt = e.touches ? e.touches[0] : e;
          dragging = true;
          document.body.style.userSelect = 'none';
          
          // 获取当前实际位置（考虑 right/top 或 left/top）
          const rect = container.getBoundingClientRect();
          const currentLeft = rect.left + window.scrollX;
          const currentTop = rect.top + window.scrollY;
          
          // 统一使用 left/top 定位
          container.style.right = 'auto';
          container.style.bottom = 'auto';
          container.style.left = `${currentLeft}px`;
          container.style.top = `${currentTop}px`;
          
          origLeft = currentLeft;
          origTop = currentTop;
          startX = pt.clientX; 
          startY = pt.clientY;
          e.preventDefault(); 
          e.stopPropagation();
          window.addEventListener('mousemove', onMove, { passive:false });
          window.addEventListener('touchmove', onMove, { passive:false });
          window.addEventListener('mouseup', onUp, { passive:true });
          window.addEventListener('touchend', onUp, { passive:true });
        };
        const onMove = (e) => {
          if (!dragging) return;
          const pt = e.touches ? e.touches[0] : e;
          const dx = pt.clientX - startX; const dy = pt.clientY - startY;
          container.style.left = `${origLeft + dx}px`;
          container.style.top  = `${origTop + dy}px`;
          e.preventDefault();
        };
        const onUp = () => {
          dragging = false;
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('touchend', onUp);
        };
        handle.addEventListener('mousedown', onDown, { passive:false });
        handle.addEventListener('touchstart', onDown, { passive:false });
      };
    }
    enableDrag(dragHandle, cardContainer);

    // 详情图片显示/隐藏状态
    let detailsVisible = false;
    const detailsOverlay = shadow.getElementById('detailsOverlay');

    if (closeBtn) closeBtn.addEventListener("click", hideCard);
    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        // 打开个人空间页面
        try {
          chrome.runtime.sendMessage({ action: "open-personalspace" }, (response) => {
            if (chrome.runtime.lastError) {
              // Extension context invalidated 错误处理
              if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                console.warn("[Tab Cleaner] Extension was reloaded, please refresh the page");
              } else {
                console.error("[Tab Cleaner] Failed to open personal space:", chrome.runtime.lastError);
              }
            } else {
              console.log("[Tab Cleaner] Personal space opened");
            }
          });
        } catch (error) {
          console.error("[Tab Cleaner] Error sending message:", error);
        }
      });
    }
    if (cleanBtn) {
      cleanBtn.addEventListener("click", () => {
        try {
          chrome.runtime.sendMessage({ action: "clean" }, (response) => {
            if (chrome.runtime.lastError) {
              if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                console.warn("[Tab Cleaner] Extension was reloaded, please refresh the page");
              } else {
                console.error("[Tab Cleaner] Failed to clean tabs:", chrome.runtime.lastError);
              }
            } else {
              console.log("[Tab Cleaner] Clean action sent:", response);
            }
          });
        } catch (error) {
          console.error("[Tab Cleaner] Error sending clean message:", error);
        }
      });
    }
    if (detailsBtn) {
      detailsBtn.addEventListener("click", () => {
        // 切换详情图片显示/隐藏
        detailsVisible = !detailsVisible;
        if (detailsOverlay) {
          detailsOverlay.style.display = detailsVisible ? 'block' : 'none';
        }
        chrome.runtime.sendMessage({ action: "details" });
      });
    }
    // window-button 点击事件：显示/隐藏宠物
    if (windowButton) {
      windowButton.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("[Tab Cleaner] Window button clicked, sending message to background...");
        
        // ✅ 发送消息给 background script（content script 不能使用 chrome.tabs）
        chrome.runtime.sendMessage({ action: "toggle-pet" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Tab Cleaner] Failed to send message:", chrome.runtime.lastError);
          } else {
            console.log("[Tab Cleaner] Pet toggle response:", response);
          }
        });
      });
    }

    document.body.appendChild(cardContainer);
    if (card) {
      requestAnimationFrame(() => card.classList.add("visible"));
    }
  }

  async function showCard() {
    if (!cardContainer) await createCard();
    cardContainer.style.display = "block";
    const card = cardContainer.shadowRoot.getElementById("tc-card");
    card && card.classList.add("visible");
    isVisible = true;
  }

  function hideCard() {
    if (!cardContainer) return;
    const card = cardContainer.shadowRoot.getElementById("tc-card");
    card && card.classList.remove("visible");
    setTimeout(() => { if (cardContainer) cardContainer.style.display = "none"; }, 240);
    isVisible = false;
  }

  function toggleCard() { isVisible ? hideCard() : showCard(); }

  // 监听来自页面上下文的 postMessage（opengraph_local.js 发送）
  window.addEventListener('message', (event) => {
    // 安全检查：只处理来自同源的消息
    if (event.data && event.data.type === 'TAB_CLEANER_CACHE_OPENGRAPH') {
      console.log('[Tab Cleaner Content] 📥 Received cache-opengraph via postMessage:', {
        url: event.data.data?.url,
        success: event.data.data?.success,
        hasImage: !!(event.data.data?.image),
        image: event.data.data?.image ? event.data.data.image.substring(0, 60) + '...' : null
      });
      
      if (event.data.data && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const cacheData = event.data.data;
          const storageKey = `opengraph_cache_${cacheData.url}`;
          
          // 确保图片链接被保存
          if (!cacheData.image && event.data.data.image) {
            cacheData.image = event.data.data.image;
            console.log('[Tab Cleaner Content] ✅ Restored image URL in cache:', cacheData.image.substring(0, 60) + '...');
          }
          
          // 保存到独立缓存键
          chrome.storage.local.set({
            [storageKey]: cacheData
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Tab Cleaner Content] ❌ Failed to cache data:', chrome.runtime.lastError);
            } else {
              console.log('[Tab Cleaner Content] ✅ Data cached locally:', storageKey);
              
              // 同时保存到最近提取的列表
              chrome.storage.local.get(['recent_opengraph'], (items) => {
                if (chrome.runtime.lastError) {
                  console.error('[Tab Cleaner Content] ❌ Failed to get recent_opengraph:', chrome.runtime.lastError);
                  return;
                }
                
                const recent = items.recent_opengraph || [];
                const filtered = recent.filter(item => item && item.url !== cacheData.url);
                filtered.unshift(cacheData);
                const limited = filtered.slice(0, 100);
                
                console.log('[Tab Cleaner Content] 💾 Saving recent_opengraph:', {
                  before: recent.length,
                  after: limited.length,
                  firstItem: limited[0] ? {
                    url: limited[0].url,
                    hasImage: !!(limited[0].image),
                    image: limited[0].image ? limited[0].image.substring(0, 60) + '...' : null
                  } : null
                });
                
                chrome.storage.local.set({ recent_opengraph: limited }, () => {
                  if (chrome.runtime.lastError) {
                    console.error('[Tab Cleaner Content] ❌ Failed to save recent_opengraph:', chrome.runtime.lastError);
                  } else {
                    console.log('[Tab Cleaner Content] ✅ Added to recent_opengraph list (total:', limited.length, ')');
                  }
                });
              });
            }
          });
        } catch (storageError) {
          console.error('[Tab Cleaner Content] ❌ Storage error:', storageError);
        }
      } else {
        console.warn('[Tab Cleaner Content] ⚠️ chrome.storage.local not available in content script');
      }
    }
  });

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || !req.action) return false;
    if (req.action === "toggle" || req.action === "toggleCard") { toggleCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "show") { showCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "hide") { hideCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "cache-opengraph") {
      // 处理来自 opengraph_local.js 的缓存请求
      // opengraph_local.js 运行在页面上下文中，无法直接访问 chrome.storage
      // 所以通过消息传递到 content script，由 content script 来保存
      console.log('[Tab Cleaner Content] 📥 Received cache-opengraph request:', {
        url: req.data?.url,
        success: req.data?.success
      });
      
      if (req.data && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const cacheData = req.data;
          const storageKey = `opengraph_cache_${cacheData.url}`;
          
          // 保存到独立缓存键
          chrome.storage.local.set({
            [storageKey]: cacheData
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Tab Cleaner Content] ❌ Failed to cache data:', chrome.runtime.lastError);
              sendResponse?.({ success: false, error: chrome.runtime.lastError.message });
            } else {
              console.log('[Tab Cleaner Content] ✅ Data cached locally:', storageKey);
              
              // 同时保存到最近提取的列表
              chrome.storage.local.get(['recent_opengraph'], (items) => {
                if (chrome.runtime.lastError) {
                  console.error('[Tab Cleaner Content] ❌ Failed to get recent_opengraph:', chrome.runtime.lastError);
                  sendResponse?.({ success: true, message: 'Cached but failed to update recent list' });
                  return;
                }
                
                const recent = items.recent_opengraph || [];
                const filtered = recent.filter(item => item && item.url !== cacheData.url);
                filtered.unshift(cacheData);
                const limited = filtered.slice(0, 100);
                
                chrome.storage.local.set({ recent_opengraph: limited }, () => {
                  if (chrome.runtime.lastError) {
                    console.error('[Tab Cleaner Content] ❌ Failed to save recent_opengraph:', chrome.runtime.lastError);
                    sendResponse?.({ success: true, message: 'Cached but failed to update recent list' });
                  } else {
                    console.log('[Tab Cleaner Content] ✅ Added to recent_opengraph list (total:', limited.length, ')');
                    sendResponse?.({ success: true, message: 'Cached successfully' });
                  }
                });
              });
            }
          });
        } catch (storageError) {
          console.error('[Tab Cleaner Content] ❌ Storage error:', storageError);
          sendResponse?.({ success: false, error: storageError.message });
        }
      } else {
        console.warn('[Tab Cleaner Content] ⚠️ chrome.storage.local not available in content script');
        sendResponse?.({ success: false, error: 'chrome.storage.local not available' });
      }
      return true; // 保持消息通道开放
    }
    if (req.action === "fetch-opengraph") {
      // 重要：返回 true 保持消息通道开放，以便异步发送响应
      // 处理本地 OpenGraph 抓取请求
      console.log('[Tab Cleaner Content] fetch-opengraph requested');
      console.log('[Tab Cleaner Content] Checking if opengraph_local.js is loaded...');
      console.log('[Tab Cleaner Content] window.__TAB_CLEANER_GET_OPENGRAPH exists?', typeof window.__TAB_CLEANER_GET_OPENGRAPH);
      console.log('[Tab Cleaner Content] window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED?', window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED);
      
      // 如果函数不存在，尝试加载脚本（无论标志如何）
      if (typeof window.__TAB_CLEANER_GET_OPENGRAPH !== 'function') {
        console.log('[Tab Cleaner Content] ⚠️ Function not found, loading script now...');
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('assets/opengraph_local.js');
        script.onload = () => {
          console.log('[Tab Cleaner Content] ✅ Script loaded, waiting for function...');
          // 增加等待时间，确保脚本完全执行并暴露函数
          setTimeout(() => {
            if (typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function') {
              console.log('[Tab Cleaner Content] ✅ Function ready, calling...');
              window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = true; // 设置标志
              try {
                const result = window.__TAB_CLEANER_GET_OPENGRAPH(true);
                if (result instanceof Promise) {
                  result.then(data => {
                    console.log('[Tab Cleaner Content] ✅ Promise resolved:', {
                      success: data?.success,
                      hasTitle: !!(data?.title),
                      hasImage: !!(data?.image),
                      is_doc_card: data?.is_doc_card
                    });
                    // 确保 is_doc_card 被正确设置
                    if (data && data.is_doc_card === undefined) {
                      data.is_doc_card = false;
                    }
                    if (typeof sendResponse === 'function') {
                      sendResponse(data);
                    }
                  }).catch(error => {
                    console.error('[Tab Cleaner Content] ❌ Promise rejected:', error);
                    if (typeof sendResponse === 'function') {
                      sendResponse({ 
                        success: false, 
                        error: error.message,
                        is_doc_card: false // 明确设置不是 doc 卡片
                      });
                    }
                  });
                } else {
                  console.log('[Tab Cleaner Content] ✅ Sync result:', {
                    success: result?.success,
                    hasTitle: !!(result?.title),
                    hasImage: !!(result?.image),
                    is_doc_card: result?.is_doc_card
                  });
                  // 确保 is_doc_card 被正确设置
                  if (result && result.is_doc_card === undefined) {
                    result.is_doc_card = false;
                  }
                  if (typeof sendResponse === 'function') {
                    sendResponse(result);
                  }
                }
              } catch (e) {
                console.error('[Tab Cleaner Content] ❌ Error calling function:', e);
                if (typeof sendResponse === 'function') {
                  sendResponse({ 
                    success: false, 
                    error: e.message,
                    is_doc_card: false // 明确设置不是 doc 卡片
                  });
                }
              }
            } else {
              console.error('[Tab Cleaner Content] ❌ Function still not found after load');
              console.error('[Tab Cleaner Content] Available globals:', Object.keys(window).filter(k => k.includes('TAB_CLEANER')));
              if (typeof sendResponse === 'function') {
                sendResponse({ 
                  success: false, 
                  error: 'OpenGraph function not found after script load',
                  is_doc_card: false // 明确设置不是 doc 卡片
                });
              }
            }
          }, 1000); // 增加到 1000ms，确保脚本完全执行
        };
        script.onerror = (e) => {
          console.error('[Tab Cleaner Content] ❌ Failed to load script:', e);
          if (typeof sendResponse === 'function') {
            sendResponse({ success: false, error: 'Failed to load opengraph_local.js' });
          }
        };
        (document.head || document.documentElement).appendChild(script);
        return true; // 保持消息通道开放，等待异步加载
      }
      
      try {
        // 使用 opengraph_local.js 暴露的全局函数
        if (window.__TAB_CLEANER_GET_OPENGRAPH) {
          console.log('[Tab Cleaner Content] ✅ Function exists, calling __TAB_CLEANER_GET_OPENGRAPH(true)...');
          console.log('[Tab Cleaner Content] Document readyState:', document.readyState);
          
          const result = window.__TAB_CLEANER_GET_OPENGRAPH(true); // 等待页面加载完成
          
          // 如果返回 Promise，等待它完成
          if (result instanceof Promise) {
            console.log('[Tab Cleaner Content] ⏳ Result is Promise, waiting for resolution...');
            result.then(data => {
              console.log('[Tab Cleaner Content] ✅ Promise resolved! Data:', {
                success: data?.success,
                hasTitle: !!(data?.title),
                hasImage: !!(data?.image),
                title: data?.title?.substring(0, 50),
                image: data?.image ? data.image.substring(0, 50) + '...' : null,
                error: data?.error,
                fullData: data
              });
              
              // 确保 sendResponse 函数可用
              if (typeof sendResponse === 'function') {
                try {
                  sendResponse(data);
                  console.log('[Tab Cleaner Content] ✅ Data sent successfully via sendResponse');
                } catch (sendError) {
                  console.error('[Tab Cleaner Content] ❌ Error sending data:', sendError);
                  // 如果 sendResponse 失败，尝试使用 chrome.runtime.sendMessage 作为后备
                  try {
                    chrome.runtime.sendMessage({
                      action: 'opengraph-result',
                      data: data,
                      tabId: sender?.tab?.id
                    });
                    console.log('[Tab Cleaner Content] ✅ Data sent via chrome.runtime.sendMessage as fallback');
                  } catch (fallbackError) {
                    console.error('[Tab Cleaner Content] ❌ Fallback sendMessage also failed:', fallbackError);
                  }
                }
              } else {
                console.error('[Tab Cleaner Content] ❌ sendResponse function not available');
                // 尝试使用 chrome.runtime.sendMessage 作为后备
                try {
                  chrome.runtime.sendMessage({
                    action: 'opengraph-result',
                    data: data,
                    tabId: sender?.tab?.id
                  });
                  console.log('[Tab Cleaner Content] ✅ Data sent via chrome.runtime.sendMessage as fallback');
                } catch (fallbackError) {
                  console.error('[Tab Cleaner Content] ❌ Fallback sendMessage failed:', fallbackError);
                }
              }
            }).catch(error => {
              console.error('[Tab Cleaner Content] ❌ Promise rejected:', error);
              if (typeof sendResponse === 'function') {
                try {
                  sendResponse({ success: false, error: error.message });
                } catch (sendError) {
                  console.error('[Tab Cleaner Content] ❌ Error sending error response:', sendError);
                }
              }
            });
          } else {
            console.log('[Tab Cleaner Content] ✅ Result is sync:', {
              success: result?.success,
              hasTitle: !!(result?.title),
              hasImage: !!(result?.image),
              title: result?.title?.substring(0, 50),
              image: result?.image ? result.image.substring(0, 50) + '...' : null,
              error: result?.error
            });
            
            if (typeof sendResponse === 'function') {
              try {
                sendResponse(result);
                console.log('[Tab Cleaner Content] ✅ Sync data sent successfully');
              } catch (sendError) {
                console.error('[Tab Cleaner Content] ❌ Error sending sync data:', sendError);
              }
            }
          }
        } else {
          console.warn('[Tab Cleaner Content] __TAB_CLEANER_GET_OPENGRAPH not found, waiting 2s...');
          // 如果函数还没加载，等待一下（opengraph_local.js 需要时间加载）
          setTimeout(() => {
            if (window.__TAB_CLEANER_GET_OPENGRAPH) {
              console.log('[Tab Cleaner Content] Function found after wait, calling...');
              const result = window.__TAB_CLEANER_GET_OPENGRAPH(true);
              if (result instanceof Promise) {
                result.then(data => {
                  console.log('[Tab Cleaner Content] Promise resolved after wait:', {
                    success: data?.success,
                    hasTitle: !!(data?.title),
                    hasImage: !!(data?.image)
                  });
                  if (typeof sendResponse === 'function') {
                    sendResponse(data);
                  }
                }).catch(error => {
                  console.error('[Tab Cleaner Content] Promise rejected after wait:', error);
                  if (typeof sendResponse === 'function') {
                    sendResponse({ success: false, error: error.message });
                  }
                });
              } else {
                console.log('[Tab Cleaner Content] Sync result after wait:', {
                  success: result?.success,
                  hasTitle: !!(result?.title),
                  hasImage: !!(result?.image)
                });
                if (typeof sendResponse === 'function') {
                  sendResponse(result);
                }
              }
            } else {
              console.error('[Tab Cleaner Content] Function still not found after wait');
              console.error('[Tab Cleaner Content] Available globals:', Object.keys(window).filter(k => k.includes('TAB_CLEANER')));
              if (typeof sendResponse === 'function') {
                sendResponse({ success: false, error: 'OpenGraph function not loaded' });
              }
            }
          }, 2000); // 增加到 2 秒
        }
      } catch (error) {
        console.error('[Tab Cleaner Content] Error in fetch-opengraph:', error);
        if (typeof sendResponse === 'function') {
          sendResponse({ success: false, error: error.message });
        }
      }
      return true; // 保持消息通道开放
    }
    return false;
  });

  console.log("Tab Cleaner content (classic) loaded.");
})();
