// content.js
// 防止重复创建
let cardContainer = null;
let isVisible = false;

// 创建卡片容器和 Shadow DOM
function createCard() {
  // 如果已经存在，直接返回
  if (cardContainer) {
    return;
  }

  // 创建容器
  cardContainer = document.createElement('div');
  cardContainer.id = 'tab-cleaner-card-container';
  cardContainer.style.position = 'fixed';
  cardContainer.style.top = '20px';
  cardContainer.style.right = '20px';
  cardContainer.style.zIndex = '999999';
  cardContainer.style.width = '320px';
  cardContainer.style.height = '485px';
  
  // 创建 Shadow DOM
  const shadowRoot = cardContainer.attachShadow({ mode: 'open' });
  
  // 添加样式和 HTML 结构
  shadowRoot.innerHTML = `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
      }
      
      :host {
        all: initial;
        display: block;
      }
      
      .card {
        position: relative;
        width: 320px;
        height: 485px;
        background-image: url(${chrome.runtime.getURL('static/img/background-2.png')});
        background-size: 100% 100%;
        border-radius: 20px;
        box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        opacity: 0;
        transform: translateX(20px);
        transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
      }
      
      .card.visible {
        opacity: 1;
        transform: translateX(0);
      }
      
      .card .draggable {
        height: 2.31%;
        left: 39.76%;
        position: absolute;
        top: 4.63%;
        width: 18.28%;
        cursor: move;
      }
      
      .card .window-button {
        height: 268px;
        left: 32px;
        position: absolute;
        top: 49px;
        width: 268px;
      }
      
      .card .image {
        height: 100%;
        position: relative;
        width: 100%;
      }
      
      .card .window {
        height: 100%;
        left: 0;
        position: absolute;
        top: 0;
        width: 100%;
        background: transparent;
      }
      
      .card .group {
        align-items: flex-start;
        background-image: url(${chrome.runtime.getURL('static/img/vector-7.svg')});
        background-size: 100% 100%;
        display: flex;
        height: 100%;
        left: 0;
        min-width: 100%;
        opacity: 0.5;
        position: absolute;
        top: 0;
      }
      
      .card .group-wrapper {
        display: flex;
        height: 268px;
        width: 268px;
      }
      
      .card .group-2 {
        background-image: url(${chrome.runtime.getURL('static/img/vector-8.svg')});
        background-size: 100% 100%;
        flex: 1;
        mix-blend-mode: screen;
        opacity: 0.45;
        width: 268.24px;
      }
      
      .card .vector {
        height: 88.22%;
        left: 5.94%;
        position: absolute;
        top: 5.89%;
        width: 88.22%;
      }
      
      .card .clip-path-group {
        height: 88.22% !important;
        left: 5.89% !important;
        position: absolute !important;
        top: 5.89% !important;
        width: 88.22% !important;
      }
      
      .card .ellipse {
        border: 3px solid;
        border-color: #c5c5c5;
        border-radius: 135.5px;
        box-shadow: 0px 0px 10.4px 1px #00000040;
        height: 101.03%;
        left: calc(50% - 135px);
        position: absolute;
        top: 0;
        width: 271px;
      }
      
      .card .buttons {
        height: 100px;
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 240px;
      }
      
      .card .home-button {
        height: 99px;
        left: 160px;
        position: absolute;
        top: 19px;
        width: 88px;
        cursor: pointer;
        transition: transform 0.2s;
      }
      
      .card .home-button:hover {
        transform: scale(1.05);
      }
      
      .card .clean-button {
        height: 135px;
        left: calc(50% - 49px);
        position: absolute;
        top: 0;
        width: 96px;
        cursor: pointer;
        transition: transform 0.2s;
      }
      
      .card .clean-button:hover {
        transform: scale(1.05);
      }
      
      .card .details-button {
        height: 99px;
        left: -10px;
        position: absolute;
        top: 18px;
        width: 88px;
        cursor: pointer;
        transition: transform 0.2s;
      }
      
      .card .details-button:hover {
        transform: scale(1.05);
      }
      
      /* 关闭按钮样式 */
      .close-button {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 30px;
        height: 30px;
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: #666;
        transition: all 0.2s;
        z-index: 10;
      }
      
      .close-button:hover {
        background: rgba(255, 255, 255, 1);
        color: #333;
        transform: scale(1.1);
      }
    </style>
    
    <div class="card" id="card">
      <button class="close-button" id="closeBtn">×</button>
      
      <img class="draggable" alt="Draggable" src="${chrome.runtime.getURL('static/img/draggable-2.svg')}" />
      
      <div class="window-button">
        <div class="image">
          <div class="window">
            <div class="group">
              <div class="group-wrapper">
                <div class="group-2"></div>
              </div>
            </div>
            
            <img class="vector" alt="Vector" src="${chrome.runtime.getURL('static/img/vector-6.svg')}" />
            
            <!-- ClipPathGroup2 组件需要转换为 SVG 或图片 -->
            <div class="clip-path-group"></div>
          </div>
          
          <div class="ellipse"></div>
        </div>
      </div>
      
      <div class="buttons">
        <img
          class="home-button"
          alt="Home button"
          src="${chrome.runtime.getURL('static/img/home-button-2.png')}"
          id="homeBtn"
        />
        
        <img
          class="clean-button"
          alt="Clean button"
          src="${chrome.runtime.getURL('static/img/clean-button.png')}"
          id="cleanBtn"
        />
        
        <img
          class="details-button"
          alt="Details button"
          src="${chrome.runtime.getURL('static/img/details-button.svg')}"
          id="detailsBtn"
        />
      </div>
    </div>
  `;
  
  // 添加事件监听器
  const card = shadowRoot.getElementById('card');
  const closeBtn = shadowRoot.getElementById('closeBtn');
  const homeBtn = shadowRoot.getElementById('homeBtn');
  const cleanBtn = shadowRoot.getElementById('cleanBtn');
  const detailsBtn = shadowRoot.getElementById('detailsBtn');
  
  // 关闭按钮
  closeBtn.addEventListener('click', hideCard);
  
  // 功能按钮
  homeBtn.addEventListener('click', () => {
    console.log('Home button clicked');
    // 实现主页功能
    chrome.runtime.sendMessage({ action: 'home' });
  });
  
  cleanBtn.addEventListener('click', () => {
    console.log('Clean button clicked');
    // 实现清理功能
    chrome.runtime.sendMessage({ action: 'clean' });
  });
  
  detailsBtn.addEventListener('click', () => {
    console.log('Details button clicked');
    // 实现详情功能
    chrome.runtime.sendMessage({ action: 'details' });
  });
  
  // 点击卡片外部关闭（可选）
  document.addEventListener('click', (e) => {
    if (isVisible && !cardContainer.contains(e.target)) {
      // 如果需要点击外部关闭，取消注释下一行
      // hideCard();
    }
  });
  
  // ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible) {
      hideCard();
    }
  });
  
  // 将容器添加到页面
  document.body.appendChild(cardContainer);
  
  // 触发显示动画
  setTimeout(() => {
    card.classList.add('visible');
  }, 10);
}

// 显示卡片
function showCard() {
  if (!cardContainer) {
    createCard();
  }
  
  const shadowRoot = cardContainer.shadowRoot;
  const card = shadowRoot.getElementById('card');
  
  cardContainer.style.display = 'block';
  setTimeout(() => {
    card.classList.add('visible');
  }, 10);
  
  isVisible = true;
}

// 隐藏卡片
function hideCard() {
  if (!cardContainer) return;
  
  const shadowRoot = cardContainer.shadowRoot;
  const card = shadowRoot.getElementById('card');
  
  card.classList.remove('visible');
  
  setTimeout(() => {
    cardContainer.style.display = 'none';
  }, 300);
  
  isVisible = false;
}

// 切换显示/隐藏
function toggleCard() {
  if (isVisible) {
    hideCard();
  } else {
    showCard();
  }
}

// 监听来自 background script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle') {
    toggleCard();
    sendResponse({ status: 'ok' });
  } else if (request.action === 'show') {
    showCard();
    sendResponse({ status: 'ok' });
  } else if (request.action === 'hide') {
    hideCard();
    sendResponse({ status: 'ok' });
  }
  return true;
});

// 初始化时不自动显示，等待用户点击
console.log('Tab Cleaner content script loaded');