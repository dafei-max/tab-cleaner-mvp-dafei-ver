// background.js
// 监听插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    // 先检查标签页是否可以注入脚本
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.log('Cannot inject script into chrome:// or extension pages');
      return;
    }
    
    // 先尝试发送消息检查 content script 是否已存在
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
    } catch (error) {
      // 如果 content script 不存在，则注入它
      console.log('Injecting content script...');
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        
        // 等待一下让 content script 初始化
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "show" });
        }, 100);
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
      }
    }
  });