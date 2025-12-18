// pet_ui.js - UI 渲染模块
(() => {
  'use strict';

  const DEFAULT_PET_ID = 'elephant';
  const PET_IMAGE_MAP = {
    turtle: 'static/img/turtle.svg',
    elephant: 'static/img/elephant.svg',
    squirrel: 'static/img/squrrial.svg',
  };

  // 按钮组配置
  const BUTTON_GROUP_CONFIG = {
    overlayRight: 80,
    overlayTop: 60,
    buttonWidth: 88/2,
    buttonHeight: 74/2,
    buttonGap: 8,
    tooltipOffset: 6,
    tooltipPaddingX: 8,
    tooltipPaddingY: 3,
    tooltipFontSize: 10,
    hoverTranslateX: -2,
    hoverScale: 1.02,
  };

  /**
   * 加载宠物 CSS
   */
  function loadPetCss(assetFn, currentPetId = DEFAULT_PET_ID) {
    const getPetAsset = (petId) => {
      return PET_IMAGE_MAP[petId] || PET_IMAGE_MAP[DEFAULT_PET_ID];
    };

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
          background-image: url("${assetFn(getPetAsset(currentPetId))}");
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
          content: none;
        }

        .desktop-pet-main .avatar:hover,
        .desktop-pet-main .avatar-video:hover {
          transform: translateY(-2px) scale(1.01);
          box-shadow: none;
        }

        .desktop-pet-main .avatar:hover::after {
          opacity: 0;
        }

        .desktop-pet-main .avatar-video:hover::after {
          opacity: 0.9;
        }

        /* 🎯 聊天气泡样式（基于 Figma 设计，已缩小并调整位置） */
        .desktop-pet-main .chat-bubble {
          position: absolute;
          left: 180px;  /* 往左移 135px (从 315px 开始) */
          top: -20px;   /* 往上移 20px */
          width: 214px;  /* 缩小到 65% (329 * 0.65) */
          height: 146px; /* 缩小到 65% (225 * 0.65) */
          display: none;
          opacity: 0;
          transform: translateY(6px) scale(0.585); /* scale 从 0.9 缩小到 0.585 (0.9 * 0.65) */
          pointer-events: auto; /* 允许点击关闭 */
          z-index: 10;
          cursor: pointer; /* 显示可点击光标 */
        }

        .desktop-pet-main .chat-bubble.visible {
          display: block;
        }

        .desktop-pet-main .chatbubble-bg {
          position: absolute;
          left: 0;
          top: 0;
          width: 214px;  /* 缩小到 65% */
          height: 146px; /* 缩小到 65% */
          opacity: 0.9;
        }

        .desktop-pet-main .chat-bubble-vector {
          position: absolute;
          left: 95.55px;  /* 缩小到 65% (147 * 0.65) */
          top: 15.6px;    /* 缩小到 65% (24 * 0.65) */
          width: 18.81px; /* 缩小到 65% (28.94 * 0.65) */
          height: 18.79px; /* 缩小到 65% (28.9 * 0.65) */
          stroke: #231815;
          stroke-width: 0.99px;
        }

        .desktop-pet-main .chat-bubble-text {
          position: absolute;
          left: 37.7px;   /* 缩小到 65% (58 * 0.65) */
          top: 26.65px;    /* 缩小到 65% (41 * 0.65) */
          width: 146.9px; /* 缩小到 65% (226 * 0.65) */
          height: 86.45px; /* 缩小到 65% (133 * 0.65) */
          font-family: 'FZLanTingYuanS-R-GB', '方正兰亭', 'Microsoft YaHei', '微软雅黑', sans-serif;
          font-weight: 400;
          font-size: 11.7px; /* 缩小到 65% (18 * 0.65) */
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
          30% { transform: scaleY(0.85) scaleX(1.15); }
          50% { transform: scaleY(1.1) scaleX(0.9); }
          70% { transform: scaleY(0.95) scaleX(1.05); }
          100% { transform: scaleY(1) scaleX(1); }
        }

        #tab-cleaner-pet-container.landed {
          animation: squish 0.4s ease-out;
          transform-origin: bottom center;
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
          border: 2px solid rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.2);
          pointer-events: none;
          z-index: 2147483647;
          animation: ripple 0.6s ease-out;
          transform-origin: center;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
        }
      </style>
    `;
  }

  /**
   * 生成宠物 HTML
   */
  function generatePetHTML(assetFn, currentPetId = DEFAULT_PET_ID) {
    const isElephant = currentPetId === 'elephant';
    const avatarContent = isElephant 
      ? `<video class="avatar-video" autoplay loop muted playsinline>
           <source src="${assetFn('static/video/idle-elephant.webm')}" type="video/webm">
         </video>`
      : `<div class="avatar"></div>`;
    
    return `
      <div class="desktop-pet-main">
        <div class="pet-main">
          ${avatarContent}
          <div class="chat-bubble">
            <img class="chatbubble-bg" alt="Chatbubble bg" src="${assetFn('static/img/chatbubble/text-bubble-bg.svg')}" />
            <img class="chat-bubble-vector" alt="Vector" src="${assetFn('static/img/chatbubble/text-bubble-vector.svg')}" />
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
            <img class="icon" alt="Clean current tab" src="${assetFn('static/img/clean-one-tab.svg')}" />
            <span class="label">清理当前页</span>
            <span class="tooltip">清理当前页 Tab</span>
          </button>
          <button class="action-button" data-action="clean-all">
            <img class="icon" alt="Clean all tabs" src="${assetFn('static/img/clean-all-tab.svg')}" />
            <span class="label">清理所有页</span>
            <span class="tooltip">一键清理全部 Tab</span>
          </button>
          <button class="action-button" data-action="pet-setting">
            <img class="icon" alt="Pet settings" src="${assetFn('static/img/pet-setting.svg')}" />
            <span class="label">宠物设置</span>
            <span class="tooltip">打开宠物设置</span>
          </button>
        </div>
      </div>
    `;
  }

  // 导出 API
  window.TabCleanerPetUI = {
    loadPetCss,
    generatePetHTML,
    BUTTON_GROUP_CONFIG,
    DEFAULT_PET_ID,
    PET_IMAGE_MAP,
  };
})();

