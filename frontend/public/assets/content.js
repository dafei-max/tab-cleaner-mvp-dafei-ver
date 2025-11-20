(function () {
  if (window.__TAB_CLEANER_CONTENT_INSTALLED) return;
  window.__TAB_CLEANER_CONTENT_INSTALLED = true;

  // ✅ Always inject opengraph_local.js into the page world on page load
  // Note: Content scripts run in an isolated world and cannot access page-world globals,
  // so we inject the script and let it communicate via window.postMessage
  (function injectOpenGraphScriptOnce() {
    // Use a flag in the content script's isolated world to avoid duplicate injection
    if (window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED) {
      console.log('[Tab Cleaner Content] opengraph_local already marked as loaded in this world, skipping inject.');
      return;
    }
    
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('assets/opengraph_local.js');
      script.async = false;
      script.onload = () => {
        console.log('[Tab Cleaner Content] opengraph_local script injected and loaded.');
        // Mark as loaded in content script's isolated world
        window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = true;
        // Remove script tag after load (opengraph_local.js will handle its own initialization)
        script.remove();
      };
      script.onerror = (e) => {
        console.error('[Tab Cleaner Content] Failed to inject opengraph_local:', e);
      };
      (document.head || document.documentElement).appendChild(script);
      console.log('[Tab Cleaner Content] Injected opengraph_local into page.');
    } catch (err) {
      console.error('[Tab Cleaner Content] Failed to inject opengraph_local:', err);
    }
  })();

  // ✅ v2.4: pet.js 现在作为 content script 在 manifest.json 中加载
  // 不再需要通过 <script> 标签注入
  // (function injectPetModule() {
  //   // ... 已移除：pet.js 现在作为 content script 运行
  // })();

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
    // ✅ v2.4: 直接读写 chrome.storage.local，不再发送消息到 background
    if (windowButton) {
      windowButton.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("[Tab Cleaner] Window button clicked, toggling pet visibility...");
        
        if (!chrome.storage || !chrome.storage.local) {
          console.error("[Tab Cleaner] chrome.storage.local not available");
          return;
        }
        
        chrome.storage.local.get(["petVisible"], (items) => {
          const currentVisible = items.petVisible === true;
          const newVisible = !currentVisible;
          
          chrome.storage.local.set({ petVisible: newVisible }, () => {
            if (chrome.runtime.lastError) {
              console.error("[Tab Cleaner] Failed to set petVisible:", chrome.runtime.lastError);
            } else {
              console.log("[Tab Cleaner] petVisible updated:", newVisible);
            }
          });
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
      // ✅ Simplified: Only read cached OpenGraph data from chrome.storage.local
      // Content scripts run in an isolated world and cannot access page-world globals,
      // so we rely on opengraph_local.js (injected on page load) to extract data
      // and save it via window.postMessage -> chrome.storage.local
      console.log('[Tab Cleaner Content] fetch-opengraph requested');
      
      chrome.storage.local.get(['recent_opengraph'], (items) => {
        if (chrome.runtime.lastError) {
          console.error('[Tab Cleaner Content] ❌ Failed to get recent_opengraph:', chrome.runtime.lastError);
          if (typeof sendResponse === 'function') {
            sendResponse({ 
              success: false, 
              error: `Failed to read cache: ${chrome.runtime.lastError.message}`,
              is_doc_card: false
            });
          }
          return;
        }
        
        const recent = items.recent_opengraph || [];
        const currentUrl = window.location.href;
        
        // Find cached data for current URL
        const cachedData = recent.find(item => item && item.url === currentUrl);
        
        if (cachedData) {
          console.log('[Tab Cleaner Content] ✅ Using cached OpenGraph:', {
            url: cachedData.url,
            success: cachedData.success,
            hasTitle: !!(cachedData.title),
            hasImage: !!(cachedData.image)
          });
          
          // Ensure is_doc_card is set
          if (cachedData.is_doc_card === undefined) {
            cachedData.is_doc_card = false;
          }
          
          if (typeof sendResponse === 'function') {
            sendResponse(cachedData);
          }
        } else {
          console.log('[Tab Cleaner Content] ⚠️ No cached OpenGraph data for', currentUrl);
          if (typeof sendResponse === 'function') {
            sendResponse({ 
              success: false, 
              error: 'No cached OpenGraph data for this URL. Please refresh this page once and try again.',
              url: currentUrl,
              is_doc_card: false
            });
          }
        }
      });
      
      return true; // Keep message channel open for async sendResponse
    }
    return false;
  });

  console.log("Tab Cleaner content (classic) loaded.");
})();
