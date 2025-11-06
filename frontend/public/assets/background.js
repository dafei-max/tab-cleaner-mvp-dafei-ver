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
      files: ["assets/content.js"],
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

// ✅ 处理来自 content script 的 "toggle-pet" 消息
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "toggle-pet") {
    console.log("[Tab Cleaner Background] Received toggle-pet request from tab:", sender.tab?.id);
    
    if (!sender.tab || !sender.tab.id) {
      console.error("[Tab Cleaner Background] No tab ID available");
      sendResponse({ ok: false, error: "No tab ID" });
      return true;
    }

    const tabId = sender.tab.id;
    
    // 获取当前扩展的 ID（在 background script 中可用）
    const extensionId = chrome.runtime.id;
    console.log("[Tab Cleaner Background] Extension ID:", extensionId);

    // 步骤 1: 先设置扩展 ID 和事件监听器（在页面上下文中）
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (extensionId) => {
        // 直接使用从 background script 传入的扩展 ID
        window.__TAB_CLEANER_EXTENSION_ID = extensionId;
        console.log("[Tab Cleaner Pet] Extension ID set from background:", window.__TAB_CLEANER_EXTENSION_ID);
        
        // 如果还是没有，尝试从脚本 URL 推断（备用）
        if (!window.__TAB_CLEANER_EXTENSION_ID) {
          const scripts = document.querySelectorAll('script[src*="pet.js"]');
          if (scripts.length > 0) {
            const scriptSrc = scripts[scripts.length - 1].src || '';
            const match = scriptSrc.match(/chrome-extension:\/\/([^/]+)/);
            if (match) {
              window.__TAB_CLEANER_EXTENSION_ID = match[1];
              console.log("[Tab Cleaner Pet] Extension ID from script URL:", window.__TAB_CLEANER_EXTENSION_ID);
            }
          }
        }
        
        if (!window.__TAB_CLEANER_PET_LISTENER_SETUP) {
          window.addEventListener('__TAB_CLEANER_PET_LOADED', function(e) {
            if (window.__TAB_CLEANER_PET && window.__TAB_CLEANER_PET.toggle) {
              console.log("[Tab Cleaner Pet] Auto-toggle after load");
              window.__TAB_CLEANER_PET.toggle();
            }
          });
          window.__TAB_CLEANER_PET_LISTENER_SETUP = true;
          console.log("[Tab Cleaner Pet] Event listeners set up in page context");
        }
      },
      args: [chrome.runtime.id] // 传递扩展 ID 作为参数
    }).then(() => {
      // 步骤 2: 加载 pet.js（在页面上下文中）
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["assets/pet.js"]
      }).then(() => {
        console.log("[Tab Cleaner Background] Pet.js loaded, waiting for initialization...");
        
        // 步骤 3: 等待模块加载后调用 toggle
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              if (window.__TAB_CLEANER_PET && typeof window.__TAB_CLEANER_PET.toggle === 'function') {
                console.log("[Tab Cleaner Pet] Toggling pet in page context");
                window.__TAB_CLEANER_PET.toggle();
              } else {
                console.log("[Tab Cleaner Pet] Module not ready, waiting for load event...");
                // 监听加载完成事件
                const handleLoaded = (e) => {
                  if (window.__TAB_CLEANER_PET && window.__TAB_CLEANER_PET.toggle) {
                    console.log("[Tab Cleaner Pet] Module loaded, toggling...");
                    window.__TAB_CLEANER_PET.toggle();
                  }
                  window.removeEventListener('__TAB_CLEANER_PET_LOADED', handleLoaded);
                };
                window.addEventListener('__TAB_CLEANER_PET_LOADED', handleLoaded);
              }
            }
          }).then(() => {
            sendResponse({ ok: true, message: "Pet toggled" });
          }).catch(err => {
            console.error("[Tab Cleaner Background] Failed to trigger toggle:", err);
            sendResponse({ ok: false, error: err.message });
          });
        }, 200);
      }).catch(err => {
        console.error("[Tab Cleaner Background] Failed to load pet.js:", err);
        sendResponse({ ok: false, error: "Failed to load pet.js: " + err.message });
      });
    }).catch(err => {
      console.error("[Tab Cleaner Background] Failed to setup listener:", err);
      sendResponse({ ok: false, error: "Failed to setup listener: " + err.message });
    });

    // 返回 true 表示异步响应
    return true;
  }
  
  // 处理打开个人空间消息
  if (req.action === "open-personalspace") {
    console.log("[Tab Cleaner Background] Opening personal space...");
    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL("personalspace.html")
      }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error("[Tab Cleaner Background] Failed to create tab:", chrome.runtime.lastError);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, tabId: tab?.id });
        }
      });
    } catch (error) {
      console.error("[Tab Cleaner Background] Error opening personal space:", error);
      sendResponse({ ok: false, error: error.message });
    }
    return true; // 异步响应
  }

  // 处理 Clean Button：抓取所有 tab 的 OpenGraph
  if (req.action === "clean") {
    console.log("[Tab Cleaner Background] Clean button clicked, fetching OpenGraph for all tabs...");
    
    // 获取所有打开的 tabs
    chrome.tabs.query({}, async (tabs) => {
      try {
        // 过滤掉 chrome://, chrome-extension://, about: 等特殊页面
        const validTabs = tabs.filter(tab => {
          const url = tab.url || '';
          return !url.startsWith('chrome://') && 
                 !url.startsWith('chrome-extension://') && 
                 !url.startsWith('about:') &&
                 !url.startsWith('edge://');
        });

        console.log(`[Tab Cleaner Background] Found ${validTabs.length} valid tabs`);

        // 调用后端 API 抓取 OpenGraph
        let response;
        let opengraphData;
        
        // 创建超时控制器（兼容性更好的方式）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        try {
          response = await fetch('http://localhost:8000/api/v1/tabs/opengraph', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tabs: validTabs.map(tab => ({
                url: tab.url,
                title: tab.title,
                id: tab.id,
              }))
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId); // 请求成功，清除超时
        } catch (fetchError) {
          clearTimeout(timeoutId); // 确保清除超时
          
          // 处理网络错误（连接失败、超时等）
          if (fetchError.name === 'AbortError') {
            throw new Error('请求超时：后端服务器响应时间过长（超过30秒），请检查服务器状态');
          } else if (fetchError.message && (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError'))) {
            throw new Error('无法连接到后端服务器（http://localhost:8000）。请确保：\n1. 后端服务已启动\n2. 后端服务运行在 http://localhost:8000\n3. 没有防火墙阻止连接');
          } else {
            throw new Error(`网络请求失败：${fetchError.message || fetchError.toString()}`);
          }
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '未知错误');
          throw new Error(`HTTP 错误 (${response.status})：${errorText}`);
        }

        try {
          opengraphData = await response.json();
          console.log('[Tab Cleaner Background] OpenGraph data received:', opengraphData);
        } catch (jsonError) {
          throw new Error(`响应解析失败：${jsonError.message}`);
        }

        // 保存到 storage，供个人空间使用
        // 确保数据结构一致：{ok: true, data: [...]}
        await chrome.storage.local.set({ 
          opengraphData: {
            ok: opengraphData.ok || true,
            data: opengraphData.data || (Array.isArray(opengraphData) ? opengraphData : [])
          },
          lastCleanTime: Date.now()
        });

        // 关闭这些 tabs（添加错误处理，避免关闭已关闭的 tab）
        const tabIds = validTabs.map(tab => tab.id).filter(id => id !== undefined);
        if (tabIds.length > 0) {
          // 逐个关闭，避免一个失败导致全部失败
          for (const tabId of tabIds) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (error) {
              // Tab 可能已经被关闭，忽略错误
              console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed or invalid:`, error.message);
            }
          }
        }

        // 打开个人空间
        chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });

        sendResponse({ ok: true, data: opengraphData });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to fetch OpenGraph:', error);
        
        // 提供更详细的错误信息
        let errorMessage = error.message || '未知错误';
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          errorMessage = '无法连接到后端服务器。请确保：\n1. 后端服务已启动（运行在 http://localhost:8000）\n2. 后端服务正常运行\n3. 没有防火墙阻止连接';
        }
        
        // 即使失败，也尝试打开个人空间（使用之前保存的数据）
        try {
          chrome.tabs.create({
            url: chrome.runtime.getURL("personalspace.html")
          });
        } catch (tabError) {
          console.warn('[Tab Cleaner Background] Failed to open personal space:', tabError);
        }
        
        sendResponse({ 
          ok: false, 
          error: errorMessage,
          details: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        });
      }
    });

    return true; // 异步响应
  }
  
  // 处理其他消息类型
  return false;
});

