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
 * 截图兜底函数（100% 保证有图）
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<string|null>} - 截图数据 URL 或 null
 */
async function captureTabScreenshot(tabId) {
  try {
    // 获取当前窗口
    const currentWindow = await chrome.windows.getCurrent();
    
    // 切换到目标标签页
    await chrome.tabs.update(tabId, { active: true });
    
    // 等待标签页激活
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 截图（captureVisibleTab 截取当前活动标签页的可见区域）
    const screenshot = await chrome.tabs.captureVisibleTab(currentWindow.id, {
      format: 'png',
      quality: 85
    });
    
    console.log('✅ Screenshot captured as fallback');
    return screenshot;
  } catch (e) {
    console.error('❌ Screenshot failed:', e);
    return null;
  }
}

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
 * 收集标签页并确保有图片（三层保险策略）
 * 1. 智能等待 OG 抓取（支持动态加载）
 * 2. MutationObserver 监听动态 OG 标签
 * 3. 截图兜底（100% 保证有图）
 * @param {Object} tab - 标签页对象
 * @returns {Promise<Object>} - 包含图片的 OpenGraph 数据
 */
async function collectTabWithGuaranteedImage(tab) {
  console.log(`[Collect] Starting collection for: ${tab.title}`);
  
  // 步骤1：注入脚本
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['assets/opengraph_local.js']
    });
    console.log(`[Collect] ✅ Script injected for tab ${tab.id}`);
  } catch (e) {
    console.error(`[Collect] Failed to inject script for tab ${tab.id}:`, e);
    // 如果无法注入，直接截图
    const screenshot = await captureTabScreenshot(tab.id);
    return {
      url: tab.url,
      title: tab.title,
      image: screenshot,
      is_screenshot: true,
      success: !!screenshot,
      error: screenshot ? null : 'Failed to inject script and screenshot failed'
    };
  }
  
  // 等待脚本加载
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // ✅ 步骤1.5：对于 Pinterest 等 SPA，确保 URL 匹配并强制重新提取
  try {
    const currentTab = await chrome.tabs.get(tab.id);
    if (currentTab.url !== tab.url) {
      console.log(`[Collect] ⚠️ Tab URL changed: ${tab.url} -> ${currentTab.url}`);
      // URL 已变化，更新 tab 对象
      tab = currentTab;
    }
    
    // 发送 URL 同步消息，确保 opengraph_local.js 使用最新的 URL
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'sync-url',
        url: tab.url
      });
    } catch (e) {
      // 忽略错误，可能脚本还没准备好
    }
  } catch (e) {
    console.warn(`[Collect] Failed to sync URL:`, e);
  }
  
  // 步骤2：发送抓取消息（强制重新提取，忽略缓存）
  try {
    await chrome.tabs.sendMessage(tab.id, { 
      action: 'extract-opengraph-with-wait',
      maxWaitTime: 8000,
      forceReextract: true  // ✅ 强制重新提取，不使用缓存
    });
    console.log(`[Collect] ✅ Extraction message sent for tab ${tab.id}`);
  } catch (e) {
    console.warn(`[Collect] Failed to send extraction message:`, e);
  }
  
  // 步骤3：轮询等待（最多 8 秒）
  let ogData = null;
  const maxWaitTime = 8000;
  const startTime = Date.now();
  const checkInterval = 500;
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await chrome.tabs.sendMessage(tab.id, {
        action: 'get-opengraph-status'
      });
      
      // 关键：检查是否有图片
      if (status?.data?.image && status.data.image.trim()) {
        console.log(`[Collect] ✅ Got OG image for ${tab.url.substring(0, 50)}...`);
        ogData = status.data;
        break;
      }
      
      // 如果已完成但无图片，跳出（进入截图兜底）
      if (status?.completed && !status?.data?.image) {
        console.log(`[Collect] ⚠️ OG extraction completed but no image for ${tab.url.substring(0, 50)}...`);
        // 尝试使用最后一次的数据（即使没有图片）
        if (status.data) {
          ogData = status.data;
        }
        break;
      }
    } catch (e) {
      // 消息可能失败（标签页已关闭等），继续等待
      console.debug(`[Collect] Waiting for OG extraction... (${Date.now() - startTime}ms elapsed)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  // 步骤4：如果没有 OG 图片，截图兜底
  if (!ogData?.image || !ogData.image.trim()) {
    console.log(`[Collect] 🔧 No OG image, capturing screenshot for ${tab.url.substring(0, 50)}...`);
    const screenshot = await captureTabScreenshot(tab.id);
    
    if (screenshot) {
      ogData = {
        ...(ogData || {}),
        url: ogData?.url || tab.url,
        title: ogData?.title || tab.title,
        image: screenshot,
        is_screenshot: true,
        success: true
      };
      console.log(`[Collect] ✅ Screenshot captured as fallback`);
    } else {
      // 截图也失败了
      ogData = {
        ...(ogData || {}),
        url: tab.url,
        title: ogData?.title || tab.title,
        image: '',
        is_screenshot: false,
        success: false,
        error: 'Both OG extraction and screenshot failed'
      };
      console.error(`[Collect] ❌ Screenshot also failed`);
    }
  } else {
    // 有 OG 图片，标记不是截图
    ogData.is_screenshot = false;
    ogData.success = true;
  }
  
  // 步骤5：确认有图片后才返回
  if (ogData?.image && ogData.image.trim()) {
    console.log(`[Collect] ✅ Image confirmed for ${tab.url.substring(0, 50)}...`);
    return ogData;
  } else {
    console.error(`[Collect] ❌ Failed to get any image for ${tab.url.substring(0, 50)}...`);
    return {
      url: tab.url,
      title: ogData?.title || tab.title,
      image: '',
      success: false,
      error: 'No image available'
    };
  }
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

// ✅ v2.4: toggle-pet 现在由 content.js 直接处理 chrome.storage.local
// pet.js 通过 chrome.storage.onChanged 监听变化并自动显示/隐藏
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // if (req.action === "toggle-pet") {
  //   // ✅ v2.4: 已移除 - content.js 现在直接读写 chrome.storage.local
  //   // pet.js 的 setupStorageSync() 监听器会自动处理显示/隐藏
  //   return true;
  // }
  
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
    
    // ✅ 记录动画开始时间（动画已在 content.js 中显示）
    const animationStartTime = Date.now();
    const sourceTabId = sender.tab?.id; // 发起请求的标签页 ID
    
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

        // ✅ 步骤 1: 使用三层保险策略收集 OpenGraph（每个网站）
        console.log(`[Tab Cleaner Background] Collecting OpenGraph with guaranteed image for ${uniqueTabs.length} tabs...`);
        const localOGResults = await Promise.allSettled(
          uniqueTabs.map(async (tab, index) => {
            // 添加延迟，避免过快切换标签页
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            try {
              // 使用新的三层保险策略收集函数
              const ogData = await collectTabWithGuaranteedImage(tab);
              
              // 添加调试日志
              console.log(`[Tab Cleaner Background] Collection result for ${tab.url.substring(0, 50)}...:`, {
                success: ogData?.success,
                hasTitle: !!(ogData?.title),
                hasImage: !!(ogData?.image),
                isScreenshot: ogData?.is_screenshot || false,
                title: ogData?.title?.substring(0, 50),
                image: ogData?.image ? (ogData.image.substring(0, 50) + '...') : null,
                error: ogData?.error
              });
              
              if (ogData) {
                return { 
                  ...ogData, 
                  tab_id: tab.id, 
                  tab_title: tab.title,
                  id: ogData.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  // 确保有 URL 和 title
                  url: ogData.url || tab.url,
                  title: ogData.title || tab.title || tab.url,
                  // 确保 is_doc_card 被正确设置
                  is_doc_card: ogData.is_doc_card || false,
                  is_local_fetch: true,
                };
              }
              
              // 如果 ogData 为空，创建一个基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: 'Collection returned empty',
                is_doc_card: false,
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            } catch (error) {
              console.error(`[Tab Cleaner Background] Collection failed for ${tab.url}:`, error);
              // 返回基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: error.message,
                is_doc_card: false,
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
        
        // ✅ 关键检查：找出没有图片的标签页
        const itemsWithoutImage = mergedData.filter(item => !item.image || !item.image.trim());
        if (itemsWithoutImage.length > 0) {
          console.warn(`[Tab Cleaner Background] ⚠️ Found ${itemsWithoutImage.length} items without image:`, 
            itemsWithoutImage.map(item => ({ url: item.url, title: item.title }))
          );
          
          // 尝试为没有图片的标签页重新截图（如果标签页还存在）
          for (const item of itemsWithoutImage) {
            if (item.tab_id) {
              try {
                const tab = await chrome.tabs.get(item.tab_id);
                if (tab && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                  console.log(`[Tab Cleaner Background] 🔧 Retrying screenshot for tab without image: ${item.url.substring(0, 50)}...`);
                  const screenshot = await captureTabScreenshot(item.tab_id);
                  if (screenshot) {
                    item.image = screenshot;
                    item.is_screenshot = true;
                    item.success = true;
                    console.log(`[Tab Cleaner Background] ✅ Screenshot retry successful for ${item.url.substring(0, 50)}...`);
                  }
                }
              } catch (e) {
                console.warn(`[Tab Cleaner Background] Failed to retry screenshot for tab ${item.tab_id}:`, e);
              }
            }
          }
        }
        
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
              // ✅ 规范化数据：确保 image 是字符串，不是数组
              const normalizeItem = (item) => {
                const normalized = {
                  url: String(item.url || '').trim(),
                  title: item.title ? String(item.title).trim() : null,
                  description: item.description ? String(item.description).trim() : null,
                  image: null,
                  site_name: item.site_name ? String(item.site_name).trim() : null,
                  tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                  tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                  is_doc_card: Boolean(item.is_doc_card || false),
                  is_screenshot: Boolean(item.is_screenshot || false),
                  success: Boolean(item.success !== undefined ? item.success : true),
                };
                
                // ✅ 关键：确保 image 是字符串，不是数组
                let image = item.image;
                if (image) {
                  if (Array.isArray(image)) {
                    image = image.length > 0 ? String(image[0]).trim() : null;
                  } else if (typeof image === 'string') {
                    image = image.trim() || null;
                  } else {
                    image = String(image).trim() || null;
                  }
                }
                normalized.image = image;
                
                return normalized;
              };
              
              const normalizedItem = normalizeItem(item);
              
              const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
              const response = await fetch(embeddingUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  opengraph_items: [normalizedItem]
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

        // ✅ 步骤 3: 关闭所有标签页（只关闭有图片的标签页）
        // 关键：检查每个标签页是否真的有图片，只关闭有图片的标签页
        const tabsToClose = [];
        const tabsToKeep = [];
        
        for (const tab of uniqueTabs) {
          const item = itemsWithIds.find(i => i.tab_id === tab.id || i.url === tab.url);
          if (item && item.image && item.image.trim()) {
            // 有图片，可以关闭
            tabsToClose.push(tab.id);
          } else {
            // 没有图片，保留标签页
            tabsToKeep.push(tab);
            console.warn(`[Tab Cleaner Background] ⚠️ Keeping tab open (no image): ${tab.url.substring(0, 50)}...`);
          }
        }
        
        if (tabsToClose.length > 0) {
          console.log(`[Tab Cleaner Background] Closing ${tabsToClose.length} tabs with confirmed images...`);
          for (const tabId of tabsToClose) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (error) {
              console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed:`, error.message);
            }
          }
          console.log(`[Tab Cleaner Background] ✓ ${tabsToClose.length} tabs closed`);
        }
        
        if (tabsToKeep.length > 0) {
          console.warn(`[Tab Cleaner Background] ⚠️ ${tabsToKeep.length} tabs kept open (no image available):`, 
            tabsToKeep.map(t => t.url.substring(0, 50))
          );
        }

        // ✅ 步骤 4: 确保动画至少显示3秒，然后隐藏动画
        const elapsedTime = Date.now() - animationStartTime;
        const minAnimationTime = 3000; // 3秒
        if (elapsedTime < minAnimationTime) {
          await new Promise(resolve => setTimeout(resolve, minAnimationTime - elapsedTime));
        }
        
        // ✅ 只向发起请求的标签页隐藏动画
        if (sourceTabId) {
          try {
            await chrome.tabs.sendMessage(sourceTabId, { action: 'hide-cleaning-animation' });
            console.log(`[Tab Cleaner Background] ✓ Cleaning animation hidden on source tab`);
          } catch (e) {
            // 标签页可能已经关闭，忽略错误
            console.warn(`[Tab Cleaner Background] Failed to hide animation on source tab:`, e);
          }
        }
        
        // ✅ 步骤 5: 打开个人空间展示结果（立即显示，不等待 embedding）
        // ✅ 关键：添加小延迟，确保 Storage 写入完成，避免个人空间读取到旧数据
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        await chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });
        console.log(`[Tab Cleaner Background] ✓ Personal space opened`);

        // ✅ 步骤 6: 异步生成 embedding（不阻塞主流程）
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

              // ✅ 规范化函数：确保 image 是字符串，不是数组
              const normalizeItem = (item) => {
                const normalized = {
                  url: String(item.url || '').trim(),
                  title: item.title ? String(item.title).trim() : null,
                  description: item.description ? String(item.description).trim() : null,
                  image: null,
                  site_name: item.site_name ? String(item.site_name).trim() : null,
                  tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                  tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                  is_doc_card: Boolean(item.is_doc_card || false),
                  is_screenshot: Boolean(item.is_screenshot || false),
                  success: Boolean(item.success !== undefined ? item.success : true),
                };
                
                // ✅ 关键：确保 image 是字符串，不是数组
                let image = item.image;
                if (image) {
                  if (Array.isArray(image)) {
                    image = image.length > 0 ? String(image[0]).trim() : null;
                  } else if (typeof image === 'string') {
                    image = image.trim() || null;
                  } else {
                    image = String(image).trim() || null;
                  }
                }
                normalized.image = image;
                
                return normalized;
              };
              
              // 批量生成 embedding（每批 5 个，避免过载）
              const batchSize = 5;
              for (let i = 0; i < successfulItems.length; i += batchSize) {
                const batch = successfulItems.slice(i, i + batchSize);
                try {
                  // ✅ 规范化每个项
                  const normalizedBatch = batch.map(normalizeItem);
                  
                  const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
                  const embedResponse = await fetch(embeddingUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      opengraph_items: normalizedBatch
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
    const animationStartTime = Date.now(); // 记录动画开始时间（由 content.js 显示动画时记录）
    
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

        // ✅ 使用三层保险策略收集 OpenGraph（确保有图片）
        let item = null;
        try {
          // 使用新的三层保险策略收集函数
          const ogData = await collectTabWithGuaranteedImage(tab);
          
          if (ogData && ogData.image && ogData.image.trim()) {
            console.log('[Tab Cleaner Background] ✅ Got OpenGraph data with image:', {
              hasImage: !!(ogData.image),
              isScreenshot: ogData.is_screenshot || false
            });
            item = ogData;
          } else {
            // 收集失败，返回错误
            console.warn(`[OpenGraph] Collection failed for ${url}, no image available`);
            sendResponse({ 
              ok: false, 
              error: "无法获取页面图片",
              hint: "OpenGraph 数据获取失败，请刷新页面后重试"
            });
            return;
          }
        } catch (collectionError) {
          // 收集异常，返回错误
          console.error(`[OpenGraph] Collection error for ${url}:`, collectionError);
          sendResponse({ 
            ok: false, 
            error: "收集数据时出错",
            hint: collectionError.message || "请刷新页面后重试"
          });
          return;
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

        // ✅ 确保动画至少显示3秒
        const elapsedTime = Date.now() - animationStartTime;
        const minAnimationTime = 3000; // 3秒
        if (elapsedTime < minAnimationTime) {
          await new Promise(resolve => setTimeout(resolve, minAnimationTime - elapsedTime));
        }
        
        // 关闭当前 tab
        try {
          await chrome.tabs.remove(currentTab.id);
        } catch (error) {
          console.warn('[Tab Cleaner Background] Failed to close tab:', error);
        }
        
        // ✅ 只向当前标签页隐藏动画（如果标签页还在）
        try {
          await chrome.tabs.sendMessage(currentTab.id, { action: 'hide-cleaning-animation' });
        } catch (e) {
          // 标签页可能已经关闭，忽略错误
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
    
    // ✅ 记录动画开始时间（动画已在 content.js 中显示）
    const animationStartTime = Date.now();
    const sourceTabId = sender.tab?.id; // 发起请求的标签页 ID
    
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

        // ✅ 步骤 1: 使用三层保险策略收集 OpenGraph（每个网站）
        console.log(`[Tab Cleaner Background] Collecting OpenGraph with guaranteed image for ${uniqueTabs.length} tabs...`);
        const localOGResults = await Promise.allSettled(
          uniqueTabs.map(async (tab, index) => {
            // 添加延迟，避免过快切换标签页
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            try {
              // 使用新的三层保险策略收集函数
              const ogData = await collectTabWithGuaranteedImage(tab);
              
              // 添加调试日志
              console.log(`[Tab Cleaner Background] Collection result for ${tab.url.substring(0, 50)}...:`, {
                success: ogData?.success,
                hasTitle: !!(ogData?.title),
                hasImage: !!(ogData?.image),
                isScreenshot: ogData?.is_screenshot || false,
                title: ogData?.title?.substring(0, 50),
                image: ogData?.image ? (ogData.image.substring(0, 50) + '...') : null,
                error: ogData?.error
              });
              
              if (ogData) {
                return { 
                  ...ogData, 
                  tab_id: tab.id, 
                  tab_title: tab.title,
                  id: ogData.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  // 确保有 URL 和 title
                  url: ogData.url || tab.url,
                  title: ogData.title || tab.title || tab.url,
                  is_local_fetch: true,
                };
              }
              
              // 如果 ogData 为空，创建一个基础记录
              return {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: 'Collection returned empty',
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            } catch (error) {
              console.error(`[Tab Cleaner Background] Collection failed for ${tab.url}:`, error);
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

        // ✅ 步骤 3: 关闭所有标签页（只关闭有图片的标签页）
        // 关键：检查每个标签页是否真的有图片，只关闭有图片的标签页
        const tabsToClose = [];
        const tabsToKeep = [];
        
        for (const tab of uniqueTabs) {
          const item = opengraphItems.find(i => i.tab_id === tab.id || i.url === tab.url);
          if (item && item.image && item.image.trim()) {
            // 有图片，可以关闭
            tabsToClose.push(tab.id);
          } else {
            // 没有图片，保留标签页
            tabsToKeep.push(tab);
            console.warn(`[Tab Cleaner Background] ⚠️ Keeping tab open (no image): ${tab.url.substring(0, 50)}...`);
          }
        }
        
        if (tabsToClose.length > 0) {
          console.log(`[Tab Cleaner Background] Closing ${tabsToClose.length} tabs with confirmed images...`);
          for (const tabId of tabsToClose) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (error) {
              console.warn(`[Tab Cleaner Background] Tab ${tabId} already closed:`, error.message);
            }
          }
          console.log(`[Tab Cleaner Background] ✓ ${tabsToClose.length} tabs closed`);
        }
        
        if (tabsToKeep.length > 0) {
          console.warn(`[Tab Cleaner Background] ⚠️ ${tabsToKeep.length} tabs kept open (no image available):`, 
            tabsToKeep.map(t => t.url.substring(0, 50))
          );
        }

        // ✅ 步骤 4: 确保动画至少显示3秒，然后隐藏动画
        const elapsedTime = Date.now() - animationStartTime;
        const minAnimationTime = 3000; // 3秒
        if (elapsedTime < minAnimationTime) {
          await new Promise(resolve => setTimeout(resolve, minAnimationTime - elapsedTime));
        }
        
        // ✅ 只向发起请求的标签页隐藏动画
        if (sourceTabId) {
          try {
            await chrome.tabs.sendMessage(sourceTabId, { action: 'hide-cleaning-animation' });
            console.log(`[Tab Cleaner Background] ✓ Cleaning animation hidden on source tab`);
          } catch (e) {
            // 标签页可能已经关闭，忽略错误
            console.warn(`[Tab Cleaner Background] Failed to hide animation on source tab:`, e);
          }
        }
        
        // ✅ 步骤 5: 打开个人空间展示结果（立即显示，不等待 embedding）
        // ✅ 关键：添加小延迟，确保 Storage 写入完成，避免个人空间读取到旧数据
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log(`[Tab Cleaner Background] Opening personal space...`);
        await chrome.tabs.create({
          url: chrome.runtime.getURL("personalspace.html")
        });
        console.log(`[Tab Cleaner Background] ✓ Personal space opened`);

        // ✅ 步骤 6: 异步生成 embedding（不阻塞主流程）
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

              // ✅ 规范化函数：确保 image 是字符串，不是数组
              const normalizeItem = (item) => {
                const normalized = {
                  url: String(item.url || '').trim(),
                  title: item.title ? String(item.title).trim() : null,
                  description: item.description ? String(item.description).trim() : null,
                  image: null, // 先设为 null，然后处理
                  site_name: item.site_name ? String(item.site_name).trim() : null,
                  tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                  tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                  is_doc_card: Boolean(item.is_doc_card || false),
                  is_screenshot: Boolean(item.is_screenshot || false),
                  success: Boolean(item.success !== undefined ? item.success : true),
                };
                
                // ✅ 关键：确保 image 是字符串，不是数组
                let image = item.image;
                if (image) {
                  if (Array.isArray(image)) {
                    // 如果是数组，取第一个元素
                    image = image.length > 0 ? String(image[0]).trim() : null;
                  } else if (typeof image === 'string') {
                    image = image.trim() || null;
                  } else {
                    image = String(image).trim() || null;
                  }
                }
                normalized.image = image;
                
                return normalized;
              };

              // 批量生成 embedding（每批 5 个，避免过载）
              const batchSize = 5;
              for (let i = 0; i < successfulItems.length; i += batchSize) {
                const batch = successfulItems.slice(i, i + batchSize);
                try {
                  // ✅ 规范化每个项
                  const normalizedBatch = batch.map(normalizeItem);
                  
                  const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
                  const embedResponse = await fetch(embeddingUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      opengraph_items: normalizedBatch
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
            // ✅ 规范化数据：确保 image 是字符串，不是数组
            const normalizeItem = (item) => {
              const normalized = {
                url: String(item.url || '').trim(),
                title: item.title ? String(item.title).trim() : null,
                description: item.description ? String(item.description).trim() : null,
                image: null,
                site_name: item.site_name ? String(item.site_name).trim() : null,
                tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                is_doc_card: Boolean(item.is_doc_card || false),
                is_screenshot: Boolean(item.is_screenshot || false),
                success: Boolean(item.success !== undefined ? item.success : true),
              };
              
              // ✅ 关键：确保 image 是字符串，不是数组
              let image = item.image;
              if (image) {
                if (Array.isArray(image)) {
                  image = image.length > 0 ? String(image[0]).trim() : null;
                } else if (typeof image === 'string') {
                  image = image.trim() || null;
                } else {
                  image = String(image).trim() || null;
                }
              }
              normalized.image = image;
              
              return normalized;
            };
            
            const normalizedOgData = normalizeItem(ogData);
            
            const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
            
            // ✅ 添加详细日志
            console.log(`[Tab Cleaner Background] 📤 Sending preview item to backend:`, {
              url: embeddingUrl,
              item: {
                url: normalizedOgData.url,
                hasTitle: !!(normalizedOgData.title),
                hasImage: !!(normalizedOgData.image),
                image: normalizedOgData.image ? normalizedOgData.image.substring(0, 60) + '...' : null
              }
            });
            
            fetch(embeddingUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                opengraph_items: [normalizedOgData]
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
  
  // ✅ 处理立即发送 OG 数据到后端的请求
  if (req.action === "send-opengraph-to-backend") {
    console.log('[Tab Cleaner Background] 📥 Received OG data to send to backend:', {
      url: req.data?.url,
      hasTitle: !!(req.data?.title),
      hasImage: !!(req.data?.image),
      success: req.data?.success
    });
    
    // 异步处理，不阻塞
    (async () => {
      try {
        const ogData = req.data;
        if (!ogData || !ogData.success) {
          console.log('[Tab Cleaner Background] ⚠️ OG data not valid, skipping backend send');
          return;
        }
        
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (!apiUrl) {
          console.log('[Tab Cleaner Background] ⚠️ No API URL configured, skipping backend send');
          return;
        }
        
        // ✅ 规范化函数：确保 image 是字符串，不是数组
        const normalizeItem = (item) => {
          const normalized = {
            url: String(item.url || '').trim(),
            title: item.title ? String(item.title).trim() : null,
            description: item.description ? String(item.description).trim() : null,
            image: null,
            site_name: item.site_name ? String(item.site_name).trim() : null,
            tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
            tab_title: item.tab_title ? String(item.tab_title).trim() : null,
            is_doc_card: Boolean(item.is_doc_card || false),
            is_screenshot: Boolean(item.is_screenshot || false),
            success: Boolean(item.success !== undefined ? item.success : true),
          };
          
          // ✅ 关键：确保 image 是字符串，不是数组
          let image = item.image;
          if (image) {
            if (Array.isArray(image)) {
              image = image.length > 0 ? String(image[0]).trim() : null;
            } else if (typeof image === 'string') {
              image = image.trim() || null;
            } else {
              image = String(image).trim() || null;
            }
          }
          normalized.image = image;
          
          return normalized;
        };
        
        const normalizedItem = normalizeItem(ogData);
        const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
        
        console.log('[Tab Cleaner Background] 📤 Sending OG data to backend for embedding:', {
          url: embeddingUrl,
          item: {
            url: normalizedItem.url,
            hasTitle: !!(normalizedItem.title),
            hasImage: !!(normalizedItem.image),
            image: normalizedItem.image ? normalizedItem.image.substring(0, 60) + '...' : null
          }
        });
        
        const response = await fetch(embeddingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opengraph_items: [normalizedItem]
          }),
        });
        
        console.log('[Tab Cleaner Background] 📥 Backend response (immediate send):', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (response.ok) {
          const embedData = await response.json();
          console.log('[Tab Cleaner Background] ✅ Backend processed OG data:', {
            saved: embedData.saved,
            hasData: !!(embedData.data && embedData.data.length > 0)
          });
        } else {
          console.warn('[Tab Cleaner Background] ⚠️ Backend returned error:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[Tab Cleaner Background] ❌ Failed to send OG to backend:', error);
      }
    })();
    
    // 立即返回，不等待异步处理完成
    sendResponse?.({ ok: true, message: "OG data queued for backend processing" });
    return true;
  }
  
  // 处理其他消息类型
  return false;
});

