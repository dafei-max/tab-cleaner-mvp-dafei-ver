// assets/background.js
chrome.runtime.onInstalled.addListener(() => {
    console.log("Tab Cleaner installed");
  });
  
  chrome.action.onClicked.addListener(async (tab) => {
    const url = tab?.url ?? "";
    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      console.log("Cannot run on:", url);
      return;
    }
  
    // 先试通信（如果已经注入过会成功）
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
      return;
    } catch (_) {
      console.warn("No listener; injecting content script…");
    }
  
    // 兜底：注入 content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["assets/content.js"], // ← 确保这个文件存在且是“非模块版”
      });
      // 注入完成再显示
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: "show" }).catch(err => {
          console.error("sendMessage after inject failed:", err);
        });
      }, 150);
    } catch (err) {
      console.error("executeScript failed:", err);
    }
  });
  
  