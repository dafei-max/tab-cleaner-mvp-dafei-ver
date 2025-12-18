(function () {
  if (window.__TAB_CLEANER_CONTENT_INSTALLED) return;
  window.__TAB_CLEANER_CONTENT_INSTALLED = true;

  // 加载本地 OpenGraph 抓取工具
  // Note: Content scripts run in an isolated world and cannot access page-world globals,
  // so we inject the script and let it communicate via window.postMessage
  (function loadOpenGraphLocal() {
    // 用 content script 自己的 flag 防止重复注入
    if (window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED) {
      console.log('[Tab Cleaner] opengraph_local.js already injected (content world flag)');
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/opengraph_local.js');
    script.onload = () => {
      console.log('[Tab Cleaner] OpenGraph local script injected into page');
    };
    script.onerror = (e) => {
      console.error('[Tab Cleaner] Failed to load opengraph_local.js:', e);
    };

    (document.head || document.documentElement).appendChild(script);
    window.__TAB_CLEANER_OPENGRAPH_LOCAL_LOADED = true;
  })();

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
                    
                    // ✅ 立即发送到后端处理（异步，不阻塞）
                    if (cacheData && cacheData.success) {
                      console.log('[Tab Cleaner Content] 📤 Sending OG data to background for backend processing:', {
                        url: cacheData.url,
                        hasTitle: !!(cacheData.title),
                        hasImage: !!(cacheData.image)
                      });
                      
                      chrome.runtime.sendMessage({
                        action: 'send-opengraph-to-backend',
                        data: cacheData
                      }, (response) => {
                        if (chrome.runtime.lastError) {
                          console.error('[Tab Cleaner Content] ❌ Failed to send OG to background:', chrome.runtime.lastError);
                        } else {
                          console.log('[Tab Cleaner Content] ✅ OG data sent to background:', response);
                        }
                      });
                    }
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
      const left = Math.random() * 100; // 0-100%
      const bottom = Math.random() * 20; // 从底部 0-20% 开始
      const delay = Math.random() * (config.bubbles.maxDelay - config.bubbles.minDelay) + config.bubbles.minDelay;
      return `<span style="left: ${left}%; bottom: ${bottom}%; width: ${size}px; height: ${size}px; animation-delay: ${delay}s;"></span>`;
    }).join('');
    
    // 创建全屏覆盖层
    cleaningOverlay = document.createElement('div');
    cleaningOverlay.id = 'tab-cleaner-cleaning-overlay';
    cleaningOverlay.innerHTML = `
      <div class="cleaning-content">
        <div class="cleaning-text">正在清理标签页...</div>
        <div class="cleaning-bubbles">
          ${bubbles}
        </div>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #tab-cleaner-cleaning-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        /* ✅ 水蓝色到白色的径向渐变背景，有呼吸感 */
        background: radial-gradient(circle at center, ${config.background.endColor} 0%, ${config.background.startColor} ${config.background.gradientRadius});
        backdrop-filter: blur(8px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: all;
        animation: fadeIn 0.3s ease-in, breathe ${config.background.breatheDuration}s ease-in-out infinite;
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
        z-index: 1;
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
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        overflow: hidden;
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
    document.body.appendChild(cleaningOverlay);
    
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
    if (req.action === 'show-onboarding-overlay') {
      try {
        injectOnboardingOverlay();
        sendResponse?.({ ok: true });
      } catch (e) {
        console.error('[Tab Cleaner Content] Failed to show onboarding overlay:', e);
        sendResponse?.({ ok: false, error: e?.message || String(e) });
      }
      return true;
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
    return false;
  });

  console.log("Tab Cleaner content (classic) loaded.");
})();

function injectOnboardingOverlay() {
  try {
    if (window.__TAB_CLEANER_ONBOARDING_OVERLAY_ROOT) {
      return;
    }
    const root = document.createElement('div');
    root.id = 'tab-cleaner-onboarding-root';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '2147483647';
    root.style.pointerEvents = 'auto';

    const shadow = root.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .tc-onboarding-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }
      .tc-onboarding-container {
        position: relative;
        width: 1047px;
        height: 708px;
        background: transparent;
        border-radius: 21px;
        overflow: hidden;
        transform: scale(0.5);
        transform-origin: center center;
        animation: tc-onboarding-zoom-in 0.4s ease-out forwards;
      }
      @keyframes tc-onboarding-zoom-in {
        from { opacity: 0; transform: scale(0); }
        to { opacity: 1; transform: scale(0.5); }
      }
      .tc-onboarding-bubble-layer {
        position: absolute;
        inset: 0;
        opacity: 0.9;
        pointer-events: none;
        z-index: 0;
      }
      .tc-bubble-bg {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .tc-onboarding-container > *:not(.tc-onboarding-bubble-layer) {
        position: absolute;
        z-index: 1;
      }
      .tc-onboarding-close-button {
        position: absolute;
        width: 55px;
        height: 55px;
        left: 960px;
        top: 6px;
        background: rgba(255,255,255,0.5);
        border: 1px solid #FFFFFF;
        box-shadow: 3px 4px 4px rgba(130,130,130,0.25);
        border-radius: 21px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .tc-onboarding-close-button:hover {
        background: rgba(255,255,255,0.7);
        transform: scale(1.05);
      }
      .tc-close-icon {
        font-size: 48px;
        line-height: 56px;
        color: #FFFFFF;
        text-shadow: 3px 2px 6.1px rgba(0,0,0,0.25);
        transform: rotate(45deg);
      }
      .tc-onboarding-arrow {
        position: absolute;
        width: 75px;
        height: 45px;
        left: 50.05%;
        top: 56%;
        transform: translateX(-50%);
        pointer-events: none;
      }
      .tc-onboarding-textcontent {
        position: absolute;
        width: 735px;
        height: 312px;
        left: calc(50% - 735px / 2 + 17px);
        top: 147px;
      }
      .tc-onboarding-title {
        position: absolute;
        width: 735px;
        height: 148px;
        left: 0;
        top: 0;
        font-family: 'FZLanTingYuanS-R-GB', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 400;
        font-size: 64px;
        line-height: 74px;
        text-align: center;
        letter-spacing: 1px;
        color: #4D4D4D;
        margin: 0;
      }
      .tc-onboarding-description {
        position: absolute;
        width: 514px;
        left: calc(50% - 514px / 2 + 5.5px);
        top: 33.97%;
        font-family: 'FZLanTingYuanS-R-GB', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 400;
        font-size: 20px;
        line-height: 23px;
        text-align: center;
        letter-spacing: 1px;
        color: #A4A4A4;
        margin: 0;
      }
      .tc-onboarding-tab-example {
        position: absolute;
        width: 398px;
        height: 133.13px;
        left: 149px;
        top: 382px;
        pointer-events: none;
      }
      .tc-onboarding-tab-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .tc-onboarding-card-example {
        position: absolute;
        width: 108px;
        height: 153px;
        left: 685px;
        top: 368px;
        pointer-events: none;
      }
      .tc-card-glow {
        position: absolute;
        width: 140px;
        height: 173px;
        left: -16px;
        top: -10px;
        background: #FFFFFF;
        filter: blur(23.45px);
      }
      .tc-card-wrapper {
        position: absolute;
        width: 108px;
        height: 153px;
        left: 0;
        top: 0;
        filter: drop-shadow(0px 1px 6.6px rgba(255,255,255,0.8));
      }
      .tc-card-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0.91px 0.91px 7.28px rgba(84,84,84,0.25));
      }
      .tc-onboarding-buttons {
        position: absolute;
        width: 462px;
        height: 57px;
        left: calc(50% - 462px / 2 + 15.5px);
        top: 560px;
      }
      .tc-onboarding-skip-btn,
      .tc-onboarding-continue-btn {
        position: absolute;
        height: 57px;
        display: flex;
        align-items: center;
        cursor: pointer;
        background: transparent;
        border: none;
        padding: 0;
      }
      .tc-onboarding-skip-btn {
        width: 240px;
        left: 0;
        top: 0;
      }
      .tc-onboarding-continue-btn {
        width: 130px;
        left: 356px;
        top: 0;
      }
      .tc-btn-polygon {
        position: absolute;
        width: 57px;
        height: 57px;
        left: 0;
        top: 0;
        pointer-events: none;
      }
      .tc-skip-polygon {
        transform: rotate(-90deg);
      }
      .tc-continue-polygon {
        transform: rotate(0deg);
      }
      .tc-btn-text {
        position: absolute;
        height: 28px;
        top: 15px;
        font-family: 'FZLanTingYuanS-R-GB', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 400;
        font-size: 24px;
        line-height: 28px;
        letter-spacing: 1px;
        color: #A4A4A4;
        z-index: 1;
        white-space: nowrap;
      }
      .tc-skip-text {
        left: 66px;
      }
      .tc-continue-text {
        left: 57px;
      }
      .tc-onboarding-pet {
        position: absolute;
        width: 121px;
        height: 121px;
        left: 240px;
        top: 113px;
        pointer-events: none;
        z-index: 5;
      }
      .tc-pet-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    `;

    const bubbleUrl   = chrome.runtime.getURL('static/img/onboarding/bubble-lay.svg');
    const arrowUrl    = chrome.runtime.getURL('static/img/onboarding/Arrow.svg');
    const tabUrl      = chrome.runtime.getURL('static/img/onboarding/Tab.svg');
    const cardUrl     = chrome.runtime.getURL('static/img/onboarding/card-example.png');
    const skipPolyUrl = chrome.runtime.getURL('static/img/onboarding/Polygon 3.svg');
    const contPolyUrl = chrome.runtime.getURL('static/img/onboarding/Polygon 1 (2).svg');
    const petVideoUrl = chrome.runtime.getURL('static/video/wave-hand.webm');

    const wrapper = document.createElement('div');
    wrapper.className = 'tc-onboarding-overlay';
    wrapper.innerHTML = `
      <div class="tc-onboarding-container">
        <div class="tc-onboarding-bubble-layer">
          <img src="${bubbleUrl}" alt="" class="tc-bubble-bg" />
        </div>
        <button class="tc-onboarding-close-button" type="button">
          <span class="tc-close-icon">+</span>
        </button>
        <img src="${arrowUrl}" alt="" class="tc-onboarding-arrow" />
        <div class="tc-onboarding-textcontent">
          <h1 class="tc-onboarding-title">
            欢迎来到 Tab 洗衣房<br />我是值班长 Leo
          </h1>
          <p class="tc-onboarding-description">
            很多 Tab 就像堆在一起的衣物，虽然开着，但并没有被有效利用。我的工作，就是帮你将暂时不用的 Tab 挂起来晾晒、收纳妥当。<br />
            接下来我们来试试吧～
          </p>
        </div>
        <div class="tc-onboarding-tab-example">
          <img src="${tabUrl}" alt="Tab 示例" class="tc-onboarding-tab-image" />
        </div>
        <div class="tc-onboarding-card-example">
          <div class="tc-card-glow"></div>
          <div class="tc-card-wrapper">
            <img src="${cardUrl}" alt="卡片示例" class="tc-card-image" />
          </div>
        </div>
        <div class="tc-onboarding-buttons">
          <button class="tc-onboarding-skip-btn" type="button">
            <img src="${skipPolyUrl}" alt="" class="tc-btn-polygon tc-skip-polygon" />
            <span class="tc-btn-text tc-skip-text">跳过新手教程</span>
          </button>
          <button class="tc-onboarding-continue-btn" type="button">
            <img src="${contPolyUrl}" alt="" class="tc-btn-polygon tc-continue-polygon" />
            <span class="tc-btn-text tc-continue-text">继续</span>
          </button>
        </div>
        <div class="tc-onboarding-pet">
          <video
            class="tc-pet-video"
            src="${petVideoUrl}"
            autoplay
            loop
            muted
            playsinline
          ></video>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    document.documentElement.appendChild(root);
    window.__TAB_CLEANER_ONBOARDING_OVERLAY_ROOT = root;

    const handleDismiss = (completed) => {
      try {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            showOnboarding: false,
            onboardingDismissed: true,
            onboardingCompleted: !!completed,
          });
        }
      } catch (e) {
        console.warn('[Tab Cleaner Content] Failed to persist onboarding state:', e);
      }
      if (window.__TAB_CLEANER_ONBOARDING_OVERLAY_ROOT) {
        window.__TAB_CLEANER_ONBOARDING_OVERLAY_ROOT.remove();
        window.__TAB_CLEANER_ONBOARDING_OVERLAY_ROOT = null;
      }
    };

    const closeBtn = shadow.querySelector('.tc-onboarding-close-button');
    const skipBtn = shadow.querySelector('.tc-onboarding-skip-btn');
    const continueBtn = shadow.querySelector('.tc-onboarding-continue-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => handleDismiss(false));
    }
    if (skipBtn) {
      skipBtn.addEventListener('click', () => handleDismiss(false));
    }
    if (continueBtn) {
      continueBtn.addEventListener('click', () => handleDismiss(true));
    }
  } catch (e) {
    console.error('[Tab Cleaner Content] injectOnboardingOverlay failed:', e);
  }
}
