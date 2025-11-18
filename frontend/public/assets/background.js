// assets/background.js

// 导入 API 配置
importScripts('api_config.js');

/**
 * 判断 URL 是否为文档类网页（应使用截图）
 */
function isDocLikeUrl(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  const docKeywords = [
    "github.com", "gitlab.com", "readthedocs.io", "stackoverflow.com", "stackexchange.com",
    "/docs/", "developer.", "dev.", "documentation", "wiki",
    "notion.so", "notion.site", "feishu.cn", "feishuapp.com", "larkoffice.com",
    "docs.google.com", "docs.googleusercontent.com", "confluence", "jira", "atlassian.net",
    "docs.xiaohongshu.com", "xiaohongshu.com/doc/", "mp.weixin.qq.com",
    "zhihu.com", "juejin.cn", "segmentfault.com", "csdn.net",
    "medium.com", "dev.to", "hashnode.com", "reddit.com/r/",
  ];
  return docKeywords.some(keyword => urlLower.includes(keyword));
}

/**
 * 捕获标签页截图（使用 Chrome Extension API）
 * @param {number} tabId - 标签页 ID
 * @param {number} windowId - 窗口 ID（可选，如果不提供则使用当前窗口）
 * @returns {Promise<string>} 截图的 data URL
 */
async function captureTabScreenshot(tabId, windowId) {
  try {
    // 如果提供了 windowId，使用它；否则获取 tab 所在的窗口
    let targetWindowId = windowId;
    if (!targetWindowId) {
      const tab = await chrome.tabs.get(tabId);
      targetWindowId = tab.windowId;
    }
    
    // 切换到该标签页（确保可见）
    await chrome.tabs.update(tabId, { active: true });
    // 等待标签页激活
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 使用 chrome.tabs.captureVisibleTab 截图
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        targetWindowId,
        { format: 'jpeg', quality: 85 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });
  } catch (error) {
    console.error(`[Tab Screenshot] Failed to capture tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * 压缩截图（在 service worker 中使用 OffscreenCanvas）
 * 注意：Service Worker 中没有 DOM API，但可以使用 OffscreenCanvas（Chrome 69+）
 * 如果 OffscreenCanvas 不可用，则返回原始 data URL
 * @param {string} dataUrl - 原始截图的 data URL
 * @param {number} maxWidth - 最大宽度（像素）
 * @param {number} quality - JPEG 质量（0-1）
 * @returns {Promise<string>} 压缩后的 data URL
 */
async function compressScreenshot(dataUrl, maxWidth = 320, quality = 0.6) {
  // Service Worker 中没有 DOM API，压缩功能暂时跳过
  // 可以在前端页面中压缩，或者使用 OffscreenCanvas（需要 Chrome 69+）
  // 为了简化，这里先返回原始 data URL
  // TODO: 实现 OffscreenCanvas 压缩或在前端页面压缩
  console.log(`[Tab Screenshot] Compression skipped in service worker, using original screenshot`);
  return dataUrl;
  
  // 如果将来需要压缩，可以使用以下代码（需要确保浏览器支持 OffscreenCanvas）：
  /*
  try {
    // 将 data URL 转换为 Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    // 计算新尺寸
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    
    // 使用 OffscreenCanvas 压缩
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    const compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality });
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(compressedBlob);
  } catch (error) {
    console.warn('[Tab Screenshot] Compression failed, using original:', error);
    resolve(dataUrl);
  }
  */
}

/**
 * 保存截图到后端
 * @param {string} url - 页面 URL
 * @param {string} screenshotDataUrl - 截图的 data URL
 * @param {string} apiBaseUrl - API 基础 URL
 */
async function saveScreenshotToBackend(url, screenshotDataUrl, apiBaseUrl) {
  try {
    const screenshotUrl = `${apiBaseUrl}/api/v1/tabs/screenshot`;
    const response = await fetch(screenshotUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        screenshot: screenshotDataUrl,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    console.log(`[Tab Screenshot] ✓ Screenshot saved to backend for ${url.substring(0, 60)}...`);
  } catch (error) {
    console.error(`[Tab Screenshot] Failed to save screenshot to backend:`, error);
    throw error;
  }
}

/**
 * 截图队列管理器
 * 限速：每秒最多 1 次截图（1000ms 间隔）
 */
class ScreenshotQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.rateLimitMs = 1000; // 每秒1次 = 1000ms 间隔
    this.lastScreenshotTime = 0;
  }

  /**
   * 添加截图任务到队列
   * @param {Object} task - 截图任务
   * @param {Object} task.item - OpenGraph item
   * @param {Object} task.tab - 对应的 tab 对象
   * @param {string} task.apiUrl - API URL
   */
  enqueue(task) {
    this.queue.push(task);
    console.log(`[Screenshot Queue] Task enqueued: ${task.item.url.substring(0, 60)}... (Queue size: ${this.queue.length})`);
    
    // 如果队列未在处理，开始处理
    if (!this.isProcessing) {
      this.process();
    }
  }

  /**
   * 处理队列中的截图任务
   */
  async process() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log(`[Screenshot Queue] Starting queue processing (${this.queue.length} tasks)`);

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      
      try {
        // 限速：确保距离上次截图至少间隔 rateLimitMs
        const timeSinceLastScreenshot = Date.now() - this.lastScreenshotTime;
        if (timeSinceLastScreenshot < this.rateLimitMs) {
          const waitTime = this.rateLimitMs - timeSinceLastScreenshot;
          console.log(`[Screenshot Queue] Rate limiting: waiting ${waitTime}ms before next screenshot`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // 检查 tab 是否仍然存在
        let tab;
        try {
          tab = await chrome.tabs.get(task.tab.id);
        } catch (tabError) {
          console.warn(`[Screenshot Queue] Tab ${task.tab.id} no longer exists, skipping screenshot`);
          task.item.needs_screenshot = false;
          continue;
        }

        // 执行截图
        console.log(`[Screenshot Queue] Processing screenshot for ${task.item.url.substring(0, 60)}...`);
        this.lastScreenshotTime = Date.now();

        // 截图（设置超时，避免长时间阻塞）
        const screenshotPromise = captureTabScreenshot(tab.id, tab.windowId);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Screenshot timeout')), 5000)
        );
        
        const screenshotDataUrl = await Promise.race([screenshotPromise, timeoutPromise]);
        
        if (screenshotDataUrl) {
          // 压缩截图（320px 宽度，质量 60）
          const compressedScreenshot = await compressScreenshot(screenshotDataUrl, 320, 0.6);
          
          // 更新 item 的 screenshot_image 字段
          task.item.screenshot_image = compressedScreenshot;
          task.item.needs_screenshot = false;
          
          console.log(`[Screenshot Queue] ✓ Screenshot captured for ${task.item.url.substring(0, 60)}...`);
          
          // 发送截图到后端存储（可选，也可以只存在前端）
          try {
            await saveScreenshotToBackend(task.item.url, compressedScreenshot, task.apiUrl);
          } catch (saveError) {
            console.warn(`[Screenshot Queue] Failed to save screenshot to backend: ${saveError.message}`);
            // 即使保存失败，也继续使用前端的 screenshot_image
          }
        }
      } catch (screenshotError) {
        console.error(`[Screenshot Queue] Failed to capture screenshot for ${task.item.url}:`, screenshotError);
        // 截图失败，保持 needs_screenshot=false，前端会使用 doc card fallback
        task.item.needs_screenshot = false;
      }
    }

    this.isProcessing = false;
    console.log(`[Screenshot Queue] Queue processing completed`);
  }

  /**
   * 获取队列长度
   */
  getLength() {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
    this.isProcessing = false;
  }
}

// 创建全局截图队列实例
const screenshotQueue = new ScreenshotQueue();

/**
 * 为文档类标签页截图（在关闭之前）
 */
async function captureDocTabScreenshots(tabs) {
  const screenshotResults = [];
  
  // 获取当前窗口
  const currentWindow = await chrome.windows.getCurrent();
  
  for (const tab of tabs) {
    // 只对文档类 URL 截图
    if (!isDocLikeUrl(tab.url)) {
      continue;
    }
    
    try {
      console.log(`[Tab Screenshot] Capturing screenshot for: ${tab.url}`);
      
      // 切换到该标签页
      await chrome.tabs.update(tab.id, { active: true });
      
      // 等待标签页激活
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 使用 content script 准备页面（滚动到顶部，等待加载）
      // 这样可以确保从页面开头截图，并且内容已完全加载
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // 滚动到页面顶部，确保从开头截图
            window.scrollTo(0, 0);
            
            // 等待页面加载完成
            return new Promise((resolve) => {
              if (document.readyState === 'complete') {
                // 页面已加载完成，再等待一下确保动态内容加载（特别是文档类页面）
                setTimeout(resolve, 1500);
              } else {
                // 等待页面加载完成
                window.addEventListener('load', () => {
                  setTimeout(resolve, 1500);
                }, { once: true });
              }
            });
          }
        });
      } catch (scriptError) {
        // 如果注入脚本失败（可能是特殊页面，如 chrome://），继续尝试截图
        console.warn(`[Tab Screenshot] Failed to inject script for tab ${tab.id}, continuing anyway:`, scriptError);
        // 等待固定时间
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 截图（captureVisibleTab 截取当前活动标签页的可见区域）
      // 注意：只能捕获可见区域，不能自动滚动捕获全页
      // 对于我们的用例（文档类网站可视化），首屏截图已经足够
      const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, {
        format: 'jpeg',
        quality: 85,
      });
      
      screenshotResults.push({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        screenshot: dataUrl, // 完整的 data:image/jpeg;base64,xxx 格式
        isScreenshot: true,
      });
      
      console.log(`[Tab Screenshot] Successfully captured screenshot for tab ${tab.id}`);
    } catch (error) {
      console.error(`[Tab Screenshot] Failed to capture tab ${tab.id}:`, error);
      screenshotResults.push({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        screenshot: null,
        isScreenshot: false,
        error: error.message,
      });
    }
    
    // 每个标签页之间稍作延迟
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  return screenshotResults;
}

/**
 * 将截图数据合并到 OpenGraph 数据中
 * 前端截图优先（更可靠），后端数据作为补充
 */
function mergeScreenshotsIntoOpenGraph(opengraphItems, screenshotResults) {
  // 创建截图映射（按 URL 匹配）
  const screenshotMap = new Map();
  screenshotResults.forEach(result => {
    if (result.screenshot && result.url) {
      screenshotMap.set(result.url, result.screenshot);
    }
  });
  
  // 合并数据
  return opengraphItems.map(item => {
    const url = item.url;
    const frontendScreenshot = screenshotMap.get(url);
    
    if (frontendScreenshot) {
      // 前端截图优先（更可靠，绕过安全拦截）
      return {
        ...item,
        image: frontendScreenshot, // 完整的 data:image/jpeg;base64,xxx 格式
        is_screenshot: true,
        is_doc_card: false, // 前端截图成功，不再是文档卡片
        pending_screenshot: false, // 截图完成
      };
    }
    
    // 如果没有前端截图，使用后端数据
    // 对于文档类网页，后端会生成文档卡片（包含标题+类型）作为视觉锚点
    // 如果后端截图完成，会替换文档卡片；如果失败，保持文档卡片
    return item;
  });
}

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
        // 增加延迟，确保 pet.js 完全加载并初始化
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              // 检查模块是否已加载
              if (window.__TAB_CLEANER_PET && typeof window.__TAB_CLEANER_PET.toggle === 'function') {
                console.log("[Tab Cleaner Pet] Module ready, toggling pet...");
                // 使用 setTimeout 确保在下一个事件循环中执行，避免与模块初始化冲突
                setTimeout(() => {
                  if (window.__TAB_CLEANER_PET && typeof window.__TAB_CLEANER_PET.toggle === 'function') {
                    window.__TAB_CLEANER_PET.toggle();
                  }
                }, 50);
              } else {
                console.log("[Tab Cleaner Pet] Module not ready, waiting for load event...");
                // 监听加载完成事件
                const handleLoaded = (e) => {
                  console.log("[Tab Cleaner Pet] Load event received, toggling...");
                  setTimeout(() => {
                    if (window.__TAB_CLEANER_PET && typeof window.__TAB_CLEANER_PET.toggle === 'function') {
                      window.__TAB_CLEANER_PET.toggle();
                    }
                  }, 50);
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
        }, 300); // 增加延迟到 300ms，确保模块完全初始化
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
      // 将 uniqueTabs 定义在外部，以便在 catch 块中也能访问
      let uniqueTabs = [];
      let originalTabIds = new Set();
      
      try {
        // 过滤掉 chrome://, chrome-extension://, about: 等特殊页面
        // 同时过滤掉 Chrome Web Store 等不需要收录的页面
        const validTabs = tabs.filter(tab => {
          const url = tab.url || '';
          const lowerUrl = url.toLowerCase();
          
          // 过滤特殊协议
          if (url.startsWith('chrome://') || 
              url.startsWith('chrome-extension://') || 
              url.startsWith('about:') ||
              url.startsWith('edge://')) {
            return false;
          }
          
          // 过滤 Chrome Web Store 等不需要收录的页面
          if (lowerUrl.includes('chrome.google.com/webstore') ||
              lowerUrl.includes('chrome.google.com/extensions') ||
              lowerUrl.includes('webstore.google.com')) {
            return false;
          }
          
          return true;
        });

        // 去重：相同 URL 只保留一个（保留第一个）
        const seenUrls = new Set();
        uniqueTabs = validTabs.filter(tab => {
          const url = tab.url || '';
          if (seenUrls.has(url)) {
            return false;
          }
          seenUrls.add(url);
          return true;
        });
        
        // 保存原始 tab IDs，用于后续关闭
        originalTabIds = new Set(uniqueTabs.map(tab => tab.id).filter(id => id !== undefined));

        console.log(`[Tab Cleaner Background] Found ${validTabs.length} valid tabs, ${uniqueTabs.length} unique tabs after deduplication`);

        // 调用后端 API 抓取所有 tabs 的 OpenGraph 数据
        const apiUrl = API_CONFIG.getBaseUrlSync();
        const opengraphUrl = `${apiUrl}/api/v1/tabs/opengraph`;
        
        // 创建超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        let response;
        let opengraphData;
        
        try {
          response = await fetch(opengraphUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tabs: uniqueTabs.map(tab => ({
                url: tab.url,
                title: tab.title,
                id: tab.id,
              })),
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            throw new Error('请求超时：后端服务器响应时间过长（超过30秒），请检查服务器状态');
          } else if (fetchError.message && (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError'))) {
            throw new Error(`无法连接到后端服务器（${apiUrl}）。请确保：\n1. 后端服务已启动\n2. 后端服务运行在 ${apiUrl}\n3. 没有防火墙阻止连接`);
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
          console.log('[Tab Cleaner Background] OpenGraph data received from backend:', opengraphData);
        } catch (jsonError) {
          throw new Error(`响应解析失败：${jsonError.message}`);
        }

        // 处理 OpenGraph 数据
        const opengraphItems = opengraphData.data || (Array.isArray(opengraphData) ? opengraphData : []);
        const mergedData = opengraphItems;
        console.log(`[Tab Cleaner Background] Processed ${mergedData.length} OpenGraph items`);

        // 步骤 1：确保 OpenGraph 数据已完全获取
        console.log(`[Tab Cleaner Background] ✓ OpenGraph data fetched: ${mergedData.length} items`);
        
        // 步骤 2：检查哪些 item 需要截图（needs_screenshot=true 且没有图片）
        // 逻辑：只有 OpenGraph 拿不到图的才截图
        // 注意：截图是可选功能，即使失败也不应该阻塞主流程
        const itemsNeedingScreenshot = mergedData.filter(item => {
          // 需要截图的条件：needs_screenshot=true 且 image 为空或无效
          const needsScreenshot = item.needs_screenshot === true;
          const hasNoImage = !item.image || item.image.trim() === '';
          const shouldScreenshot = needsScreenshot && hasNoImage;
          
          // 调试日志
          if (needsScreenshot) {
            console.log(`[Tab Cleaner Background] Item needs screenshot: ${item.url.substring(0, 60)}... (hasImage: ${!hasNoImage}, image: ${item.image ? item.image.substring(0, 50) : 'null'}...)`);
          }
          
          return shouldScreenshot;
        });
        
        // 步骤 3：将需要截图的 item 加入截图队列（限速 1/s，不阻塞主流程）
        if (itemsNeedingScreenshot.length > 0) {
          console.log(`[Tab Cleaner Background] Found ${itemsNeedingScreenshot.length} items needing screenshot, adding to queue (rate limit: 1/s)`);
          
          // 将截图任务加入队列（异步处理，不阻塞主流程）
          itemsNeedingScreenshot.forEach(item => {
            const tab = uniqueTabs.find(t => t.url === item.url);
            if (tab) {
              screenshotQueue.enqueue({
                item: item,
                tab: tab,
                apiUrl: apiUrl,
              });
            } else {
              console.warn(`[Tab Cleaner Background] Tab not found for URL: ${item.url}, skipping screenshot`);
              item.needs_screenshot = false;
            }
          });
          
          // 不等待截图完成，继续执行主流程（保存数据、关闭标签页、打开个人空间）
          // 截图会在后台队列中异步处理
          console.log(`[Tab Cleaner Background] Screenshot tasks queued, continuing with main flow...`);
        } else {
          console.log(`[Tab Cleaner Background] No items need screenshot`);
        }

        // 后端已经在 OpenGraph 解析时预取了 embedding，但可能还在异步处理中
        // 检查哪些 item 还没有 embedding，补充请求（作为兜底）
        console.log('[Tab Cleaner Background] Checking and supplementing embeddings for OpenGraph items...');
        const itemsWithEmbeddings = await Promise.all(mergedData.map(async (item, index) => {
          // 如果已经有 embedding，直接返回
          if (item.text_embedding && item.image_embedding) {
            console.log(`[Tab Cleaner Background] ✓ Embeddings already present for ${item.url.substring(0, 60)}...`);
            return item;
          }
          
          // 如果 item 成功但还没有 embedding，补充请求（后端可能还在异步处理）
          if (item.success && (!item.text_embedding || !item.image_embedding)) {
            // 避免频繁请求，添加小延迟
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 50)); // 50ms 延迟
            }
            
            try {
              const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
              const response = await fetch(embeddingUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  opengraph_items: [{
                    url: item.url,
                    title: item.title,
                    description: item.description,
                    image: item.image,
                    site_name: item.site_name,
                    is_screenshot: item.is_screenshot,
                    is_doc_card: item.is_doc_card,
                  }]
                }),
              });
              
              if (response.ok) {
                const embeddingData = await response.json();
                if (embeddingData.data && embeddingData.data.length > 0) {
                  const embeddingItem = embeddingData.data[0];
                  if (embeddingItem.text_embedding && embeddingItem.image_embedding) {
                    console.log(`[Tab Cleaner Background] ✓ Supplemented embeddings for ${item.url.substring(0, 60)}...`);
                    return {
                      ...item,
                      text_embedding: embeddingItem.text_embedding,
                      image_embedding: embeddingItem.image_embedding,
                    };
                  }
                }
              }
            } catch (error) {
              console.warn(`[Tab Cleaner Background] Failed to supplement embeddings for ${item.url.substring(0, 60)}... Error:`, error);
            }
          }
          return item; // 返回原始 item 或已有的 item
        }));
        console.log('[Tab Cleaner Background] Embedding check completed.');

        // 创建新 session
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 获取现有 sessions
        const storageResult = await chrome.storage.local.get(['sessions']);
        const existingSessions = storageResult.sessions || [];
        
        // 生成 session 名称（洗衣筐1, 洗衣筐2, ...）
        const existingNames = existingSessions.map(s => s.name);
        let counter = 1;
        let sessionName = `洗衣筐${counter}`;
        while (existingNames.includes(sessionName)) {
          counter++;
          sessionName = `洗衣筐${counter}`;
        }
        
        // 确保每个 item 都有 id（如果没有）
        const itemsWithIds = itemsWithEmbeddings.map((item, index) => {
          if (!item.id) {
            item.id = item.url || `og-${sessionId}-${index}`;
          }
          return item;
        });
        
        const newSession = {
          id: sessionId,
          name: sessionName,
          createdAt: Date.now(),
          opengraphData: itemsWithIds,
          tabCount: itemsWithIds.length,
        };
        
        // 新 session 添加到顶部（最新的在前）
        const updatedSessions = [newSession, ...existingSessions];
        
        // 保存到 storage
        // 同时保存 sessions 和 opengraphData（向后兼容）
        // 注意：如果存储配额超限，尝试清理旧数据
        try {
          await chrome.storage.local.set({ 
            sessions: updatedSessions,
            opengraphData: {
              ok: opengraphData.ok || true,
              data: itemsWithIds
            },
            lastCleanTime: Date.now(),
            currentSessionId: sessionId, // 设置当前 session
          });
        } catch (storageError) {
          // 如果存储配额超限，尝试清理旧数据
          if (storageError.message && storageError.message.includes('quota')) {
            console.warn('[Tab Cleaner Background] Storage quota exceeded, cleaning old sessions...');
            try {
              // 只保留最新的 10 个 sessions
              const limitedSessions = updatedSessions.slice(0, 10);
              await chrome.storage.local.set({ 
                sessions: limitedSessions,
                opengraphData: {
                  ok: opengraphData.ok || true,
                  data: itemsWithIds
                },
                lastCleanTime: Date.now(),
                currentSessionId: sessionId,
              });
              console.log(`[Tab Cleaner Background] ✓ Saved with limited sessions (${limitedSessions.length} sessions)`);
            } catch (retryError) {
              console.error('[Tab Cleaner Background] Failed to save even after cleanup:', retryError);
              throw retryError;
            }
          } else {
            throw storageError;
          }
        }

        console.log(`[Tab Cleaner Background] ✓ All OpenGraph data fetched and saved:`);
        console.log(`  - Session ID: ${sessionId}`);
        console.log(`  - Session Name: ${sessionName}`);
        console.log(`  - Items count: ${itemsWithIds.length}`);
        console.log(`  - Sessions total: ${updatedSessions.length}`);
        console.log(`  - Sample item:`, itemsWithIds[0] ? {
          id: itemsWithIds[0].id,
          url: itemsWithIds[0].url?.substring(0, 50),
          title: itemsWithIds[0].title?.substring(0, 30),
          hasImage: !!itemsWithIds[0].image,
          hasScreenshot: !!itemsWithIds[0].screenshot_image,
        } : 'No items');

        // 等待截图队列处理一段时间（最多等待 5 秒，确保关键截图完成）
        // 注意：截图队列是异步的，不会阻塞主流程，但给一些时间让截图开始
        if (itemsNeedingScreenshot.length > 0) {
          const maxWaitTime = Math.min(itemsNeedingScreenshot.length * 1000, 5000); // 最多等待 5 秒
          console.log(`[Tab Cleaner Background] Waiting up to ${maxWaitTime}ms for screenshot queue to start processing...`);
          await new Promise(resolve => setTimeout(resolve, Math.min(2000, maxWaitTime))); // 至少等待 2 秒让截图开始
          console.log(`[Tab Cleaner Background] Screenshot queue processing started, continuing with tab closure...`);
        }

        // 关闭所有标签页（OpenGraph 已获取完成，截图队列已开始处理）
        // 重要：重新获取当前所有标签页，因为截图过程中可能有些标签页已经被关闭
        // 只关闭那些在原始 uniqueTabs 列表中的标签页
        // 重新获取当前所有标签页
        const currentTabs = await chrome.tabs.query({});
        
        // 找出需要关闭的标签页（在原始列表中且仍然存在的）
        const tabsToClose = currentTabs.filter(tab => originalTabIds.has(tab.id));
        const allTabIds = tabsToClose.map(tab => tab.id);
        
        console.log(`[Tab Cleaner Background] Preparing to close ${allTabIds.length} tabs (from ${originalTabIds.size} original tabs)...`);
        if (allTabIds.length > 0) {
          console.log(`[Tab Cleaner Background] Closing ${allTabIds.length} tabs...`);
          // 逐个关闭，避免一个失败导致全部失败
          let closedCount = 0;
          for (const tabId of allTabIds) {
            try {
              await chrome.tabs.remove(tabId);
              closedCount++;
            } catch (error) {
              // Tab 可能已经被关闭，忽略错误
              console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed or invalid:`, error.message);
            }
          }
          console.log(`[Tab Cleaner Background] ✓ Closed ${closedCount}/${allTabIds.length} tabs`);
        } else {
          console.warn(`[Tab Cleaner Background] No tabs to close (allTabIds.length = 0, originalTabIds.size = ${originalTabIds.size})`);
        }

        // 最后打开个人空间展示结果
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        try {
          await chrome.tabs.create({
            url: chrome.runtime.getURL("personalspace.html")
          });
          console.log(`[Tab Cleaner Background] ✓ Personal space opened`);
        } catch (createError) {
          console.error(`[Tab Cleaner Background] ✗ Failed to open personal space:`, createError);
          // 即使打开失败，也继续执行
        }

        sendResponse({ ok: true, data: opengraphData });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to fetch OpenGraph:', error);
        
        // 提供更详细的错误信息
        let errorMessage = error.message || '未知错误';
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          const apiUrl = API_CONFIG.getBaseUrlSync();
          errorMessage = `无法连接到后端服务器。请确保：\n1. 后端服务已启动（运行在 ${apiUrl}）\n2. 后端服务正常运行\n3. 没有防火墙阻止连接`;
        }
        
        // 即使失败，也要尝试：
        // 1. 关闭标签页（使用保存的 originalTabIds）
        try {
          if (originalTabIds.size > 0) {
            // 重新获取当前所有标签页
            const currentTabs = await chrome.tabs.query({});
            const tabsToClose = currentTabs.filter(tab => originalTabIds.has(tab.id));
            const allTabIds = tabsToClose.map(tab => tab.id);
            
            if (allTabIds.length > 0) {
              console.log(`[Tab Cleaner Background] Closing ${allTabIds.length} tabs after error...`);
              for (const tabId of allTabIds) {
                try {
                  await chrome.tabs.remove(tabId);
                } catch (closeError) {
                  console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed:`, closeError.message);
                }
              }
            }
          } else {
            console.warn(`[Tab Cleaner Background] No originalTabIds to close after error`);
          }
        } catch (closeError) {
          console.error('[Tab Cleaner Background] Failed to close tabs:', closeError);
        }
        
        // 2. 打开个人空间（使用之前保存的数据）
        try {
          await chrome.tabs.create({
            url: chrome.runtime.getURL("personalspace.html")
          });
          console.log(`[Tab Cleaner Background] ✓ Personal space opened (after error)`);
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

  // 处理桌宠设置（跳转到个人空间）
  if (req.action === "pet-setting") {
    console.log("[Tab Cleaner Background] Pet setting clicked, opening personal space...");
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

  // 处理清理当前页 Tab（归档到上一个旧session）
  if (req.action === "clean-current-tab") {
    console.log("[Tab Cleaner Background] Clean current tab clicked...");
    
    if (!sender.tab || !sender.tab.id) {
      sendResponse({ ok: false, error: "No tab ID available" });
      return true;
    }

    const currentTab = sender.tab;
    
    // 获取当前 tab 的 OpenGraph 数据
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs[0];
        if (!tab || !tab.url) {
          sendResponse({ ok: false, error: "No active tab found" });
          return;
        }

        const url = tab.url;
        const title = tab.title;

        // 过滤掉特殊页面和 Chrome Web Store
        const lowerUrl = url.toLowerCase();
        if (url.startsWith('chrome://') || 
            url.startsWith('chrome-extension://') || 
            url.startsWith('about:') ||
            url.startsWith('edge://') ||
            lowerUrl.includes('chrome.google.com/webstore') ||
            lowerUrl.includes('chrome.google.com/extensions') ||
            lowerUrl.includes('webstore.google.com')) {
          sendResponse({ ok: false, error: "Cannot clean special pages" });
          return;
        }

        // 调用后端 API 获取 OpenGraph 数据
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // 获取 API 地址
        const apiUrl = API_CONFIG.getBaseUrlSync();
        const opengraphUrl = `${apiUrl}/api/v1/tabs/opengraph`;

        let response;
        try {
          response = await fetch(opengraphUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabs: [{ url, title, id: tab.id }]
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('[Tab Cleaner Background] Failed to fetch OpenGraph:', fetchError);
          sendResponse({ ok: false, error: fetchError.message });
          return;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '未知错误');
          sendResponse({ ok: false, error: `HTTP ${response.status}: ${errorText}` });
          return;
        }

        const opengraphData = await response.json();
        const items = opengraphData.data || (Array.isArray(opengraphData) ? opengraphData : []);
        
        if (items.length === 0) {
          sendResponse({ ok: false, error: "No OpenGraph data received" });
          return;
        }

        const item = items[0];

        // 获取现有 sessions
        const storageResult = await chrome.storage.local.get(['sessions']);
        const existingSessions = storageResult.sessions || [];

        if (existingSessions.length === 0) {
          // 如果没有 sessions，创建一个新的
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newSession = {
            id: sessionId,
            name: '洗衣筐1',
            createdAt: Date.now(),
            opengraphData: [item],
            tabCount: 1,
          };
          await chrome.storage.local.set({ 
            sessions: [newSession],
            currentSessionId: sessionId,
          });
        } else {
          // 归档到最新的 session（第一个，因为按时间倒序）
          const latestSession = existingSessions[0];
          const updatedData = [...(latestSession.opengraphData || []), item];
          const updatedSession = {
            ...latestSession,
            opengraphData: updatedData,
            tabCount: updatedData.length,
          };
          
          const updatedSessions = [updatedSession, ...existingSessions.slice(1)];
          await chrome.storage.local.set({ sessions: updatedSessions });
        }

        // 关闭当前 tab
        try {
          await chrome.tabs.remove(currentTab.id);
        } catch (error) {
          console.warn('[Tab Cleaner Background] Failed to close tab:', error);
        }

        sendResponse({ ok: true, message: "Current tab cleaned and archived" });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to clean current tab:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });

    return true; // 异步响应
  }

  // 处理一键清理（创建新session并清理所有tab）
  if (req.action === "clean-all") {
    // 复用 "clean" 的逻辑（已经会创建新 session）
    console.log("[Tab Cleaner Background] Clean all (from pet) clicked, fetching OpenGraph for all tabs...");
    
    // 获取所有打开的 tabs
    chrome.tabs.query({}, async (tabs) => {
      try {
        // 过滤掉 chrome://, chrome-extension://, about: 等特殊页面
        // 同时过滤掉 Chrome Web Store 等不需要收录的页面
        const validTabs = tabs.filter(tab => {
          const url = tab.url || '';
          const lowerUrl = url.toLowerCase();
          
          // 过滤特殊协议
          if (url.startsWith('chrome://') || 
              url.startsWith('chrome-extension://') || 
              url.startsWith('about:') ||
              url.startsWith('edge://')) {
            return false;
          }
          
          // 过滤 Chrome Web Store 等不需要收录的页面
          if (lowerUrl.includes('chrome.google.com/webstore') ||
              lowerUrl.includes('chrome.google.com/extensions') ||
              lowerUrl.includes('webstore.google.com')) {
            return false;
          }
          
          return true;
        });

        // 去重：相同 URL 只保留一个（保留第一个）
        const seenUrls = new Set();
        const uniqueTabs = validTabs.filter(tab => {
          const url = tab.url || '';
          if (seenUrls.has(url)) {
            return false;
          }
          seenUrls.add(url);
          return true;
        });

        console.log(`[Tab Cleaner Background] Found ${validTabs.length} valid tabs, ${uniqueTabs.length} unique tabs after deduplication`);

        // 调用后端 API 抓取 OpenGraph
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        // 获取 API 地址
        const apiUrl = API_CONFIG.getBaseUrlSync();
        const opengraphUrl = `${apiUrl}/api/v1/tabs/opengraph`;
        
        let response;
        try {
          response = await fetch(opengraphUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabs: uniqueTabs.map(tab => ({
                url: tab.url,
                title: tab.title,
                id: tab.id,
              }))
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '未知错误');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const opengraphData = await response.json();
        const opengraphItems = opengraphData.data || (Array.isArray(opengraphData) ? opengraphData : []);

        // 补充 embedding（如果需要）
        const itemsWithEmbeddings = await Promise.all(opengraphItems.map(async (item, index) => {
          if (item.text_embedding && item.image_embedding) {
            return item;
          }
          if (item.success && (!item.text_embedding || !item.image_embedding)) {
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            try {
              const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
              const embedResponse = await fetch(embeddingUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  opengraph_items: [{
                    url: item.url,
                    title: item.title,
                    description: item.description,
                    image: item.image,
                    site_name: item.site_name,
                    is_screenshot: item.is_screenshot,
                    is_doc_card: item.is_doc_card,
                  }]
                }),
              });
              if (embedResponse.ok) {
                const embedData = await embedResponse.json();
                if (embedData.data && embedData.data.length > 0) {
                  const embedItem = embedData.data[0];
                  if (embedItem.text_embedding && embedItem.image_embedding) {
                    return {
                      ...item,
                      text_embedding: embedItem.text_embedding,
                      image_embedding: embedItem.image_embedding,
                    };
                  }
                }
              }
            } catch (error) {
              console.warn(`[Tab Cleaner Background] Failed to supplement embeddings:`, error);
            }
          }
          return item;
        }));

        // 创建新 session
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const storageResult = await chrome.storage.local.get(['sessions']);
        const existingSessions = storageResult.sessions || [];
        
        const existingNames = existingSessions.map(s => s.name);
        let counter = 1;
        let sessionName = `洗衣筐${counter}`;
        while (existingNames.includes(sessionName)) {
          counter++;
          sessionName = `洗衣筐${counter}`;
        }
        
        const newSession = {
          id: sessionId,
          name: sessionName,
          createdAt: Date.now(),
          opengraphData: itemsWithEmbeddings,
          tabCount: itemsWithEmbeddings.length,
        };
        
        const updatedSessions = [newSession, ...existingSessions];
        
        await chrome.storage.local.set({ 
          sessions: updatedSessions,
          opengraphData: {
            ok: opengraphData.ok || true,
            data: itemsWithEmbeddings
          },
          lastCleanTime: Date.now(),
          currentSessionId: sessionId,
        });

        console.log(`[Tab Cleaner Background] ✓ All OpenGraph data fetched and saved (${itemsWithEmbeddings.length} items)`);

        // 关闭所有标签页（OpenGraph 已获取完成，可以关闭了）
        const allTabIds = uniqueTabs.map(tab => tab.id).filter(id => id !== undefined);
        if (allTabIds.length > 0) {
          console.log(`[Tab Cleaner Background] Closing ${allTabIds.length} tabs...`);
          for (const tabId of allTabIds) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (error) {
              console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed:`, error.message);
            }
          }
          console.log(`[Tab Cleaner Background] ✓ All tabs closed`);
        }

        // 最后打开个人空间展示结果
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        await chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });
        console.log(`[Tab Cleaner Background] ✓ Personal space opened`);

        sendResponse({ ok: true, data: opengraphData });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to clean all tabs:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });

    return true; // 异步响应
  }
  
  // 处理其他消息类型
  return false;
});

