(function () {
  if (window.__TAB_CLEANER_CONTENT_INSTALLED) return;
  window.__TAB_CLEANER_CONTENT_INSTALLED = true;

  // 🆕 先加载 Eagle Storage（opengraph_local_v2.js 需要它）
  (function loadEagleStorage() {
    if (window.__TAB_CLEANER_EAGLE_STORAGE_LOADED) {
      console.log('[Tab Cleaner] eagle_storage.js already injected');
      return;
    }

    const eagleScript = document.createElement('script');
    eagleScript.src = chrome.runtime.getURL('assets/eagle_storage.js');
    eagleScript.onload = () => {
      console.log('[Tab Cleaner] Eagle Storage script injected into page');
      window.__TAB_CLEANER_EAGLE_STORAGE_LOADED = true;
      
      // 🆕 等待 Eagle Storage 完全初始化（包括 IndexedDB）
      const checkEagleStorageReady = (attempts = 0) => {
        if (attempts > 20) { // 最多等待 2 秒（20 * 100ms）
          console.warn('[Tab Cleaner] ⚠️ Eagle Storage initialization timeout, proceeding anyway');
          loadOpenGraphLocalV2();
          return;
        }
        
        if (window.__TAB_CLEANER_EAGLE_STORAGE && 
            window.__TAB_CLEANER_EAGLE_STORAGE.saveImage && 
            window.__TAB_CLEANER_EAGLE_STORAGE.loadImage) {
          console.log('[Tab Cleaner] ✅ Eagle Storage is fully ready');
          loadOpenGraphLocalV2();
        } else {
          // 继续等待
          setTimeout(() => checkEagleStorageReady(attempts + 1), 100);
        }
      };
      
      // 开始检查（给一点时间让脚本执行）
      setTimeout(() => checkEagleStorageReady(), 100);
    };
    eagleScript.onerror = (e) => {
      console.error('[Tab Cleaner] Failed to load eagle_storage.js:', e);
      // 即使失败也继续加载 opengraph_local_v2.js（会降级处理）
      loadOpenGraphLocalV2();
    };

    (document.head || document.documentElement).appendChild(eagleScript);
  })();

  // 加载本地 OpenGraph 抓取工具 V2
  // Note: Content scripts run in an isolated world and cannot access page-world globals,
  // so we inject the script and let it communicate via window.postMessage
  function loadOpenGraphLocalV2() {
    // 用 content script 自己的 flag 防止重复注入
    if (window.__TAB_CLEANER_OPENGRAPH_LOCAL_V2_LOADED) {
      console.log('[Tab Cleaner] opengraph_local_v2.js already injected (content world flag)');
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/opengraph_local_v2.js');
    script.onload = () => {
      console.log('[Tab Cleaner] OpenGraph local V2 script injected into page');
      
      // 等待一小段时间，确保 Eagle Storage 已初始化
      setTimeout(() => {
        if (window.__TAB_CLEANER_EAGLE_STORAGE && window.__TAB_CLEANER_EAGLE_STORAGE.saveImage) {
          console.log('[Tab Cleaner] ✅ Eagle Storage is ready for opengraph_local_v2.js');
        } else {
          console.warn('[Tab Cleaner] ⚠️ Eagle Storage not ready, opengraph_local_v2.js will use fallback');
        }
      }, 500);
    };
    script.onerror = (e) => {
      console.error('[Tab Cleaner] Failed to load opengraph_local_v2.js:', e);
    };

    (document.head || document.documentElement).appendChild(script);
    window.__TAB_CLEANER_OPENGRAPH_LOCAL_V2_LOADED = true;
  }

  // ✅ v2.4: pet.js 现在作为 content script 在 manifest.json 中加载
  // 不再需要通过 <script> 标签注入
  // (function injectPetModule() {
  //   // ... 已移除：pet.js 现在作为 content script 运行
  // })();

  let cardContainer = null;
  let isVisible = false;
  let cleaningOverlay = null; // 全屏加载动画覆盖层

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

  // ✅ 插件卡片配置（与 uiConfig.js 中的 pluginCard 配置同步）
  // 注意：如需修改，请同时更新 frontend/src/screens/PersonalSpace/uiConfig.js 中的 pluginCard 配置
  const PLUGIN_CARD_CONFIG = {
    width: 320,                  // 卡片宽度（px）
    height: 485,                 // 卡片高度（px）
    scale: 0.70,                 // 卡片缩放比例（0-1）
    position: {
      top: 0,                   // 距离顶部距离（px）
      right: 25,                  // 距离右侧距离（px）
    },
  };

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
    // ✅ 使用配置中的缩放比例
    const cardScale = PLUGIN_CARD_CONFIG.scale;
    
    return `
      <style>
        :host { all: initial; display:block; --tc-radius: 28px; background: transparent !important; }
        :host { --tc-card-scale: ${cardScale}; } /* ✅ 动态设置卡片缩放比例 */
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
    
    // ✅ 使用配置中的位置参数
    const topOffset = PLUGIN_CARD_CONFIG.position.top;
    const rightOffset = PLUGIN_CARD_CONFIG.position.right;
    
    Object.assign(cardContainer.style, {
      position: "fixed",
      top: `${topOffset}px`,
      right: `${rightOffset}px`,
      left: "auto",
      bottom: "auto",
      zIndex: String(2147483647),
      width: `${PLUGIN_CARD_CONFIG.width}px`,      // ✅ 使用配置中的宽度
      height: `${PLUGIN_CARD_CONFIG.height}px`,    // ✅ 使用配置中的高度
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
        // 显示全屏加载动画
        showCleaningAnimation();
        
        try {
          chrome.runtime.sendMessage({ action: "clean" }, (response) => {
            if (chrome.runtime.lastError) {
              if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                console.warn("[Tab Cleaner] Extension was reloaded, please refresh the page");
              } else {
                console.error("[Tab Cleaner] Failed to clean tabs:", chrome.runtime.lastError);
              }
              // 出错时隐藏动画
              hideCleaningAnimation();
            } else {
              console.log("[Tab Cleaner] Clean action sent:", response);
              // 注意：动画会在 background.js 处理完成后通过消息隐藏
            }
          });
        } catch (error) {
          console.error("[Tab Cleaner] Error sending clean message:", error);
          // 出错时隐藏动画
          hideCleaningAnimation();
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

  // 监听来自页面上下文的 postMessage（opengraph_local_v2.js 发送）
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
                
                // 扩展上下文失效时跳过存储，避免报错刷屏
                if (!chrome.runtime?.id) {
                  console.warn('[Tab Cleaner Content] ⚠️ Extension context invalidated, skip saving recent_opengraph');
                  return;
                }
                chrome.storage.local.set({ recent_opengraph: limited }, () => {
                  if (chrome.runtime.lastError) {
                    if (!chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
                      console.error('[Tab Cleaner Content] ❌ Failed to save recent_opengraph:', chrome.runtime.lastError);
                    } else {
                      console.warn('[Tab Cleaner Content] ⚠️ Skip save (context invalidated)');
                    }
                  } else {
                    console.log('[Tab Cleaner Content] ✅ Added to recent_opengraph list (total:', limited.length, ')');

                    // ⚠️ 重要：不再在这里自动把所有浏览页面发送到后端
                    // 只在以下明确的“收藏/收集”动作中才会发送到后端生成 embedding：
                    // - clean / clean-all（洗衣筐清理）
                    // - clean-current-tab（清理当前 tab）
                    // - 拖拽图片到宠物
                    // - 预览卡片保存（save-opengraph-preview）
                    //
                    // 这样可以避免“浏览记录”被误当成“收藏卡片”写入数据库。
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

  /**
   * 显示全屏加载动画（飘泡泡效果）
   * ✅ 改进：泡泡充满整个页面，水蓝色渐变背景，呼吸感
   */
  function showCleaningAnimation() {
    // 如果已经存在，先移除
    if (cleaningOverlay) {
      cleaningOverlay.remove();
    }
    
    // ✅ 动画配置（从 uiConfig 读取，这里使用默认值）
    const config = {
      bubbles: {
        count: 50,                    // 泡泡数量（充满整个页面）
        minSize: 15,                  // 最小尺寸（px）
        maxSize: 40,                  // 最大尺寸（px）
        minDelay: 0,                  // 最小延迟（秒）
        maxDelay: 2,                  // 最大延迟（秒）
        animationDuration: 3,         // 动画持续时间（秒）
        spreadRadius: 120,            // 扩散半径（%，相对于视口）
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
    `;
    
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
    console.log('[Tab Cleaner] Cleaning animation shown', {
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
  function hideCleaningAnimation() {
    if (cleaningOverlay) {
      cleaningOverlay.style.animation = 'fadeOut 0.3s ease-out';
      cleaningOverlay.style.opacity = '0';
      setTimeout(() => {
        if (cleaningOverlay && cleaningOverlay.parentNode) {
          cleaningOverlay.remove();
        }
        cleaningOverlay = null;
      }, 300);
      console.log('[Tab Cleaner] Cleaning animation hidden');
    }
  }
  
  // 添加 fadeOut 动画样式
  if (!document.getElementById('tab-cleaner-fadeout-style')) {
    const fadeOutStyle = document.createElement('style');
    fadeOutStyle.id = 'tab-cleaner-fadeout-style';
    fadeOutStyle.textContent = `
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(fadeOutStyle);
  }

  // 🦅 监听来自页面上下文的图片下载请求（opengraph_local_v2.js）
  window.addEventListener('message', (event) => {
    // 只处理来自同源的消息
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'TAB_CLEANER_DOWNLOAD_IMAGE_REQUEST') {
      const { messageId, imageUrl } = event.data;
      
      console.log('[Tab Cleaner Content] 🦅 Received image download request:', imageUrl.substring(0, 60));
      
      // 通过 background.js 下载图片
      chrome.runtime.sendMessage({
        action: 'download-image-as-dataurl',
        url: imageUrl,
      }, (response) => {
        // 发送响应回页面上下文
        window.postMessage({
          type: 'TAB_CLEANER_DOWNLOAD_IMAGE_RESPONSE',
          messageId,
          success: response?.success || false,
          dataUrl: response?.dataUrl || null,
          error: response?.error || null,
        }, '*');
      });
    }
  });

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || !req.action) return false;
    if (req.action === "toggle" || req.action === "toggleCard") { toggleCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "show") { showCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "hide") { hideCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "show-cleaning-animation") { showCleaningAnimation(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "hide-cleaning-animation") { hideCleaningAnimation(); sendResponse?.({ ok: true }); return true; }
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
      console.log('[Tab Cleaner Content] fetch-opengraph requested');

      const currentUrl = window.location.href;
      const MAX_ATTEMPTS = 6;   // 最多重试 6 次
      const DELAY_MS = 300;     // 每次间隔 300ms

      const readFromCache = (attempt = 1) => {
        console.log(`[Tab Cleaner Content] Reading from recent_opengraph cache (attempt ${attempt}/${MAX_ATTEMPTS})...`);

        chrome.storage.local.get(['recent_opengraph'], (items) => {
          if (chrome.runtime.lastError) {
            console.error('[Tab Cleaner Content] ❌ Failed to get recent_opengraph:', chrome.runtime.lastError);
            if (typeof sendResponse === 'function') {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
                is_doc_card: false,
              });
            }
            return;
          }

          const recent = items.recent_opengraph || [];
          const cachedData = recent.find(item => item && item.url === currentUrl);

          if (cachedData) {
            console.log('[Tab Cleaner Content] ✅ Found cached data:', {
              url: cachedData.url,
              success: cachedData.success,
              hasTitle: !!cachedData.title,
              hasImage: !!cachedData.image,
            });

            if (cachedData.is_doc_card === undefined) {
              cachedData.is_doc_card = false;
            }

            if (typeof sendResponse === 'function') {
              sendResponse(cachedData);
            }
            return;
          }

          // 没找到缓存，看看要不要重试
          if (attempt < MAX_ATTEMPTS) {
            console.log('[Tab Cleaner Content] ⚠️ No cached data yet, will retry...');
            setTimeout(() => readFromCache(attempt + 1), DELAY_MS);
          } else {
            console.warn('[Tab Cleaner Content] ⚠️ No cached data after retries, returning fallback error');
            if (typeof sendResponse === 'function') {
              sendResponse({
                success: false,
                error: 'Local OpenGraph data is not ready yet',
                is_doc_card: false,
              });
            }
          }
        });
      };

      // 开始第一次读取（后续自动重试）
      readFromCache();
      // 告诉 Chrome：这个 listener 会异步调用 sendResponse
      return true;
    }
    
    // 处理从右键菜单保存图片
    if (req.action === "save-image-from-context-menu") {
      const imageUrl = req.imageUrl;
      if (imageUrl && window.__TAB_CLEANER_IMAGE_CAPTURE) {
        window.__TAB_CLEANER_IMAGE_CAPTURE.captureImage(imageUrl);
        sendResponse?.({ success: true });
      } else {
        sendResponse?.({ success: false, error: 'Image capture not initialized' });
      }
      return true;
    }
    
    // 处理保存采集的图片（从 image_capture_enhanced.js）
    // 注意：image_capture_enhanced.js 直接发送到 background.js，不需要通过 content.js
    // 这里保留是为了兼容性，但通常不会被调用
    if (req.action === "save-captured-image") {
      // 转发到 background.js
      chrome.runtime.sendMessage({
        action: 'save-captured-image',
        data: req.data,
      }, (response) => {
        sendResponse?.(response);
      });
      return true;
    }
    
    return false;
  });

  console.log("Tab Cleaner content (classic) loaded.");
})();
