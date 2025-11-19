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

// Screenshot 功能已移除

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

// ✅ v2.3: 简化 toggle-pet 逻辑 - 只负责翻转全局开关
// pet.js 通过 chrome.storage.onChanged 监听变化并自动显示/隐藏
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "toggle-pet") {
    if (!chrome.storage || !chrome.storage.local) {
      sendResponse?.({ ok: false, error: "storage not available" });
      return true;
    }
    
    chrome.storage.local.get(["petVisible"], (items) => {
      const currentVisible = items.petVisible === true;
      const newVisible = !currentVisible;
      
      chrome.storage.local.set({ petVisible: newVisible }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[Tab Cleaner Background] Failed to set petVisible:", chrome.runtime.lastError);
          sendResponse?.({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("[Tab Cleaner Background] petVisible updated:", newVisible);
          sendResponse?.({ ok: true, visible: newVisible });
        }
      });
    });
    
    // 异步响应
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
  // ✅ 新流程：完全本地抓取 OpenGraph → 立即保存 → 异步生成 embedding
  if (req.action === "clean") {
    console.log("[Tab Cleaner Background] Clean button clicked - using LOCAL OpenGraph fetching only");
    
    // 获取所有打开的 tabs
    chrome.tabs.query({}, async (tabs) => {
      // 将 uniqueTabs 定义在外部，以便在 catch 块中也能访问
      let uniqueTabs = [];
      let originalTabIds = new Set();
      
      try {
        // 过滤掉 chrome://, chrome-extension://, about: 等特殊页面
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

        // ✅ 步骤 1: 完全本地 OpenGraph 抓取（每个网站）
        console.log(`[Tab Cleaner Background] Fetching OpenGraph locally for ${uniqueTabs.length} tabs...`);
        const localOGResults = await Promise.allSettled(
          uniqueTabs.map(async (tab) => {
            try {
              // 从 content script 获取本地 OpenGraph 数据
              const localOG = await chrome.tabs.sendMessage(tab.id, { action: 'fetch-opengraph' });
              
              // 添加调试日志（详细）
              console.log(`[Tab Cleaner Background] Local OG result for ${tab.url.substring(0, 50)}...:`, {
                success: localOG?.success,
                hasTitle: !!(localOG?.title),
                hasImage: !!(localOG?.image),
                hasDescription: !!(localOG?.description),
                title: localOG?.title?.substring(0, 50),
                image: localOG?.image ? localOG.image.substring(0, 50) + '...' : null,
                description: localOG?.description?.substring(0, 50),
                error: localOG?.error,
                is_local_fetch: localOG?.is_local_fetch,
                // 完整数据（用于调试）
                fullData: localOG
              });
              
              // 保存到本地文件（用于调试）
              try {
                const debugData = {
                  url: tab.url,
                  timestamp: new Date().toISOString(),
                  result: localOG
                };
                // 使用 download API 保存 JSON 文件
                const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `opengraph_debug_${Date.now()}.json`;
                // 注意：在 service worker 中不能直接创建 DOM 元素，改用 console.log
                console.log(`[Tab Cleaner Background] 📥 Debug data for ${tab.url}:`, JSON.stringify(debugData, null, 2));
              } catch (e) {
                // Service worker 中不能使用 DOM API，只记录日志
                console.log(`[Tab Cleaner Background] 📥 Full debug data for ${tab.url}:`, JSON.stringify(localOG, null, 2));
              }
              
              if (localOG) {
                // 即使 success 为 false，也返回抓取到的数据（可能有一些数据）
                return { 
                  ...localOG, 
                  tab_id: tab.id, 
                  tab_title: tab.title,
                  id: localOG.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  // 确保有 URL 和 title
                  url: localOG.url || tab.url,
                  title: localOG.title || tab.title || tab.url,
                  // 确保 is_doc_card 被正确设置（如果未设置，默认为 false）
                  is_doc_card: localOG.is_doc_card || false,
                };
              }
              
              // 如果 localOG 为空，创建一个基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: 'Local OpenGraph fetch returned empty',
                is_doc_card: false, // 明确设置不是 doc 卡片
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            } catch (error) {
              console.log(`[Tab Cleaner Background] Local OG failed for ${tab.url}:`, error.message);
              // 返回基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: error.message,
                is_doc_card: false, // 明确设置不是 doc 卡片
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            }
          })
        );

        // 收集所有结果（包括失败的）
        const opengraphItems = localOGResults
          .map((result) => {
            if (result.status === 'fulfilled' && result.value) {
              return result.value;
            }
            return null;
          })
          .filter(item => item !== null);

        console.log(`[Tab Cleaner Background] ✅ Got ${opengraphItems.length} OpenGraph results (${opengraphItems.filter(i => i.success).length} successful)`);
        
        const mergedData = opengraphItems;

        // ============================================
        // 步骤 1：确保所有 OpenGraph 数据已完全获取
        // ============================================
        console.log(`[Tab Cleaner Background] ==========================================`);
        console.log(`[Tab Cleaner Background] STEP 1: OpenGraph 数据获取完成`);
        console.log(`[Tab Cleaner Background] ✓ Total items: ${mergedData.length}`);
        
        // 统计 OpenGraph 获取结果
        const stats = {
          total: mergedData.length,
          withImage: 0,
          withoutImage: 0,
          success: 0,
          failed: 0,
        };
        
        mergedData.forEach(item => {
          if (item.image && item.image.trim()) {
            stats.withImage++;
          } else {
            stats.withoutImage++;
          }
          if (item.success) {
            stats.success++;
          } else {
            stats.failed++;
          }
        });
        
        console.log(`[Tab Cleaner Background]   - 成功: ${stats.success}`);
        console.log(`[Tab Cleaner Background]   - 失败: ${stats.failed}`);
        console.log(`[Tab Cleaner Background]   - 有图片: ${stats.withImage}`);
        console.log(`[Tab Cleaner Background]   - 无图片: ${stats.withoutImage}`);
        console.log(`[Tab Cleaner Background] ==========================================`);
        
        // ============================================
        // 步骤 2：OpenGraph 数据获取完成，继续后续流程
        // Screenshot 功能已移除
        // ============================================
        console.log(`[Tab Cleaner Background] ==========================================`);
        console.log(`[Tab Cleaner Background] OpenGraph 阶段完成，继续后续流程...`);
        console.log(`[Tab Cleaner Background] ==========================================`);

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
        const itemsWithIds = opengraphItems.map((item, index) => {
          if (!item.id) {
            item.id = item.url || `og-${sessionId}-${index}`;
          }
          return item;
        });
        
        const newSession = {
          id: sessionId,
          name: sessionName,
          createdAt: Date.now(),
          opengraphData: itemsWithIds, // 先保存没有 embedding 的数据
          tabCount: itemsWithIds.length,
        };
        
        // 新 session 添加到顶部（最新的在前）
        const updatedSessions = [newSession, ...existingSessions];
        
        // 保存到 storage（不等待 embedding）
        try {
          await chrome.storage.local.set({ 
            sessions: updatedSessions,
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

        console.log(`[Tab Cleaner Background] ✓ Session saved immediately:`);
        console.log(`  - Session ID: ${sessionId}`);
        console.log(`  - Session Name: ${sessionName}`);
        console.log(`  - Items count: ${itemsWithIds.length}`);
        console.log(`  - Successful items: ${itemsWithIds.filter(i => i.success).length}`);

        // ✅ 步骤 3: 关闭所有标签页（OpenGraph 已获取完成）
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

        // ✅ 步骤 4: 打开个人空间展示结果（立即显示，不等待 embedding）
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        await chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });
        console.log(`[Tab Cleaner Background] ✓ Personal space opened`);

        // ✅ 步骤 5: 异步生成 embedding（不阻塞主流程）
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (apiUrl) {
          console.log(`[Tab Cleaner Background] Starting async embedding generation...`);
          // 异步处理，不阻塞响应
          (async () => {
            try {
              const successfulItems = itemsWithIds.filter(item => item.success);
              if (successfulItems.length === 0) {
                console.log(`[Tab Cleaner Background] No successful items to generate embeddings for`);
                return;
              }

              // 批量生成 embedding（每批 5 个，避免过载）
              const batchSize = 5;
              for (let i = 0; i < successfulItems.length; i += batchSize) {
                const batch = successfulItems.slice(i, i + batchSize);
                try {
                  const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
                  const embedResponse = await fetch(embeddingUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      opengraph_items: batch.map(item => ({
                        url: item.url,
                        title: item.title,
                        description: item.description,
                        image: item.image,
                        site_name: item.site_name,
                        is_doc_card: item.is_doc_card,
                      }))
                    }),
                  });
                  
                  if (embedResponse.ok) {
                    const embedData = await embedResponse.json();
                    if (embedData.data && embedData.data.length > 0) {
                      // 更新 session 中的 embedding 数据
                      const storageResult = await chrome.storage.local.get(['sessions']);
                      const sessions = storageResult.sessions || [];
                      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
                      
                      if (sessionIndex !== -1) {
                        const session = sessions[sessionIndex];
                        const updatedData = session.opengraphData.map(item => {
                          const embedItem = embedData.data.find(e => e.url === item.url);
                          if (embedItem && (embedItem.text_embedding || embedItem.image_embedding)) {
                            return {
                              ...item,
                              text_embedding: embedItem.text_embedding || item.text_embedding,
                              image_embedding: embedItem.image_embedding || item.image_embedding,
                            };
                          }
                          return item;
                        });
                        
                        sessions[sessionIndex] = {
                          ...session,
                          opengraphData: updatedData,
                        };
                        
                        await chrome.storage.local.set({ sessions });
                        console.log(`[Tab Cleaner Background] ✓ Updated embeddings for batch ${Math.floor(i / batchSize) + 1}`);
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[Tab Cleaner Background] Failed to generate embeddings for batch ${Math.floor(i / batchSize) + 1}:`, error);
                }
                
                // 批次间延迟，避免过载
                if (i + batchSize < successfulItems.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
              
              console.log(`[Tab Cleaner Background] ✓ All embeddings generated asynchronously`);
            } catch (error) {
              console.error('[Tab Cleaner Background] Async embedding generation failed:', error);
            }
          })();
        } else {
          console.log(`[Tab Cleaner Background] No API URL configured, skipping embedding generation`);
        }

        sendResponse({ ok: true, data: { items: itemsWithIds, sessionId } });
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
        
        // 即使失败，也要尝试关闭标签页和打开个人空间
        try {
          if (originalTabIds.size > 0) {
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
          }
        } catch (closeError) {
          console.error('[Tab Cleaner Background] Failed to close tabs:', closeError);
        }
        
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

        // ✅ 优先使用本地 OpenGraph 抓取（使用用户的浏览器会话）
        let item = null;
        try {
          // 尝试从 content script 获取本地 OpenGraph 数据
          const localOG = await chrome.tabs.sendMessage(tab.id, { action: 'fetch-opengraph' });
          if (localOG && localOG.success) {
            console.log('[Tab Cleaner Background] ✅ Got local OpenGraph data:', localOG);
            item = localOG;
          }
        } catch (localError) {
          console.log('[Tab Cleaner Background] Local OpenGraph fetch failed, will try backend:', localError.message);
        }

        // 如果本地抓取失败，使用后端 API
        if (!item || !item.success) {
          console.log('[Tab Cleaner Background] Using backend API for OpenGraph...');
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

          item = items[0];
        }

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
  // ✅ 新流程：完全本地抓取 OpenGraph → 立即保存 → 异步生成 embedding
  if (req.action === "clean-all") {
    console.log("[Tab Cleaner Background] Clean all clicked - using LOCAL OpenGraph fetching only");
    
    // 获取所有打开的 tabs
    chrome.tabs.query({}, async (tabs) => {
      try {
        // 过滤掉 chrome://, chrome-extension://, about: 等特殊页面
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

        // ✅ 步骤 1: 完全本地 OpenGraph 抓取（每个网站）
        console.log(`[Tab Cleaner Background] Fetching OpenGraph locally for ${uniqueTabs.length} tabs...`);
        const localOGResults = await Promise.allSettled(
          uniqueTabs.map(async (tab) => {
            try {
              // 从 content script 获取本地 OpenGraph 数据
              const localOG = await chrome.tabs.sendMessage(tab.id, { action: 'fetch-opengraph' });
              
              // 添加调试日志（详细）
              console.log(`[Tab Cleaner Background] Local OG result for ${tab.url.substring(0, 50)}...:`, {
                success: localOG?.success,
                hasTitle: !!(localOG?.title),
                hasImage: !!(localOG?.image),
                hasDescription: !!(localOG?.description),
                title: localOG?.title?.substring(0, 50),
                image: localOG?.image ? localOG.image.substring(0, 50) + '...' : null,
                description: localOG?.description?.substring(0, 50),
                error: localOG?.error,
                is_local_fetch: localOG?.is_local_fetch,
                // 完整数据（用于调试）
                fullData: localOG
              });
              
              // 保存到本地文件（用于调试）
              try {
                const debugData = {
                  url: tab.url,
                  timestamp: new Date().toISOString(),
                  result: localOG
                };
                // 使用 download API 保存 JSON 文件
                const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `opengraph_debug_${Date.now()}.json`;
                // 注意：在 service worker 中不能直接创建 DOM 元素，改用 console.log
                console.log(`[Tab Cleaner Background] 📥 Debug data for ${tab.url}:`, JSON.stringify(debugData, null, 2));
              } catch (e) {
                // Service worker 中不能使用 DOM API，只记录日志
                console.log(`[Tab Cleaner Background] 📥 Full debug data for ${tab.url}:`, JSON.stringify(localOG, null, 2));
              }
              
              if (localOG) {
                // 即使 success 为 false，也返回抓取到的数据（可能有一些数据）
                return { 
                  ...localOG, 
                  tab_id: tab.id, 
                  tab_title: tab.title,
                  id: localOG.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  // 确保有 URL 和 title
                  url: localOG.url || tab.url,
                  title: localOG.title || tab.title || tab.url,
                };
              }
              
              // 如果 localOG 为空，创建一个基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: 'Local OpenGraph fetch returned empty',
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            } catch (error) {
              console.log(`[Tab Cleaner Background] Local OG failed for ${tab.url}:`, error.message);
              // 返回基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: error.message,
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            }
          })
        );

        // 收集所有结果（包括失败的）
        const opengraphItems = localOGResults
          .map((result) => {
            if (result.status === 'fulfilled' && result.value) {
              return result.value;
            }
            return null;
          })
          .filter(item => item !== null);

        console.log(`[Tab Cleaner Background] ✅ Got ${opengraphItems.length} OpenGraph results (${opengraphItems.filter(i => i.success).length} successful)`);
        
        // 详细日志：检查数据完整性
        if (opengraphItems.length > 0) {
          console.log(`[Tab Cleaner Background] 📊 First item sample:`, {
            id: opengraphItems[0].id,
            url: opengraphItems[0].url?.substring(0, 50),
            title: opengraphItems[0].title?.substring(0, 50),
            hasImage: !!(opengraphItems[0].image),
            image: opengraphItems[0].image?.substring(0, 50),
            success: opengraphItems[0].success,
            is_local_fetch: opengraphItems[0].is_local_fetch,
            keys: Object.keys(opengraphItems[0])
          });
        }

        // ✅ 步骤 2: 立即保存到 Chrome Storage（不等待 embedding）
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
          opengraphData: opengraphItems, // 先保存没有 embedding 的数据
          tabCount: opengraphItems.length,
        };
        
        const updatedSessions = [newSession, ...existingSessions];
        
        console.log(`[Tab Cleaner Background] 💾 Saving session:`, {
          sessionId,
          sessionName,
          itemCount: opengraphItems.length,
          totalSessions: updatedSessions.length,
          firstItemKeys: opengraphItems[0] ? Object.keys(opengraphItems[0]) : []
        });
        
        await chrome.storage.local.set({ 
          sessions: updatedSessions,
          lastCleanTime: Date.now(),
          currentSessionId: sessionId,
        });

        console.log(`[Tab Cleaner Background] ✓ Session saved immediately (${opengraphItems.length} items)`);
        
        // 验证保存是否成功
        const verifyResult = await chrome.storage.local.get(['sessions', 'currentSessionId']);
        console.log(`[Tab Cleaner Background] ✅ Verification:`, {
          sessionsCount: verifyResult.sessions?.length || 0,
          currentSessionId: verifyResult.currentSessionId,
          savedSessionId: sessionId,
          match: verifyResult.currentSessionId === sessionId,
          firstSessionItemCount: verifyResult.sessions?.[0]?.opengraphData?.length || 0
        });

        // ✅ 步骤 3: 关闭所有标签页（OpenGraph 已获取完成）
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

        // ✅ 步骤 4: 打开个人空间展示结果（立即显示，不等待 embedding）
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        await chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });
        console.log(`[Tab Cleaner Background] ✓ Personal space opened`);

        // ✅ 步骤 5: 异步生成 embedding（不阻塞主流程）
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (apiUrl) {
          console.log(`[Tab Cleaner Background] Starting async embedding generation...`);
          // 异步处理，不阻塞响应
          (async () => {
            try {
              const successfulItems = opengraphItems.filter(item => item.success);
              if (successfulItems.length === 0) {
                console.log(`[Tab Cleaner Background] No successful items to generate embeddings for`);
                return;
              }

              // 批量生成 embedding（每批 5 个，避免过载）
              const batchSize = 5;
              for (let i = 0; i < successfulItems.length; i += batchSize) {
                const batch = successfulItems.slice(i, i + batchSize);
                try {
                  const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
                  const embedResponse = await fetch(embeddingUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      opengraph_items: batch.map(item => ({
                        url: item.url,
                        title: item.title,
                        description: item.description,
                        image: item.image,
                        site_name: item.site_name,
                        is_doc_card: item.is_doc_card,
                      }))
                    }),
                  });
                  
                  if (embedResponse.ok) {
                    const embedData = await embedResponse.json();
                    if (embedData.data && embedData.data.length > 0) {
                      // 更新 session 中的 embedding 数据
                      const storageResult = await chrome.storage.local.get(['sessions']);
                      const sessions = storageResult.sessions || [];
                      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
                      
                      if (sessionIndex !== -1) {
                        const session = sessions[sessionIndex];
                        const updatedData = session.opengraphData.map(item => {
                          const embedItem = embedData.data.find(e => e.url === item.url);
                          if (embedItem && (embedItem.text_embedding || embedItem.image_embedding)) {
                            return {
                              ...item,
                              text_embedding: embedItem.text_embedding || item.text_embedding,
                              image_embedding: embedItem.image_embedding || item.image_embedding,
                            };
                          }
                          return item;
                        });
                        
                        sessions[sessionIndex] = {
                          ...session,
                          opengraphData: updatedData,
                        };
                        
                        await chrome.storage.local.set({ sessions });
                        console.log(`[Tab Cleaner Background] ✓ Updated embeddings for batch ${Math.floor(i / batchSize) + 1}`);
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[Tab Cleaner Background] Failed to generate embeddings for batch ${Math.floor(i / batchSize) + 1}:`, error);
                }
                
                // 批次间延迟，避免过载
                if (i + batchSize < successfulItems.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
              
              console.log(`[Tab Cleaner Background] ✓ All embeddings generated asynchronously`);
            } catch (error) {
              console.error('[Tab Cleaner Background] Async embedding generation failed:', error);
            }
          })();
        } else {
          console.log(`[Tab Cleaner Background] No API URL configured, skipping embedding generation`);
        }

        sendResponse({ ok: true, data: { items: opengraphItems, sessionId } });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to clean all tabs:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });

    return true; // 异步响应
  }
  
  // 处理预览卡片保存请求
  if (req.action === "save-opengraph-preview") {
    console.log("[Tab Cleaner Background] Saving OpenGraph preview data...");
    
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs[0];
        if (!tab) {
          sendResponse({ ok: false, error: "No active tab" });
          return;
        }

        const ogData = req.data || {};
        
        // 补充 tab 信息
        ogData.tab_id = tab.id;
        ogData.tab_title = tab.title;
        
        // 获取现有 sessions
        const storageResult = await chrome.storage.local.get(['sessions']);
        const existingSessions = storageResult.sessions || [];
        
        if (existingSessions.length === 0) {
          // 创建新 session
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newSession = {
            id: sessionId,
            name: '洗衣筐1',
            createdAt: Date.now(),
            opengraphData: [ogData],
            tabCount: 1,
          };
          await chrome.storage.local.set({ 
            sessions: [newSession],
            currentSessionId: sessionId,
          });
        } else {
          // 添加到最新 session
          const latestSession = existingSessions[0];
          const updatedData = [...(latestSession.opengraphData || []), ogData];
          const updatedSession = {
            ...latestSession,
            opengraphData: updatedData,
            tabCount: updatedData.length,
          };
          
          const updatedSessions = [updatedSession, ...existingSessions.slice(1)];
          await chrome.storage.local.set({ sessions: updatedSessions });
        }

        // 可选：发送到后端生成 embedding（异步，不阻塞）
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (apiUrl && ogData.success) {
          try {
            const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
            fetch(embeddingUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                opengraph_items: [ogData]
              }),
            }).catch(err => {
              console.warn('[Tab Cleaner Background] Failed to generate embedding:', err);
            });
          } catch (err) {
            console.warn('[Tab Cleaner Background] Embedding request error:', err);
          }
        }

        sendResponse({ ok: true, message: "OpenGraph data saved" });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to save preview:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });
    
    return true; // 异步响应
  }
  
  // 处理其他消息类型
  return false;
});

