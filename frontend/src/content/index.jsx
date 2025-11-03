import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Card } from "../screens/Card";
import { startSession, addCurrentTab, shareSession } from "../shared/api";

// 加载 CSS 文件内容并转换资源路径
async function loadCSS(url) {
  try {
    const response = await fetch(chrome.runtime.getURL(url));
    let cssText = await response.text();
    
    // 替换 CSS 中的图片路径为 chrome.runtime.getURL 格式
    // 匹配 url(../static/img/xxx) 或 url(./static/img/xxx)
    cssText = cssText.replace(
      /url\(["']?(\.\.\/)?static\/img\/([^"')]+)["']?\)/g,
      (match, prefix, filename) => {
        const imageUrl = chrome.runtime.getURL(`static/img/${filename}`);
        return `url("${imageUrl}")`;
      }
    );
    
    return cssText;
  } catch (error) {
    console.error(`Failed to load CSS from ${url}:`, error);
    return "";
  }
}

// 创建 Shadow DOM 并渲染卡片
async function createCardOverlay() {
  // 如果已存在，先移除
  const existing = document.getElementById("tab-cleaner-card-overlay");
  if (existing) {
    existing.remove();
    return;
  }

  // 创建容器
  const container = document.createElement("div");
  container.id = "tab-cleaner-card-overlay";
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // 创建 Shadow DOM
  const shadowRoot = container.attachShadow({ mode: "open" });

  // 加载 CSS 文件
  const popupCSS = await loadCSS("assets/popup.css");
  const styleguideCSS = await loadCSS("assets/styleguide.css");

  // 注入样式到 Shadow DOM
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    @import url("https://cdnjs.cloudflare.com/ajax/libs/meyer-reset/2.0/reset.min.css");
    * {
      -webkit-font-smoothing: antialiased;
      box-sizing: border-box;
    }
    :host {
      display: block;
    }
    ${styleguideCSS}
    ${popupCSS}
  `;
  shadowRoot.appendChild(styleElement);

  // 创建 React 挂载点
  const reactContainer = document.createElement("div");
  reactContainer.id = "tab-cleaner-react-root";
  shadowRoot.appendChild(reactContainer);

  // 创建关闭按钮
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  closeButton.onmouseenter = () => closeButton.style.background = "rgba(0, 0, 0, 0.7)";
  closeButton.onmouseleave = () => closeButton.style.background = "rgba(0, 0, 0, 0.5)";
  closeButton.onclick = () => container.remove();
  shadowRoot.appendChild(closeButton);

  // 添加到页面
  document.body.appendChild(container);

  // 渲染 React 组件到 Shadow DOM
  const root = createRoot(reactContainer);
  
  const handleStart = async () => {
    try {
      const sessionId = await startSession();
      console.log("Session created:", sessionId);
    } catch (error) {
      console.error("Error:", error.message);
    }
  };

  const handleClean = async () => {
    try {
      await addCurrentTab();
      console.log("Added tab");
    } catch (error) {
      console.error("Error:", error.message);
    }
  };

  const handleDetails = async () => {
    try {
      const shareUrl = await shareSession();
      console.log("Share URL:", shareUrl);
    } catch (error) {
      console.error("Error:", error.message);
    }
  };

  root.render(
    <StrictMode>
      <Card
        onHomeClick={handleStart}
        onCleanClick={handleClean}
        onDetailsClick={handleDetails}
      />
    </StrictMode>
  );
}

// 立即注册消息监听器，确保在模块加载时就准备好
console.log("Tab Cleaner content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  
  if (message.action === "toggle") {
    createCardOverlay()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Error creating card overlay:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放，等待异步响应
  }
  return false;
});

console.log("Tab Cleaner content script message listener registered");