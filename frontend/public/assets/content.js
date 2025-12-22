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
    // 🆕 暴露 extensionId 给 page world，用于 sendMessage 需要的 id
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      window.__TAB_CLEANER_EXTENSION_ID = chrome.runtime.id;
    }
      
      // 🆕 等待 Eagle Storage 完全初始化（包括 IndexedDB）
      const checkEagleStorageReady = async (attempts = 0) => {
        if (attempts > 50) { // 🆕 增加到 5 秒（50 * 100ms），给 IndexedDB 更多时间
          console.warn('[Tab Cleaner] ⚠️ Eagle Storage initialization timeout, proceeding anyway');
          loadOpenGraphLocalV2();
          return;
        }
        
        // ✅ 检查 API 是否存在
        if (window.__TAB_CLEANER_EAGLE_STORAGE && 
            window.__TAB_CLEANER_EAGLE_STORAGE.saveImage && 
            window.__TAB_CLEANER_EAGLE_STORAGE.loadImage) {
          
          // 🆕 关键修复：确保 IndexedDB 真正打开（通过尝试访问 _db 或调用 initDB）
          try {
            // 如果 _db 已存在，说明已初始化
            if (window.__TAB_CLEANER_EAGLE_STORAGE._db) {
              console.log('[Tab Cleaner] ✅ Eagle Storage is fully ready (IndexedDB opened)');
              loadOpenGraphLocalV2();
              return;
            }
            
            // 如果 _db 不存在，尝试调用 initDB 确保初始化
            if (window.__TAB_CLEANER_EAGLE_STORAGE.initDB) {
              try {
                await window.__TAB_CLEANER_EAGLE_STORAGE.initDB();
                // 🆕 等待一小段时间，确保 _db 引用已更新
                await new Promise(resolve => setTimeout(resolve, 100));
                if (window.__TAB_CLEANER_EAGLE_STORAGE._db) {
                  console.log('[Tab Cleaner] ✅ Eagle Storage initialized and IndexedDB opened');
                  loadOpenGraphLocalV2();
                  return;
                }
              } catch (initError) {
                console.warn('[Tab Cleaner] ⚠️ initDB() failed:', initError);
                // 继续等待，可能还在初始化中
              }
            }
          } catch (error) {
            console.warn('[Tab Cleaner] ⚠️ Error checking IndexedDB:', error);
          }
        }
        
        // 继续等待
        setTimeout(() => checkEagleStorageReady(attempts + 1), 100);
      };
      
      // 🆕 增加初始延迟，给脚本更多时间执行
      setTimeout(() => checkEagleStorageReady(), 200);
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
  let cardBubble = null;      // 卡片右侧提示 chatbubble（全局引用，方便多次控制）
  // 🐘 卡片窗口视频：入口 & 清理时 dizzy
  let windowElephantVideo = null;       // 打开卡片时播放 window-elephant.webm
  let dizzyVideo = null;                // 一键清理期间循环播放 window-dizzy-elephant_1.webm

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
        // 使用新的桌宠入口 SVG，保持按钮大小不变
        WINDOW: asset('static/img/window-pet-entry.svg'),
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
        :host { all: initial; display:block; position: relative; --tc-radius: 28px; background: transparent !important; }
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

        /* 🗨️ 卡片右侧提示聊天气泡，复用桌宠 chat-bubble 视觉风格 + 出场动效 */
        .card-chat-bubble {
          position: absolute;
          right: -25px; /* 再往左收回 30px */
          top: 0px;     /* 保持纵向不变 */
          width: 214px;
          height: 146px;
          display: block;
          opacity: 0;
          /* 初始状态：稍微下移 + 缩放，整体略小于宠物气泡 */
          transform: translateY(6px) scale(0.55);
          transition: opacity 300ms ease-out, transform 300ms ease-out;
          pointer-events: auto; /* 允许用户点击关闭 */
          z-index: 200;
        }
        .card-chat-bubble.card-chat-bubble-visible {
          opacity: 1;
          transform: translateY(0) scale(0.6); /* 比刚才略大一丢丢 */
        }
        .card-chat-bubble .chatbubble-bg {
          position: absolute;
          left: 0;
          top: 0;
          width: 214px;
          height: 146px;
          opacity: 0.9;
        }
        .card-chat-bubble .chat-bubble-vector {
          position: absolute;
          left: 95.55px;
          top: 15.6px;
          width: 18.81px;
          height: 18.79px;
          stroke: #231815;
          stroke-width: 0.99px;
        }
        .card-chat-bubble .chat-bubble-text {
          position: absolute;
          left: 37.7px;
          top: 26.65px;
          width: 146.9px;
          height: 86.45px;
          font-family: 'FZLanTingYuanS-R-GB', '方正兰亭', 'Microsoft YaHei', '微软雅黑', sans-serif;
          font-weight: 400;
          font-size: 11.7px;
          line-height: 1.15625em;
          letter-spacing: 5.56%;
          color: #000000;
          text-align: left;
          display: flex;
          align-items: center;
          word-wrap: break-word;
          overflow-wrap: break-word;
          white-space: pre-line;
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
        /* 🌀 一键清理时整张卡片洗衣机式晃动 */
        #tc-card.tc-card-shake {
          animation: tc-card-shake 0.9s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes tc-card-shake {
          0% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-2px) rotate(-0.7deg); }
          20% { transform: translateX(2px) rotate(0.7deg); }
          30% { transform: translateX(-3px) rotate(-1deg); }
          40% { transform: translateX(3px) rotate(1deg); }
          50% { transform: translateX(-2px) rotate(-0.7deg); }
          60% { transform: translateX(2px) rotate(0.7deg); }
          70% { transform: translateX(-1px) rotate(-0.4deg); }
          80% { transform: translateX(1px) rotate(0.4deg); }
          90% { transform: translateX(-0.5px) rotate(-0.2deg); }
          100% { transform: translateX(0) rotate(0deg); }
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
      // 🗨️ 鼠标悬浮时显示 chatbubble 提示（个人空间）
      let homeHoverBubbleTimer = null;
      homeBtn.addEventListener("mouseenter", () => {
        // 延迟显示，避免鼠标快速划过时闪烁
        homeHoverBubbleTimer = setTimeout(() => {
          if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText) {
            const customContent = `
              <div style="font-family: 'FZLanTingYuanS-R-GB', sans-serif; color: #000000; width: 140px; height: 50px; padding: 0; margin: 0;">
                <div style="font-size: 12px; line-height: 14px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 400; color: #000000;">
                  个人空间
                </div>
                <div style="font-size: 8px; line-height: 9px; letter-spacing: 1px; font-weight: 400; color: #000000;">
                  您可以随时查看之前清洗收藏的tab
                </div>
              </div>
            `;
            window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText(customContent, 5000); // 显示 5 秒
          }
        }, 300); // 300ms 延迟
      });
      
      homeBtn.addEventListener("mouseleave", () => {
        // 取消延迟显示
        if (homeHoverBubbleTimer) {
          clearTimeout(homeHoverBubbleTimer);
          homeHoverBubbleTimer = null;
        }
        // 隐藏 chatbubble
        if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide) {
          window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide();
        }
      });
      
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
      // 🗨️ 鼠标悬浮时显示 chatbubble 提示
      let hoverBubbleTimer = null;
      cleanBtn.addEventListener("mouseenter", () => {
        console.log('[Tab Cleaner] 🗨️ Clean button hover - checking chatbubble...', {
          chatBubbleExists: !!window.__TAB_CLEANER_PET_CHAT_BUBBLE,
          hasShowCustomText: !!(window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText)
        });
        
        // 延迟显示，避免鼠标快速划过时闪烁
        hoverBubbleTimer = setTimeout(() => {
          // 如果 chatbubble 还没初始化，尝试等待一下
          if (!window.__TAB_CLEANER_PET_CHAT_BUBBLE || !window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText) {
            console.warn('[Tab Cleaner] ⚠️ Chat bubble not ready, retrying...');
            // 等待最多 1 秒，每 100ms 检查一次
            let retryCount = 0;
            const maxRetries = 10;
            const checkInterval = setInterval(() => {
              retryCount++;
              if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText) {
                clearInterval(checkInterval);
                console.log('[Tab Cleaner] ✅ Chat bubble ready after', retryCount * 100, 'ms');
                showCleanButtonTooltip();
              } else if (retryCount >= maxRetries) {
                clearInterval(checkInterval);
                console.warn('[Tab Cleaner] ❌ Chat bubble not available after', maxRetries * 100, 'ms');
              }
            }, 100);
            return;
          }
          
          showCleanButtonTooltip();
        }, 300); // 300ms 延迟
        
        function showCleanButtonTooltip() {
          if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText) {
            const customContent = `
              <div style="font-family: 'FZLanTingYuanS-R-GB', sans-serif; color: #000000; width: 140px; height: 50px; padding: 0; margin: 0;">
                <div style="font-size: 12px; line-height: 14px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 400; color: #000000;">
                  批量洗涤
                </div>
                <div style="font-size: 8px; line-height: 9px; letter-spacing: 1px; font-weight: 400; color: #000000;">
                  结束工作，想要彻底清空吗？点击插件按钮。我会立即将所有开着的 Tab 批量挂起晾晒，瞬间清空工作台。
                </div>
              </div>
            `;
            try {
              window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText(customContent, 5000); // 显示 5 秒
              console.log('[Tab Cleaner] ✅ Clean button tooltip shown');
            } catch (err) {
              console.error('[Tab Cleaner] ❌ Failed to show clean button tooltip:', err);
            }
          }
        }
      });
      
      cleanBtn.addEventListener("mouseleave", () => {
        // 取消延迟显示
        if (hoverBubbleTimer) {
          clearTimeout(hoverBubbleTimer);
          hoverBubbleTimer = null;
        }
        // 隐藏 chatbubble
        if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide) {
          try {
            window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide();
          } catch (err) {
            console.error('[Tab Cleaner] ❌ Failed to hide chat bubble:', err);
          }
        }
      });
      
      cleanBtn.addEventListener("click", () => {
        // 显示全屏加载动画
        showCleaningAnimation();
        // 🎬 同步开始播放窗口 dizzy 动画（循环）
        playDizzyVideo();

        // 🌀 让整张卡片像洗衣机一样开始震动
        try {
          const card = shadow.getElementById('tc-card');
          if (card) {
            card.classList.add('tc-card-shake');
          }
        } catch (_) {}
        
        try {
          chrome.runtime.sendMessage({ action: "clean" }, (response) => {
            if (chrome.runtime.lastError) {
              if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                console.warn("[Tab Cleaner] Extension was reloaded, please refresh the page");
              } else {
                console.error("[Tab Cleaner] Failed to clean tabs:", chrome.runtime.lastError);
              }
              // 出错时隐藏动画、dizzy 视频和卡片震动
              hideCleaningAnimation();
              stopDizzyVideo();
              try {
                const card = shadow.getElementById('tc-card');
                if (card) {
                  card.classList.remove('tc-card-shake');
                }
              } catch (_) {}
            } else {
              console.log("[Tab Cleaner] Clean action sent:", response);
              // 注意：动画会在 background.js 处理完成后通过消息隐藏
            }
          });
        } catch (error) {
          console.error("[Tab Cleaner] Error sending clean message:", error);
          // 出错时隐藏动画、dizzy 视频和卡片震动
          hideCleaningAnimation();
          stopDizzyVideo();
          try {
            const card = shadow.getElementById('tc-card');
            if (card) {
              card.classList.remove('tc-card-shake');
            }
          } catch (_) {}
        }
      });
    }
    if (detailsBtn) {
      // 🗨️ 鼠标悬浮时显示 chatbubble 提示（工作时间和收藏tab个数）
      let detailsHoverBubbleTimer = null;
      detailsBtn.addEventListener("mouseenter", async () => {
        // 延迟显示，避免鼠标快速划过时闪烁
        detailsHoverBubbleTimer = setTimeout(async () => {
          if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText) {
            // 获取工作时间和收藏tab个数
            let workTime = '0小时';
            let savedTabCount = 0;
            
            try {
              // 从 IndexedDB 获取所有 sessions
              if (window.__TAB_CLEANER_EAGLE_STORAGE && window.__TAB_CLEANER_EAGLE_STORAGE.getAllSessions) {
                const sessions = await window.__TAB_CLEANER_EAGLE_STORAGE.getAllSessions();
                if (sessions && sessions.length > 0) {
                  savedTabCount = sessions.reduce((total, session) => {
                    return total + (session.items?.length || 0);
                  }, 0);
                  
                  // 计算工作时间（从最早session到现在的总时长，简化处理）
                  const now = Date.now();
                  const earliestSession = sessions.reduce((earliest, session) => {
                    const sessionTime = session.created_at || session.timestamp || 0;
                    return !earliest || sessionTime < earliest ? sessionTime : earliest;
                  }, null);
                  
                  if (earliestSession) {
                    const hours = Math.floor((now - earliestSession) / (1000 * 60 * 60));
                    workTime = `${hours}小时`;
                  }
                }
              }
            } catch (err) {
              console.warn('[Tab Cleaner] Failed to get work time and saved tab count:', err);
            }
            
            const customContent = `
              <div style="font-family: 'FZLanTingYuanS-R-GB', sans-serif; color: #000000; width: 140px; height: 50px; padding: 0; margin: 0;">
                <div style="font-size: 12px; line-height: 14px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 400; color: #000000;">
                  洗衣机详情
                </div>
                <div style="font-size: 8px; line-height: 9px; letter-spacing: 1px; font-weight: 400; color: #000000;">
                  工作时间：${workTime}<br/>已收藏：${savedTabCount}个tab
                </div>
              </div>
            `;
            window.__TAB_CLEANER_PET_CHAT_BUBBLE.showCustomText(customContent, 5000); // 显示 5 秒
          }
        }, 300); // 300ms 延迟
      });
      
      detailsBtn.addEventListener("mouseleave", () => {
        // 取消延迟显示
        if (detailsHoverBubbleTimer) {
          clearTimeout(detailsHoverBubbleTimer);
          detailsHoverBubbleTimer = null;
        }
        // 隐藏 chatbubble
        if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide) {
          window.__TAB_CLEANER_PET_CHAT_BUBBLE.hide();
        }
      });
      
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
        
        // 用户点击召唤宠物按钮时，自动隐藏引导气泡
        try {
          if (cardBubble) {
            cardBubble.classList.remove('card-chat-bubble-visible');
          }
        } catch (_) {}
        
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

    // 在卡片右侧添加提示聊天气泡，复用桌宠 chat-bubble 的 DOM 结构和贴图
    if (shadow && !cardBubble) {
      cardBubble = document.createElement('div');
      cardBubble.className = 'card-chat-bubble';
      cardBubble.innerHTML = `
        <img class="chatbubble-bg" alt="Chatbubble bg" src="${asset('static/img/chatbubble/text-bubble-bg.svg')}" />
        <img class="chat-bubble-vector" alt="Vector" src="${asset('static/img/chatbubble/text-bubble-vector.svg')}" />
        <div class="chat-bubble-text">
HiHi我在这里！！
请敲敲（点击）洗衣机窗户
召唤我出来～🩵
        </div>
      `;
      // ⚠️ 不再放到 card 内部，避免被 card 的 overflow/clip-path 裁剪；直接挂在 shadow root 下，让它悬浮在卡片上方
      shadow.appendChild(cardBubble);

      // 允许用户点击气泡手动关闭
      try {
        cardBubble.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cardBubble.classList.remove('card-chat-bubble-visible');
        });
      } catch (_) {}
    }

    document.body.appendChild(cardContainer);
    if (card) {
      requestAnimationFrame(() => {
        card.classList.add("visible");
        // 复用之前那套淡入 + 轻微缩放动画：先用初始 transform/opacity，下一帧加 visible class
        if (cardBubble) {
          // 确保每次创建卡片时，气泡都重新可见
          cardBubble.classList.remove('card-chat-bubble-visible');
          requestAnimationFrame(() => {
            cardBubble.classList.add('card-chat-bubble-visible');
          });
        }
      });
    }
  }

  async function showCard() {
    if (!cardContainer) await createCard();
    cardContainer.style.display = "block";
    const card = cardContainer.shadowRoot.getElementById("tc-card");
    card && card.classList.add("visible");
    isVisible = true;
    // 🎬 每次打开卡片都播放 window-elephant.webm
    playWindowElephantVideo();
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
        z-index: 2147483646 !important; /* 🆕 在卡片和宠物下面（卡片和宠物是 2147483647） */
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

  // ============ 🐘 卡片窗口视频：window-elephant & window-dizzy-elephant_1 ============

  // 打开卡片时播放 window-elephant.webm
  function playWindowElephantVideo() {
    if (!cardContainer || !cardContainer.shadowRoot) return;
    
    const windowButton = cardContainer.shadowRoot.querySelector('.window-button');
    if (!windowButton) return;
    
    const imageContainer = windowButton.querySelector('.image');
    if (!imageContainer) return;
    
    if (!windowElephantVideo) {
      windowElephantVideo = document.createElement('video');
      windowElephantVideo.src = asset('static/video/window-elephant.webm');
      windowElephantVideo.autoplay = true;
      windowElephantVideo.loop = false;
      windowElephantVideo.muted = true;
      windowElephantVideo.playsInline = true;
      windowElephantVideo.preload = 'auto';
      windowElephantVideo.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        z-index: 3;
        pointer-events: none;
      `;
      
      // 播放结束后移除视频，并恢复静态内容
      windowElephantVideo.addEventListener('ended', () => {
        if (windowElephantVideo && windowElephantVideo.parentNode) {
          windowElephantVideo.parentNode.removeChild(windowElephantVideo);
        }
        windowElephantVideo = null;
      });
      
      imageContainer.appendChild(windowElephantVideo);
    }

    // 每次调用都从头播放一遍
    if (windowElephantVideo) {
      try {
        windowElephantVideo.currentTime = 0;
        const playPromise = windowElephantVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      } catch (_) {}
    }
  }

  // 一键清理期间循环播放 window-dizzy-elephant_1.webm
  function playDizzyVideo() {
    if (!cardContainer || !cardContainer.shadowRoot) return;
    
    const windowButton = cardContainer.shadowRoot.querySelector('.window-button');
    if (!windowButton) return;
    
    const imageContainer = windowButton.querySelector('.image');
    if (!imageContainer) return;
    
    // 如已有，先停掉
    if (dizzyVideo) {
      stopDizzyVideo();
    }
    
    dizzyVideo = document.createElement('video');
    dizzyVideo.src = asset('static/video/window-dizzy-elephant_1.webm');
    dizzyVideo.autoplay = true;
    dizzyVideo.loop = true;
    dizzyVideo.muted = true;
    dizzyVideo.playsInline = true;
    dizzyVideo.preload = 'auto';
    dizzyVideo.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      z-index: 3;
      pointer-events: none;
    `;
    
    imageContainer.appendChild(dizzyVideo);
    const playPromise = dizzyVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  // 停止清理时的循环 dizzy 视频
  function stopDizzyVideo() {
    if (!dizzyVideo) return;
    try {
      dizzyVideo.pause();
      dizzyVideo.currentTime = 0;
      if (dizzyVideo.parentNode) {
        dizzyVideo.parentNode.removeChild(dizzyVideo);
      }
    } catch (_) {}
    dizzyVideo = null;
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

  // 🦅 监听来自页面上下文的 postMessage（下载图片 & caption 请求）
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    // 图片下载请求
    if (event.data && event.data.type === 'TAB_CLEANER_DOWNLOAD_IMAGE_REQUEST') {
      const { messageId, imageUrl } = event.data;
      console.log('[Tab Cleaner Content] 🦅 Received image download request:', imageUrl.substring(0, 60));
      chrome.runtime.sendMessage({
        action: 'download-image-as-dataurl',
        url: imageUrl,
      }, (response) => {
        window.postMessage({
          type: 'TAB_CLEANER_DOWNLOAD_IMAGE_RESPONSE',
          messageId,
          success: response?.success || false,
          dataUrl: response?.dataUrl || null,
          error: response?.error || null,
        }, '*');
      });
      return;
    }


    // 🆕 Vectordb 搜索请求：页面 -> content -> background
    if (event.data && event.data.type === 'TAB_CLEANER_VECTORDB_SEARCH_REQUEST') {
      const { messageId, query, topK } = event.data;
      console.log('[Tab Cleaner Content] 🔍 [VECTORDB] Received search request:', messageId);
      chrome.runtime.sendMessage({
        action: 'search-vectordb',
        query,
        topK,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Runtime error:', chrome.runtime.lastError);
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_SEARCH_RESPONSE',
            messageId,
            success: false,
            results: [],
            error: chrome.runtime.lastError.message,
          }, '*');
          return;
        }
        if (!response) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Empty response from background');
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_SEARCH_RESPONSE',
            messageId,
            success: false,
            results: [],
            error: 'Empty response from background',
          }, '*');
          return;
        }
        window.postMessage({
          type: 'TAB_CLEANER_VECTORDB_SEARCH_RESPONSE',
          messageId,
          success: response.success !== false,
          results: response.results || [],
          error: response.error || null,
        }, '*');
        console.log('[Tab Cleaner Content] ✅ [VECTORDB] Search response sent:', {
          messageId,
          resultCount: (response.results || []).length,
        });
      });
      return;
    }

    // 🆕 Vectordb 批量 Caption 请求：页面 -> content -> background
    if (event.data && event.data.type === 'TAB_CLEANER_VECTORDB_BATCH_CAPTIONS_REQUEST') {
      const { messageId, urls } = event.data;
      console.log('[Tab Cleaner Content] 📦 [VECTORDB] Received batch captions request:', {
        messageId,
        urlCount: urls?.length || 0,
      });
      chrome.runtime.sendMessage({
        action: 'batch-get-vectordb-captions',
        urls,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Runtime error:', chrome.runtime.lastError);
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_BATCH_CAPTIONS_RESPONSE',
            messageId,
            success: false,
            results: [],
            error: chrome.runtime.lastError.message,
          }, '*');
          return;
        }
        if (!response) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Empty response from background');
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_BATCH_CAPTIONS_RESPONSE',
            messageId,
            success: false,
            results: [],
            error: 'Empty response from background',
          }, '*');
          return;
        }
        window.postMessage({
          type: 'TAB_CLEANER_VECTORDB_BATCH_CAPTIONS_RESPONSE',
          messageId,
          success: response.success !== false,
          results: response.results || [],
          error: response.error || null,
        }, '*');
        console.log('[Tab Cleaner Content] ✅ [VECTORDB] Batch captions response sent:', {
          messageId,
          resultCount: (response.results || []).length,
        });
      });
      return;
    }

    // 🆕 Vectordb Caption 请求：页面 -> content -> background（通过 URL 查询）
    if (event.data && event.data.type === 'TAB_CLEANER_VECTORDB_CAPTION_REQUEST') {
      const { messageId, url } = event.data;
      console.log('[Tab Cleaner Content] 📝 [VECTORDB] Received caption request for URL:', url?.substring(0, 60));
      chrome.runtime.sendMessage({
        action: 'get-vectordb-caption',
        url,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Runtime error:', chrome.runtime.lastError);
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_CAPTION_RESPONSE',
            messageId,
            success: false,
            quickCaption: null,
            tags: [],
            error: chrome.runtime.lastError.message,
          }, '*');
          return;
        }
        if (!response) {
          console.error('[Tab Cleaner Content] ❌ [VECTORDB] Empty response from background');
          window.postMessage({
            type: 'TAB_CLEANER_VECTORDB_CAPTION_RESPONSE',
            messageId,
            success: false,
            quickCaption: null,
            tags: [],
            error: 'Empty response from background',
          }, '*');
          return;
        }
        window.postMessage({
          type: 'TAB_CLEANER_VECTORDB_CAPTION_RESPONSE',
          messageId,
          success: response.success !== false && !!response.quickCaption,
          quickCaption: response.quickCaption || null,
          tags: response.tags || [],
          error: response.error || null,
        }, '*');
        console.log('[Tab Cleaner Content] ✅ [VECTORDB] Caption response sent:', {
          messageId,
          hasCaption: !!response.quickCaption,
        });
      });
      return;
    }
  });

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || !req.action) return false;
    if (req.action === "toggle" || req.action === "toggleCard") { toggleCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "show") { showCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "hide") { hideCard(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "show-cleaning-animation") { showCleaningAnimation(); sendResponse?.({ ok: true }); return true; }
    if (req.action === "hide-cleaning-animation") {
      hideCleaningAnimation();
      stopDizzyVideo();
      // ⏹ 清理结束时停止卡片震动
      try {
        if (cardContainer && cardContainer.shadowRoot) {
          const card = cardContainer.shadowRoot.getElementById('tc-card');
          if (card) {
            card.classList.remove('tc-card-shake');
          }
        }
      } catch (_) {}
      sendResponse?.({ ok: true });
      return true;
    }
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
    if (req.action === 'show-tips-bubble') {
      try {
        injectTipsBubble();
        sendResponse?.({ ok: true });
      } catch (e) {
        console.error('[Tab Cleaner Content] Failed to show tips bubble:', e);
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

    // 🆕 来自后台 WS 的 caption 推送
    if (req.action === 'caption-ready' && req.payload) {
      window.postMessage({
        type: 'TAB_CLEANER_CAPTION_PUSH',
        payload: req.payload,
      }, '*');
      sendResponse?.({ ok: true });
      return true;
    }
    
    return false;
  });

  console.log("Tab Cleaner content (classic) loaded.");

  // 🆕 页面加载时检查是否需要显示提示气泡
  chrome.storage.local.get(['showTipsBubble', 'tipsBubbleDismissed'], (items) => {
    if (items.showTipsBubble && !items.tipsBubbleDismissed) {
      // 延迟一点显示，确保页面已加载
      setTimeout(() => {
        injectTipsBubble();
      }, 1000);
    }
  });
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

    const bubbleUrl = chrome.runtime.getURL('static/img/onboarding/bubble-lay.svg');
    const arrowUrl = chrome.runtime.getURL('static/img/onboarding/Arrow.svg');
    const tabUrl = chrome.runtime.getURL('static/img/onboarding/Tab.svg');
    const cardUrl = chrome.runtime.getURL('static/img/onboarding/card-example.png');
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

/**
 * 🆕 注入提示气泡到页面右上角（靠近扩展图标位置）
 * 在用户首次安装或刷新插件时显示
 */
function injectTipsBubble() {
  try {
    // 检查是否已经显示过
    if (window.__TAB_CLEANER_TIPS_BUBBLE_ROOT) {
      return;
    }

    // 检查是否应该显示
    chrome.storage.local.get(['showTipsBubble', 'tipsBubbleDismissed'], (items) => {
      if (!items.showTipsBubble || items.tipsBubbleDismissed) {
        return;
      }

      const root = document.createElement('div');
      root.id = 'tab-cleaner-tips-bubble-root';
      root.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      `;

      const shadow = root.attachShadow({ mode: 'closed' });

      const tipsBubbleUrl = chrome.runtime.getURL('static/img/tips-bubble.svg');

      const style = document.createElement('style');
      style.textContent = `
        .tc-tips-bubble-container {
          position: relative;
          width: 336px;
          height: 126px;
          pointer-events: auto;
          cursor: pointer;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .tc-tips-bubble-container:hover {
          transform: scale(1.02);
        }
        .tc-tips-bubble-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .tc-tips-bubble-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          background: rgba(255, 255, 255, 0.8);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
          color: #666;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: auto;
        }
        .tc-tips-bubble-container:hover .tc-tips-bubble-close {
          opacity: 1;
        }
        .tc-tips-bubble-close:hover {
          background: rgba(255, 255, 255, 1);
          color: #333;
        }
        @keyframes tc-tips-bubble-fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .tc-tips-bubble-container {
          animation: tc-tips-bubble-fade-in 0.4s ease-out;
        }
      `;

      const container = document.createElement('div');
      container.className = 'tc-tips-bubble-container';

      const svgImg = document.createElement('img');
      svgImg.src = tipsBubbleUrl;
      svgImg.className = 'tc-tips-bubble-svg';
      svgImg.alt = '提示气泡';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tc-tips-bubble-close';
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', '关闭提示');
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        handleTipsBubbleDismiss();
      };

      container.appendChild(svgImg);
      container.appendChild(closeBtn);

      // 点击气泡本身也可以关闭
      container.onclick = () => {
        handleTipsBubbleDismiss();
      };

      shadow.appendChild(style);
      shadow.appendChild(container);
      document.documentElement.appendChild(root);
      window.__TAB_CLEANER_TIPS_BUBBLE_ROOT = root;

      // 自动关闭（5秒后）
      setTimeout(() => {
        if (window.__TAB_CLEANER_TIPS_BUBBLE_ROOT) {
          handleTipsBubbleDismiss();
        }
      }, 5000);
    });
  } catch (e) {
    console.error('[Tab Cleaner Content] injectTipsBubble failed:', e);
  }
}

function handleTipsBubbleDismiss() {
  try {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        showTipsBubble: false,
        tipsBubbleDismissed: true,
      });
    }
  } catch (e) {
    console.warn('[Tab Cleaner Content] Failed to persist tips bubble state:', e);
  }
  if (window.__TAB_CLEANER_TIPS_BUBBLE_ROOT) {
    const root = window.__TAB_CLEANER_TIPS_BUBBLE_ROOT;
    root.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    root.style.opacity = '0';
    root.style.transform = 'translateY(-10px) scale(0.95)';
    setTimeout(() => {
      root.remove();
      window.__TAB_CLEANER_TIPS_BUBBLE_ROOT = null;
    }, 300);
  }
}
