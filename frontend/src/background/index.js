// Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("Tab Cleaner installed");
});

// 监听扩展图标点击：仅发送消息，依赖 manifest 自动注入 module content script
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab?.url ?? "";

  // 跳过不可注入页面
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
    console.log("Cannot run on:", url);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
    console.log("Sent toggle to tab", tab.id);
  } catch (e) {
    // 对扩展安装前已打开的标签，content_scripts 需刷新后才会注入
    console.warn("Content script not ready; refresh this tab then click again.");
  }
});