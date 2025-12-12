// assets/background.js

// 导入 API 配置
importScripts('api_config.js');

// ==================== Caption WebSocket (backend push) ====================
let captionWs = null;
let captionWsReconnectTimer = null;

function getWsUrl() {
  try {
    const base = API_CONFIG.getBaseUrlSync?.();
    if (!base) return null;
    return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/caption';
  } catch (e) {
    console.warn('[Background] ⚠️ Failed to get WS URL:', e);
    return null;
  }
}

function scheduleCaptionWsReconnect(delay = 3000) {
  if (captionWsReconnectTimer) return;
  captionWsReconnectTimer = setTimeout(() => {
    captionWsReconnectTimer = null;
    connectCaptionWs();
  }, delay);
}

function connectCaptionWs() {
  const url = getWsUrl();
  if (!url) {
    console.warn('[Background] ⚠️ WS URL not available, skip connect');
    return;
  }
  try {
    captionWs = new WebSocket(url);
    console.log('[Background][WS] 🔌 Connecting to', url);
    captionWs.onopen = () => {
      console.log('[Background][WS] ✅ Connected');
    };
    captionWs.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.type === 'caption_ready') {
          // 1) 转发到所有普通标签页的 content scripts
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { action: 'caption-ready', payload: data }, () => {
                // 忽略没有 content script 的错误
                chrome.runtime.lastError;
              });
            });
          });
          // 2) 同时通知扩展内部页面（如 PersonalSpace）
          chrome.runtime.sendMessage({ action: 'caption-ready', payload: data }, () => {
            chrome.runtime.lastError;
          });
        }
      } catch (e) {
        console.warn('[Background][WS] ⚠️ Parse message failed:', e);
      }
    };
    captionWs.onclose = () => {
      console.warn('[Background][WS] ⚠️ Closed, reconnecting...');
      captionWs = null;
      scheduleCaptionWsReconnect();
    };
    captionWs.onerror = (err) => {
      console.warn('[Background][WS] ⚠️ Error:', err);
      try { captionWs?.close(); } catch (e) {}
      captionWs = null;
    };
  } catch (e) {
    console.warn('[Background][WS] ⚠️ Connect failed:', e);
    scheduleCaptionWsReconnect();
  }
}

// 初始化 WS 连接（仅在扩展后台环境执行，避免页面 CSP 拦截）
if (typeof document === 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  connectCaptionWs();
} else {
  console.log('[Background][WS] Skip WS connect (not in extension background)');
}

// 🆕 统一图片代理：解决 CSP / CORS，返回 dataURL
async function fetchImageAsDataUrl(url) {
  try {
    console.log('[Background] 🖼️ Fetching image:', url);
    const resp = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      headers: { Accept: 'image/*' },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Invalid image type: ${blob.type || 'unknown'}`);
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
    console.log('[Background] ✅ Image loaded:', url.substring(0, 80));
    return dataUrl;
  } catch (error) {
    console.error('[Background] ❌ Image fetch failed:', url, error.message || error);
    throw error;
  }
}

/**
 * ✅ 获取用户ID（用于发送到后端）
 * 从 Chrome Storage 读取，如果没有则返回 'anonymous'
 */
async function getUserId() {
  try {
    const stored = await chrome.storage.local.get(['user_id']);
    return stored.user_id || 'anonymous';
  } catch (error) {
    console.warn('[Background] Failed to get user ID:', error);
    return 'anonymous';
  }
}

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
 * 创建右键菜单
 */
function createContextMenus() {
  // 移除旧菜单（如果存在）
  chrome.contextMenus.removeAll(() => {
    // 创建图片右键菜单
    chrome.contextMenus.create({
      id: 'save-image-to-tab-cleaner',
      title: '收藏到 Tab Cleaner',
      contexts: ['image'],
    });
    
    console.log('[Background] ✅ Context menus created');
  });
}

// 扩展安装时创建菜单
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

// 启动时创建菜单
createContextMenus();

/**
 * 处理右键菜单点击
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('[Background] Context menu clicked:', info.menuItemId);
  
  if (info.menuItemId === 'save-image-to-tab-cleaner') {
    handleSaveImageFromContextMenu({ imageUrl: info.srcUrl }, { tab }, () => {});
  }
});

/**
 * 🆕 处理 caption 生成
 * - generate-caption: 调用后端 /api/v1/search/embedding（后台代理，避免前端存 key/CSP）
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 兼容：走后端 embedding
  if (message?.action === 'generate-caption') {
    (async () => {
      try {
        const { dataUrl, imageUrl } = message;
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (!apiUrl) {
          sendResponse({ error: 'API base URL not configured' });
          return;
        }

        const userId = await getUserId();
        const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;

        console.log('[Background] 📡 caption -> embedding', {
          url: embeddingUrl,
          hasDataUrl: !!dataUrl,
          dataUrlSize: dataUrl ? `${(dataUrl.length/1024).toFixed(1)} KB` : '0',
          imageUrl: imageUrl ? imageUrl.substring(0, 80) : 'local-image',
          userId,
        });

        const resp = await fetch(embeddingUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
          },
          body: JSON.stringify({
            opengraph_items: [{
              url: imageUrl || 'local-image',
              image: dataUrl, // 直接使用 dataURL (Base64)
              title: '',
              description: '',
            }],
          }),
        });

        if (!resp.ok) {
          let detail = '';
          try { detail = await resp.text(); } catch (e) { detail = ''; }
          console.error('[Background] ❌ caption API error:', {
            status: resp.status,
            statusText: resp.statusText,
            detail: detail?.substring(0,200),
          });
          sendResponse({ success: false, error: `API ${resp.status}: ${detail?.substring(0,200)}` });
          return;
        }

        const result = await resp.json();
        if (result?.data?.length > 0) {
          const item = result.data[0] || {};
          const quickCaption = item.image_caption || '';
          const tags = [
            ...(item.style_tags || []),
            ...(item.object_tags || []),
          ];
          if (Array.isArray(item.dominant_colors)) {
            item.dominant_colors.forEach(c => {
              if (c && !tags.includes(c)) tags.push(c);
            });
          }
          sendResponse({ success: true, quickCaption, tags });
        } else {
          sendResponse({ success: false, error: 'No data from API' });
        }
      } catch (err) {
        console.warn('[Background] Caption generation failed:', err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // 异步响应
  }

  // 🆕 Vectordb 搜索
  if (message?.action === 'search-vectordb') {
    (async () => {
      try {
        const { query, topK = 20 } = message;
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (!apiUrl) {
          sendResponse({ success: false, results: [], error: 'API base URL not configured' });
          return;
        }

        const userId = await getUserId();
        const searchUrl = `${apiUrl}/api/v1/search/query`;

        console.log('[Background] 🔍 [VECTORDB] Search request:', {
          url: searchUrl,
          query: query?.substring(0, 60),
          topK,
          userId,
        });

        const resp = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
          },
          body: JSON.stringify({
            query: query,
            top_k: topK,
          }),
        });

        if (!resp.ok) {
          let detail = '';
          try { detail = await resp.text(); } catch (e) { detail = ''; }
          console.error('[Background] ❌ [VECTORDB] Search API error:', {
            status: resp.status,
            statusText: resp.statusText,
            detail: detail?.substring(0, 200),
          });
          sendResponse({ success: false, results: [], error: `API ${resp.status}` });
          return;
        }

        const result = await resp.json();
        const results = result?.results || [];
        
        console.log('[Background] ✅ [VECTORDB] Search success:', {
          resultCount: results.length,
        });

        sendResponse({ success: true, results });
      } catch (err) {
        console.warn('[Background] ❌ [VECTORDB] Search failed:', err);
        sendResponse({ success: false, results: [], error: err?.message || String(err) });
      }
    })();
    return true; // 异步响应
  }

  // 🆕 批量查询多个 URL 的 caption 和 tags
  if (message?.action === 'batch-get-vectordb-captions') {
    (async () => {
      try {
        const { urls } = message;
        if (!Array.isArray(urls) || urls.length === 0) {
          sendResponse({ success: true, results: [] });
          return;
        }

        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (!apiUrl) {
          sendResponse({ success: false, results: [], error: 'API base URL not configured' });
          return;
        }

        const userId = await getUserId();
        const batchUrl = `${apiUrl}/api/v1/search/batch-captions`;

        console.log('[Background] 📦 [VECTORDB] Batch captions request:', {
          url: batchUrl,
          urlCount: urls.length,
          userId,
        });

        const resp = await fetch(batchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
          },
          body: JSON.stringify({ urls }),
        });

        if (!resp.ok) {
          let detail = '';
          try { detail = await resp.text(); } catch (e) { detail = ''; }
          console.error('[Background] ❌ [VECTORDB] Batch captions API error:', {
            status: resp.status,
            statusText: resp.statusText,
            detail: detail?.substring(0, 200),
          });
          sendResponse({ success: false, results: [], error: `API ${resp.status}` });
          return;
        }

        const result = await resp.json();
        const results = result?.results || [];

        console.log('[Background] ✅ [VECTORDB] Batch captions success:', {
          resultCount: results.length,
        });

        sendResponse({ success: true, results });
      } catch (err) {
        console.warn('[Background] ❌ [VECTORDB] Batch captions failed:', err);
        sendResponse({ success: false, results: [], error: err?.message || String(err) });
      }
    })();
    return true; // 异步响应
  }

  // 🆕 从 vectordb 获取 URL 对应的 caption
  if (message?.action === 'get-vectordb-caption') {
    (async () => {
      try {
        const { url } = message;
        const apiUrl = API_CONFIG.getBaseUrlSync();
        if (!apiUrl) {
          sendResponse({ success: false, quickCaption: null, tags: [], error: 'API base URL not configured' });
          return;
        }

        const userId = await getUserId();
        // 使用搜索 API，通过 URL 过滤来查找特定 URL 的数据
        const searchUrl = `${apiUrl}/api/v1/search/query`;

        console.log('[Background] 📝 [VECTORDB] Get caption for URL:', url?.substring(0, 60));

        // 尝试通过搜索找到该 URL（使用 URL 的一部分作为查询）
        // 注意：这是一个临时方案，理想情况下应该有专门的端点
        const urlParts = url ? url.split('/').filter(p => p.length > 5) : [];
        const searchQuery = urlParts.length > 0 ? urlParts[urlParts.length - 1] : url?.substring(0, 50) || '';
        
        const resp = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
          },
          body: JSON.stringify({
            query: searchQuery,
            top_k: 50, // 获取更多结果以便找到匹配的 URL
            filter_urls: [url], // 只搜索这个 URL
          }),
        });

        if (!resp.ok) {
          let detail = '';
          try { detail = await resp.text(); } catch (e) { detail = ''; }
          console.error('[Background] ❌ [VECTORDB] Get caption API error:', {
            status: resp.status,
            statusText: resp.statusText,
            detail: detail?.substring(0, 200),
          });
          sendResponse({ success: false, quickCaption: null, tags: [], error: `API ${resp.status}` });
          return;
        }

        const result = await resp.json();
        const results = result?.results || [];
        
        // 查找完全匹配的 URL
        const matchedItem = results.find(item => {
          const itemUrl = item.url || item.original_image_url || item.image || '';
          return itemUrl === url || itemUrl.includes(url) || url.includes(itemUrl);
        });

        if (matchedItem) {
          const quickCaption = matchedItem.image_caption || '';
          const tags = [
            ...(matchedItem.style_tags || []),
            ...(matchedItem.object_tags || []),
          ];
          if (Array.isArray(matchedItem.dominant_colors)) {
            matchedItem.dominant_colors.forEach(c => {
              if (c && !tags.includes(c)) tags.push(c);
            });
          }

          console.log('[Background] ✅ [VECTORDB] Found caption for URL:', {
            url: url?.substring(0, 60),
            hasCaption: !!quickCaption,
            tagsCount: tags.length,
          });

          sendResponse({ success: true, quickCaption, tags });
        } else {
          console.log('[Background] ℹ️ [VECTORDB] No caption found for URL:', url?.substring(0, 60));
          sendResponse({ success: false, quickCaption: null, tags: [], error: 'Not found in vectordb' });
        }
      } catch (err) {
        console.warn('[Background] ❌ [VECTORDB] Get caption failed:', err);
        sendResponse({ success: false, quickCaption: null, tags: [], error: err?.message || String(err) });
      }
    })();
    return true; // 异步响应
  }
});

/**
 * 处理从右键菜单保存图片
 */
async function handleSaveImageFromContextMenu(req, sender, sendResponse) {
  try {
    const imageUrl = req.imageUrl;
    const tab = sender.tab;
    
    if (!imageUrl) {
      sendResponse({ success: false, error: 'No image URL' });
      return;
    }
    
    console.log('[Background] Saving image from context menu:', imageUrl);
    
    // 发送消息给 content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'save-image-from-context-menu',
      imageUrl: imageUrl,
    });
    
    if (response && response.success) {
      console.log('[Background] Image saved successfully');
      
      // 显示通知（可选）
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('static/img/icon-128.png'),
        title: 'Tab Cleaner',
        message: '图片已保存',
      });
      
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: response?.error || 'Save failed' });
    }
  } catch (error) {
    console.error('[Background] Failed to save image:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 简单图片指纹：基于 URL / Data URL 做轻量去重
 */
function generateImageFingerprint(imageValue) {
  if (!imageValue || typeof imageValue !== 'string') return null;
  try {
    if (imageValue.startsWith('data:')) {
      // Data URL：只取前 120 个字符即可，高度区分
      return imageValue.substring(0, 120);
    }
    // 普通 URL：去掉 query/hash，只保留 origin + path
    const url = new URL(imageValue, 'https://dummy-base.invalid');
    return url.origin + url.pathname;
  } catch (e) {
    // 兜底：直接截断字符串
    return imageValue.substring(0, 120);
  }
}

/**
 * 简单相似度计算：前缀匹配比例
 */
function computeFingerprintSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const minLen = Math.min(a.length, b.length);
  let same = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) same++;
  }
  return same / Math.max(a.length, b.length);
}

/**
 * ✅ 存储配额管理：检查图片是否需要压缩（在 content script 中压缩，这里只做检查）
 * 注意：background.js 是 service worker，无法使用 Image/Canvas，压缩应在 content script 中完成
 */
function shouldCompressImage(imageData) {
  if (!imageData || typeof imageData !== 'string') return false;
  
  // 如果不是 data URL，不需要压缩
  if (!imageData.startsWith('data:')) return false;
  
  // 如果已经是压缩过的（JPEG 0.7），且小于 200KB，不需要压缩
  if (imageData.includes('data:image/jpeg') && imageData.length < 200000) {
    return false;
  }
  
  // 如果超过 300KB，需要压缩
  return imageData.length > 300000;
}

/**
 * ✅ 存储配额管理：清理旧数据，限制每个 session 的卡片数量
 */
function cleanupSessionData(session, maxItemsPerSession = 200) {
  if (!session || !session.opengraphData) return session;
  
  // 如果超过限制，只保留最新的 N 个
  if (session.opengraphData.length > maxItemsPerSession) {
    console.log(`[Background] 🧹 Cleaning session: ${session.opengraphData.length} → ${maxItemsPerSession} items`);
    session.opengraphData = session.opengraphData.slice(0, maxItemsPerSession);
    session.tabCount = session.opengraphData.length;
  }
  
  return session;
}

/**
 * ✅ 存储配额管理：清理所有 sessions 的旧数据
 */
function cleanupAllSessions(sessions, maxSessions = 10, maxItemsPerSession = 120) {
  // 只保留最新的 N 个 sessions
  const limitedSessions = sessions.slice(0, maxSessions);
  
  // 清理每个 session 的旧数据
  return limitedSessions.map(session => cleanupSessionData(session, maxItemsPerSession));
}

/**
 * ✅ 存储配额管理：安全保存（带重试和自动清理）
 */
async function safeStorageSet(data, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await chrome.storage.local.set(data);
      return { success: true };
    } catch (error) {
      const isQuotaError = error.message && error.message.includes('quota');
      
      if (isQuotaError && attempt < maxRetries) {
        console.warn(`[Background] ⚠️ Storage quota exceeded (attempt ${attempt + 1}/${maxRetries + 1}), cleaning old data...`);
        
        // 如果是 sessions 数据，清理旧数据
        if (data.sessions && Array.isArray(data.sessions)) {
          const cleanedSessions = cleanupAllSessions(data.sessions, 10, 120);
          data.sessions = cleanedSessions;
          continue; // 重试
        }
      }
      
      // 最后一次尝试失败，或非配额错误
      throw error;
    }
  }
}

/**
 * 处理保存采集的图片（拖拽、悬停、截图等）
 */
async function handleSaveCapturedImage(req, sender, sendResponse) {
  try {
    const ogData = req.data;
    
    if (!ogData || !ogData.image) {
      sendResponse({ success: false, error: 'No image data' });
      return;
    }
    
    console.log('[Background] Saving captured image:', ogData.url);
    
    // ✅ 存储配额管理：检查图片大小，如果过大则警告（压缩应在 content script 中完成）
    if (shouldCompressImage(ogData.image)) {
      console.warn(`[Background] ⚠️ Large image detected (${(ogData.image.length / 1024).toFixed(1)}KB), should be compressed in content script`);
      // 注意：这里不压缩，因为 service worker 无法使用 Image/Canvas
      // 压缩应该在 image_capture_enhanced.js 或 screenshot_capture.js 中完成
    }
    
    // 获取或创建当前 session
    const storageResult = await chrome.storage.local.get(['sessions', 'currentSessionId']);
    const sessions = storageResult.sessions || [];
    let currentSessionId = storageResult.currentSessionId;
    
    // 如果没有 session，创建一个新的
    if (!currentSessionId || sessions.length === 0) {
      const newSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: '洗衣筐1',
        createdAt: Date.now(),
        opengraphData: [],
        tabCount: 0,
      };
      sessions.unshift(newSession);
      currentSessionId = newSession.id;
      await safeStorageSet({ 
        sessions,
        currentSessionId 
      });
    }
    
    // 找到当前 session
    const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
    if (sessionIndex === -1) {
      sendResponse({ success: false, error: 'Session not found' });
      return;
    }
    
    const session = sessions[sessionIndex];

    // 先基于"图片指纹"做一次智能去重（覆盖 dataURL / 普通 URL）
    const imageFingerprint = generateImageFingerprint(ogData.image);
    if (imageFingerprint) {
      const DUP_THRESHOLD = 0.98; // 98% 以上认为是重复
      for (const item of session.opengraphData) {
        if (!item) continue;
        const existingImage = item.image || item.imageUrl || null;
        const existingFp = item.imageFingerprint || generateImageFingerprint(existingImage);
        if (!existingFp) continue;
        const sim = computeFingerprintSimilarity(imageFingerprint, existingFp);
        if (sim >= DUP_THRESHOLD) {
          console.log('[Background] 🔁 Duplicate image detected, skip saving');
          sendResponse({
            success: false,
            error: 'Duplicate image',
            duplicate: true,
          });
          return;
        }
      }
    }
    
    // URL 维度的旧去重逻辑（兼容之前的数据结构）
    const existingIndex = session.opengraphData.findIndex(item => item.url === ogData.url);
    
    if (existingIndex !== -1) {
      // 更新现有项
      session.opengraphData[existingIndex] = {
        ...session.opengraphData[existingIndex],
        ...ogData,
        imageFingerprint: imageFingerprint || session.opengraphData[existingIndex].imageFingerprint || null,
        timestamp: Date.now(),
      };
    } else {
      // 添加新项
      session.opengraphData.unshift({
        ...ogData,
        imageFingerprint,
        id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
      session.tabCount = session.opengraphData.length;
    }
    
    // ✅ 存储配额管理：清理当前 session 的旧数据（限制每个 session 最多 120 个卡片）
    cleanupSessionData(session, 120);
    
    // ✅ 存储配额管理：在写入前，对所有 sessions 做一次全局清理（最多 10 个 session，每个 120 条）
    sessions[sessionIndex] = session;
    const cleanedSessionsBeforeSave = cleanupAllSessions(sessions, 10, 120);
    await safeStorageSet({ sessions: cleanedSessionsBeforeSave });
    
    console.log('[Background] ✅ Captured image saved to session:', currentSessionId);
    
    // 异步发送到后端生成 embedding（如果配置了 API）
    const apiUrl = API_CONFIG.getBaseUrlSync();
    if (apiUrl) {
      (async () => {
        try {
          // ✅ 获取用户ID并添加到请求头
          const userId = await getUserId();
          const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
          const embedResponse = await fetch(embeddingUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-User-ID': userId  // ✅ 添加用户ID header
            },
            body: JSON.stringify({
              opengraph_items: [ogData]
            }),
          });
          
          if (embedResponse.ok) {
            const embedData = await embedResponse.json();
            if (embedData.data && embedData.data.length > 0) {
              // 更新 session 中的 embedding 数据
              const updatedSessions = await chrome.storage.local.get(['sessions']);
              const updatedSessionList = updatedSessions.sessions || [];
              const updatedSessionIdx = updatedSessionList.findIndex(s => s.id === currentSessionId);
              
              if (updatedSessionIdx !== -1) {
                const updatedSession = updatedSessionList[updatedSessionIdx];
                const embedItem = embedData.data[0];
                const itemIndex = updatedSession.opengraphData.findIndex(item => item.url === ogData.url);
                
                if (itemIndex !== -1 && (embedItem.text_embedding || embedItem.image_embedding)) {
                  updatedSession.opengraphData[itemIndex] = {
                    ...updatedSession.opengraphData[itemIndex],
                    text_embedding: embedItem.text_embedding,
                    image_embedding: embedItem.image_embedding,
                  };
                  
                  updatedSessionList[updatedSessionIdx] = updatedSession;
                  await chrome.storage.local.set({ sessions: updatedSessionList });
                  console.log('[Background] ✅ Embedding generated for captured image');
                }
              }
            }
          }
        } catch (error) {
          console.warn('[Background] Failed to generate embedding for captured image:', error);
        }
      })();
    }
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Failed to save captured image:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 处理截图选择请求（框选截图）
 * @param {Object} req - 请求对象
 * @param {Object} sender - 发送者信息
 * @param {Function} sendResponse - 响应函数
 */
async function handleScreenshotSelection(req, sender, sendResponse) {
  try {
    const { bounds } = req;
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }
    
    console.log('[Background] 📸 Capturing screenshot selection:', bounds);
    
    // 获取当前窗口
    const currentWindow = await chrome.windows.getCurrent();
    
    // 确保标签页是活动的
    await chrome.tabs.update(tabId, { active: true });
    
    // 等待标签页激活
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 截图整个可见区域
    const fullScreenshot = await chrome.tabs.captureVisibleTab(currentWindow.id, {
      format: 'png',
      quality: 100, // 高质量
    });
    
    // 返回全屏截图，让 content script 裁剪
    sendResponse({
      success: true,
      dataUrl: fullScreenshot,
      needsCrop: true, // 标记需要裁剪
      bounds: bounds,
    });
    
    console.log('[Background] ✅ Screenshot captured, needs crop');
  } catch (error) {
    console.error('[Background] ❌ Screenshot selection failed:', error);
    sendResponse({
      success: false,
      error: error.message || 'Screenshot failed',
    });
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
  
  // 🆕 步骤0：激活 tab（对于 Pinterest/小红书等 SPA 站点必须）
  // 确保视口内容是最新的，图片已正确渲染
  try {
    // 先激活 tab
    await chrome.tabs.update(tab.id, { active: true });
    console.log(`[Collect] 🔄 Tab activation requested: ${tab.id}`);
    
    // 等待 tab 激活（浏览器需要时间切换）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 等待页面渲染稳定（SPA 网站需要更长时间）
    // 特别是小红书、Pinterest 等需要等待图片加载
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    // 额外等待：确保图片已加载到 DOM
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`[Collect] ✅ Tab activated and rendered: ${tab.id} (total wait: 2000ms)`);
  } catch (e) {
    console.warn(`[Collect] Failed to activate tab ${tab.id}:`, e);
    // 即使失败也继续，但等待一段时间
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // ✅ 步骤1：v2 版本已通过 manifest.json 作为 content script 加载，并通过 content.js 注入到页面上下文
  // 使用 executeScript 在页面上下文中调用 v2 API（world: 'MAIN' 访问页面上下文）
  let ogData = null;
  
  try {
    // 等待脚本加载（v2 通过 content.js 注入到页面上下文）
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ✅ 步骤1.5：对于 Pinterest 等 SPA，确保 URL 匹配
    try {
      const currentTab = await chrome.tabs.get(tab.id);
      if (currentTab.url !== tab.url) {
        console.log(`[Collect] ⚠️ Tab URL changed: ${tab.url} -> ${currentTab.url}`);
        tab = currentTab;
      }
    } catch (e) {
      console.warn(`[Collect] Failed to sync URL:`, e);
    }
    
    // 步骤2：通过 executeScript 在页面上下文中调用 v2 版本的提取函数
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN', // ✅ 关键：使用 MAIN world 访问页面上下文
      func: async () => {
        // 🆕 设置快速模式标志（清理操作时跳过 Data URL 转换）
        window.__TAB_CLEANER_QUICK_MODE = true;
        
        try {
          // 优先使用 v2 版本的增强 API
          if (window.__TAB_CLEANER_OG_ENHANCED && window.__TAB_CLEANER_OG_ENHANCED.extract) {
            console.log('[Collect] Using v2 enhanced API (quick mode)');
            const result = await window.__TAB_CLEANER_OG_ENHANCED.extract();
            return result;
          }
          // 降级到兼容 API
          if (window.__TAB_CLEANER_GET_OPENGRAPH) {
            console.log('[Collect] Using v2 compatible API (quick mode)');
            return await window.__TAB_CLEANER_GET_OPENGRAPH(true); // waitForLoad = true
          }
          console.warn('[Collect] ⚠️ v2 API not available');
          return null;
        } finally {
          // 清理标志
          delete window.__TAB_CLEANER_QUICK_MODE;
        }
      }
    });
    
    if (results && results[0] && results[0].result) {
      ogData = results[0].result;
      console.log(`[Collect] ✅ Got OG data via v2 API for ${tab.url.substring(0, 50)}...`);
    } else {
      console.warn(`[Collect] ⚠️ v2 API returned no data`);
    }
  } catch (e) {
    console.warn(`[Collect] Failed to extract via v2 API:`, e);
    // 如果 v2 API 失败，尝试通过消息方式（兼容旧版本）
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'extract-opengraph-with-wait',
        maxWaitTime: 8000,
        forceReextract: true
      });
      
      // 轮询等待（最多 8 秒）
      const maxWaitTime = 8000;
      const startTime = Date.now();
      const checkInterval = 500;
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const status = await chrome.tabs.sendMessage(tab.id, {
            action: 'get-opengraph-status'
          });
          
          if (status?.data?.image && status.data.image.trim()) {
            ogData = status.data;
            break;
          }
          
          if (status?.completed && !status?.data?.image) {
            if (status.data) {
              ogData = status.data;
            }
            break;
          }
        } catch (e) {
          console.debug(`[Collect] Waiting for OG extraction... (${Date.now() - startTime}ms elapsed)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    } catch (msgError) {
      console.warn(`[Collect] Message-based extraction also failed:`, msgError);
    }
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
  
  // 处理截图选择请求
  if (req.action === "capture-screenshot-selection") {
    handleScreenshotSelection(req, sender, sendResponse);
    return true; // 异步响应
  }

  // 🆕 图片代理：解决 CSP/CORS，返回 dataURL
  if (req.action === "fetchImage" && req.url) {
    fetchImageAsDataUrl(req.url)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(error => sendResponse({ success: false, error: error.message || String(error) }));
    return true; // 异步
  }

  // 🦅 Eagle Storage: 下载图片为 Data URL（用于永久保存）
  if (req.action === "download-image-as-dataurl" && req.url) {
    fetchImageAsDataUrl(req.url)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(error => sendResponse({ success: false, error: error.message || String(error) }));
    return true; // 异步
  }
  
  // 注册右键菜单
  if (req.action === "register-context-menu") {
    createContextMenus();
    sendResponse({ success: true });
    return true;
  }
  
  // 处理右键菜单点击
  if (req.action === "save-image-from-context-menu") {
    handleSaveImageFromContextMenu(req, sender, sendResponse);
    return true; // 异步响应
  }
  
  // 处理前端日志上报（image capture / screenshot）
  if (req.action === "image-capture-log") {
    console.log("[Image Capture Log][BG]", req.type, req.payload);
    sendResponse && sendResponse({ success: true });
    return true;
  }
  
  // 处理保存采集的图片（从 image_capture_enhanced.js 或 screenshot_capture.js）
  if (req.action === "save-captured-image") {
    handleSaveCapturedImage(req, sender, sendResponse);
    return true; // 异步响应
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
  
  // 处理桌宠设置按钮（redirect到个人空间的桌宠切换页面）
  if (req.action === "pet-setting") {
    console.log("[Tab Cleaner Background] Opening pet setting page...");
    try {
      // 打开个人空间，并传递参数指示打开宠物设置页面
      chrome.tabs.create({
        url: chrome.runtime.getURL("personalspace.html#pet-setting")
      }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error("[Tab Cleaner Background] Failed to create tab:", chrome.runtime.lastError);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, tabId: tab?.id });
        }
      });
    } catch (error) {
      console.error("[Tab Cleaner Background] Error opening pet setting:", error);
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

        // ✅ 步骤 1: 串行收集 OpenGraph（每个 tab 需要激活后才能准确取图）
        // 🆕 改为串行处理，因为 Pinterest/小红书等 SPA 需要 tab 激活才能正确渲染图片
        console.log(`[Tab Cleaner Background] Collecting OpenGraph SEQUENTIALLY for ${uniqueTabs.length} tabs...`);
        const localOGResults = [];
        
        // 🆕 全局超时：如果整个清理过程超过 5 分钟，强制完成
        const globalTimeout = 5 * 60 * 1000; // 5 分钟
        const globalStartTime = Date.now();
        
        for (let index = 0; index < uniqueTabs.length; index++) {
          // 🆕 检查全局超时
          if (Date.now() - globalStartTime > globalTimeout) {
            console.warn(`[Tab Cleaner Background] ⚠️ Global timeout reached (5min), stopping collection. Processed ${index}/${uniqueTabs.length} tabs.`);
            // 为剩余 tab 创建占位记录
            for (let j = index; j < uniqueTabs.length; j++) {
              localOGResults.push({
                status: 'fulfilled',
                value: {
                  url: uniqueTabs[j].url,
                  title: uniqueTabs[j].title || uniqueTabs[j].url,
                  tab_id: uniqueTabs[j].id,
                  tab_title: uniqueTabs[j].title,
                  success: false,
                  error: 'Global timeout - collection stopped',
                  id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                }
              });
            }
            break;
          }
          
          const tab = uniqueTabs[index];
          console.log(`[Tab Cleaner Background] Processing tab ${index + 1}/${uniqueTabs.length}: ${tab.url.substring(0, 50)}...`);
          
          try {
            // 🆕 单个 tab 超时：如果单个 tab 收集超过 30 秒，跳过
            const tabTimeout = 30 * 1000; // 30 秒
            const tabStartTime = Date.now();
            
            const ogDataPromise = collectTabWithGuaranteedImage(tab);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Tab collection timeout (30s)')), tabTimeout)
            );
            
            let ogData;
            try {
              ogData = await Promise.race([ogDataPromise, timeoutPromise]);
            } catch (timeoutError) {
              console.error(`[Tab Cleaner Background] ⚠️ Tab ${index + 1} collection timeout:`, timeoutError.message);
              ogData = {
                url: tab.url,
                title: tab.title || tab.url,
                success: false,
                error: `Collection timeout after ${tabTimeout / 1000}s`,
                image: '',
              };
            }
            
            // 添加调试日志
            console.log(`[Tab Cleaner Background] Collection result for ${tab.url.substring(0, 50)}...:`, {
              success: ogData?.success,
              hasTitle: !!(ogData?.title),
              hasImage: !!(ogData?.image),
              hasThumbnail: !!(ogData?.thumbnail),
              isScreenshot: ogData?.is_screenshot || false,
              title: ogData?.title?.substring(0, 50),
              image: ogData?.image ? (ogData.image.substring(0, 50) + '...') : null,
              error: ogData?.error
            });
            
            if (ogData) {
              localOGResults.push({
                status: 'fulfilled',
                value: { 
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
                }
              });
            } else {
              // 如果 ogData 为空，创建一个基础记录
              localOGResults.push({
                status: 'fulfilled',
                value: {
                  url: tab.url,
                  title: tab.title || tab.url,
                  tab_id: tab.id,
                  tab_title: tab.title,
                  success: false,
                  error: 'Collection returned empty',
                  is_doc_card: false,
                  id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                }
              });
            }
          } catch (error) {
            console.error(`[Tab Cleaner Background] Collection failed for ${tab.url}:`, error);
            // 记录失败的结果
            localOGResults.push({
              status: 'fulfilled',
              value: {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: error.message,
                is_doc_card: false,
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              }
            });
          }
        }

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
          firstSessionItemCount: opengraphItems[0] ? opengraphItems[0].length : 0
        });
        
        await chrome.storage.local.set({ 
          sessions: updatedSessions,
          lastCleanTime: Date.now(),
          currentSessionId: sessionId,
        });

        console.log(`[Tab Cleaner Background] ✓ Session saved immediately (${opengraphItems.length} items)`);
        
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
              const successfulItems = itemsWithIds.filter(item => item.success);
              if (successfulItems.length === 0) {
                console.log(`[Tab Cleaner Background] No successful items to generate embeddings for`);
                return;
              }

              // ✅ 规范化函数：确保 image 是字符串，不是数组
              const normalizeItem = (item) => {
                const pageUrl = String(item.url || item.page_url || '').trim();
                let image = item.original_image_url || item.image;
                // ✅ 关键：确保 image 是字符串，不是数组
                if (image) {
                  if (Array.isArray(image)) {
                    image = image.length > 0 ? String(image[0]).trim() : null;
                  } else if (typeof image === 'string') {
                    image = image.trim() || null;
                  } else {
                    image = String(image).trim() || null;
                  }
                }

                const normalized = {
                  url: pageUrl,
                  title: item.title ? String(item.title).trim() : null,
                  description: item.description ? String(item.description).trim() : null,
                  image: image || null,
                  original_image_url: image || null,
                  site_name: item.site_name ? String(item.site_name).trim() : null,
                  tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                  tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                  is_doc_card: Boolean(item.is_doc_card || false),
                  is_screenshot: Boolean(item.is_screenshot || false),
                  success: Boolean(item.success !== undefined ? item.success : true),
                  metadata: {
                    page_url: pageUrl || null,
                    pageUrl: pageUrl || null,
                    url: pageUrl || null,
                    image: image || null,
                    original_image_url: image || null,
                    originalImageUrl: image || null,
                  },
                };
                
                return normalized;
              };
              
              // 批量生成 embedding（每批 5 个，避免过载）
              // ✅ 获取用户ID（在循环外获取一次，避免重复调用）
              const userId = await getUserId();
              const batchSize = 5;
              for (let i = 0; i < successfulItems.length; i += batchSize) {
                const batch = successfulItems.slice(i, i + batchSize);
                try {
                  // ✅ 规范化每个项
                  const normalizedBatch = batch.map(normalizeItem);
                  
                  const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
                  const embedResponse = await fetch(embeddingUrl, {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'X-User-ID': userId  // ✅ 添加用户ID header
                    },
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
          // ✅ 确保新卡片有时间戳
          const newItem = {
            ...item,
            timestamp: Date.now(),
            created_at: Date.now(),
            id: item.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          const newSession = {
            id: sessionId,
            name: '洗衣筐1',
            createdAt: Date.now(),
            opengraphData: [newItem],
            tabCount: 1,
          };
          await chrome.storage.local.set({ 
            sessions: [newSession],
            currentSessionId: sessionId,
          });
        } else {
          // 归档到最新的 session（第一个，因为按时间倒序）
          const latestSession = existingSessions[0];
          // ✅ 确保新卡片有时间戳，并添加到数组开头（排在最前面）
          const newItem = {
            ...item,
            timestamp: Date.now(),
            created_at: Date.now(),
            id: item.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          // ✅ 新卡片添加到数组开头，确保排在最前面
          const updatedData = [newItem, ...(latestSession.opengraphData || [])];
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
        
        // ✅ 关闭当前 tab
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

        // ✅ 打开个人空间（redirect）
        try {
          await chrome.tabs.create({
            url: chrome.runtime.getURL("personalspace.html")
          });
          console.log('[Tab Cleaner Background] ✓ Personal space opened after cleaning current tab');
        } catch (tabError) {
          console.warn('[Tab Cleaner Background] Failed to open personal space:', tabError);
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

        // ✅ 步骤 1: 串行收集 OpenGraph（每个 tab 需要激活后才能准确取图）
        // 🆕 改为串行处理，确保每个 tab 都被正确激活，避免并发冲突
        console.log(`[Tab Cleaner Background] Collecting OpenGraph SEQUENTIALLY for ${uniqueTabs.length} tabs...`);
        const localOGResults = [];
        
        // 🆕 全局超时：如果整个清理过程超过 5 分钟，强制完成
        const globalTimeout = 5 * 60 * 1000; // 5 分钟
        const globalStartTime = Date.now();
        
        for (let index = 0; index < uniqueTabs.length; index++) {
          // 🆕 检查全局超时
          if (Date.now() - globalStartTime > globalTimeout) {
            console.warn(`[Tab Cleaner Background] ⚠️ Global timeout reached (5min), stopping collection. Processed ${index}/${uniqueTabs.length} tabs.`);
            // 为剩余 tab 创建占位记录
            for (let j = index; j < uniqueTabs.length; j++) {
              localOGResults.push({
                status: 'fulfilled',
                value: {
                  url: uniqueTabs[j].url,
                  title: uniqueTabs[j].title || uniqueTabs[j].url,
                  tab_id: uniqueTabs[j].id,
                  tab_title: uniqueTabs[j].title,
                  success: false,
                  error: 'Global timeout - collection stopped',
                  id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                }
              });
            }
            break;
          }
          
          const tab = uniqueTabs[index];
          console.log(`[Tab Cleaner Background] Processing tab ${index + 1}/${uniqueTabs.length}: ${tab.url.substring(0, 50)}...`);
          
          try {
            // 🆕 单个 tab 超时：如果单个 tab 收集超过 30 秒，跳过
            const tabTimeout = 30 * 1000; // 30 秒
            const tabStartTime = Date.now();
            
            const ogDataPromise = collectTabWithGuaranteedImage(tab);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Tab collection timeout (30s)')), tabTimeout)
            );
            
            let ogData;
            try {
              ogData = await Promise.race([ogDataPromise, timeoutPromise]);
            } catch (timeoutError) {
              console.error(`[Tab Cleaner Background] ⚠️ Tab ${index + 1} collection timeout:`, timeoutError.message);
              ogData = {
                url: tab.url,
                title: tab.title || tab.url,
                success: false,
                error: `Collection timeout after ${tabTimeout / 1000}s`,
                image: '',
              };
            }
            
            // 添加调试日志
            console.log(`[Tab Cleaner Background] Collection result for ${tab.url.substring(0, 50)}...:`, {
              success: ogData?.success,
              hasTitle: !!(ogData?.title),
              hasImage: !!(ogData?.image),
              isScreenshot: ogData?.is_screenshot || false,
              title: ogData?.title?.substring(0, 50),
              image: ogData?.image ? (ogData.image.substring(0, 50) + '...') : null,
              error: ogData?.error,
              elapsedTime: Date.now() - tabStartTime
            });
            
            if (ogData) {
              localOGResults.push({
                status: 'fulfilled',
                value: { 
                  ...ogData, 
                  tab_id: tab.id, 
                  tab_title: tab.title,
                  id: ogData.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  // 确保有 URL 和 title
                  url: ogData.url || tab.url,
                  title: ogData.title || tab.title || tab.url,
                  is_local_fetch: true,
                }
              });
            } else {
              // 如果 ogData 为空，创建一个基础记录
              localOGResults.push({
                status: 'fulfilled',
                value: {
                  url: tab.url,
                  title: tab.title || tab.url,
                  tab_id: tab.id,
                  tab_title: tab.title,
                  success: false,
                  error: 'Collection returned empty',
                  id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                }
              });
            }
          } catch (error) {
            console.error(`[Tab Cleaner Background] Collection failed for ${tab.url}:`, error);
            // 记录失败的结果
            localOGResults.push({
              status: 'fulfilled',
              value: {
                url: tab.url,
                title: tab.title || tab.url,
                tab_id: tab.id,
                tab_title: tab.title,
                success: false,
                error: error.message,
                id: `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              }
            });
          }
          
          // 每个 tab 之间稍作延迟，避免过快切换
          if (index < uniqueTabs.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

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
        
        // 🆕 步骤 2.5: 清理未被收入个人空间的 IndexedDB 数据（在 background 上下文中执行）
        // 注意：background.js 可以访问 chrome.storage.local，所以在这里执行清理
        (async () => {
          try {
            // 在 background 上下文中，我们需要通过 executeScript 在页面上下文中执行清理
            // 或者直接在 background 中实现清理逻辑
            // 由于 cleanupUnusedImages 需要访问 chrome.storage.local，我们在 background 中实现
            console.log(`[Tab Cleaner Background] 🧹 Starting IndexedDB cleanup from background context...`);
            
            // 获取所有 sessions
            const storageResult = await chrome.storage.local.get(['sessions']);
            const sessions = storageResult.sessions || [];
            
            // 收集所有被引用的图片 hash 和 URL
            const referencedHashes = new Set();
            const referencedUrls = new Set();
            
            sessions.forEach(session => {
              if (session?.opengraphData) {
                session.opengraphData.forEach(item => {
                  if (item.image && item.image.startsWith('eagle://')) {
                    const hash = item.image.replace('eagle://', '');
                    referencedHashes.add(hash);
                  }
                  if (item.original_image_url) {
                    referencedUrls.add(item.original_image_url);
                  }
                });
              }
            });
            
            console.log(`[Tab Cleaner Background] 🧹 Found ${referencedHashes.size} referenced hashes, ${referencedUrls.size} referenced URLs`);
            
            // 通过 executeScript 在任意标签页中执行 IndexedDB 清理
            // 注意：IndexedDB 是每个源（origin）共享的，所以可以在任意标签页中执行
            try {
              const tabs = await chrome.tabs.query({});
              if (tabs.length > 0) {
                // 使用第一个标签页执行清理（IndexedDB 是共享的）
                await chrome.scripting.executeScript({
                  target: { tabId: tabs[0].id },
                  func: async (hashes, urls) => {
                    if (!window.__TAB_CLEANER_EAGLE_STORAGE || !window.__TAB_CLEANER_EAGLE_STORAGE.initDB) {
                      return { error: 'Eagle Storage not available' };
                    }
                    
                    await window.__TAB_CLEANER_EAGLE_STORAGE.initDB();
                    const db = window.__TAB_CLEANER_EAGLE_STORAGE._db || null;
                    if (!db) {
                      return { error: 'IndexedDB not initialized' };
                    }
                    
                    // 获取所有图片
                    const allImages = await new Promise((resolve, reject) => {
                      const transaction = db.transaction(['images'], 'readonly');
                      const store = transaction.objectStore('images');
                      const request = store.getAll();
                      request.onsuccess = () => resolve(request.result || []);
                      request.onerror = () => reject(new Error('Failed to get all images'));
                    });
                    
                    // 找出未引用的图片
                    const unusedImages = allImages.filter(img => {
                      if (hashes.includes(img.hash)) return false;
                      if (urls.includes(img.originalUrl)) return false;
                      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                      if (img.timestamp && img.timestamp > sevenDaysAgo) return false;
                      return true;
                    });
                    
                    // 删除未引用的图片
                    if (unusedImages.length > 0) {
                      await Promise.all(unusedImages.map(img => {
                        return new Promise((resolve, reject) => {
                          const transaction = db.transaction(['images'], 'readwrite');
                          const store = transaction.objectStore('images');
                          const request = store.delete(img.hash);
                          request.onsuccess = () => resolve();
                          request.onerror = () => reject(new Error(`Failed to delete ${img.hash}`));
                        });
                      }));
                    }
                    
                    return {
                      total: allImages.length,
                      referenced: hashes.length + urls.length,
                      deleted: unusedImages.length,
                      remaining: allImages.length - unusedImages.length,
                    };
                  },
                  args: [Array.from(referencedHashes), Array.from(referencedUrls)],
                });
                
                console.log(`[Tab Cleaner Background] ✅ IndexedDB cleanup completed`);
              }
            } catch (cleanupError) {
              console.warn('[Tab Cleaner Background] ⚠️ IndexedDB cleanup failed:', cleanupError);
            }
          } catch (cleanupError) {
            console.warn('[Tab Cleaner Background] ⚠️ IndexedDB cleanup error:', cleanupError);
          }
        })();
        
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

        // ✅ 步骤 6: 缩略图、颜色提取和 caption 生成已优化
        // 🆕 优化：不再在 background.js 中批量处理
        // - 缩略图和颜色提取：由 PersonalSpace 的 SessionCard 在渲染时自动生成（从 IndexedDB 读取，无 CORS）
        // - Caption 生成：由 SessionCard 生成缩略图后自动发送到后端
        // 这样更高效：只在需要显示时才处理，且图片数据已经在 IndexedDB 中，无需再次 fetch
        console.log(`[Tab Cleaner Background] ℹ️ Thumbnail, colors, and caption will be generated on-demand in PersonalSpace (from IndexedDB)`);

        sendResponse({ ok: true, data: { items: opengraphItems, sessionId } });
      } catch (error) {
        console.error('[Tab Cleaner Background] Failed to clean all tabs:', error);
        
        // 🆕 兜底方案：即使出错，也尝试保存已收集的数据并打开个人空间
        try {
          // 尝试保存部分数据（如果有的话）
          const storageResult = await chrome.storage.local.get(['sessions']);
          const existingSessions = storageResult.sessions || [];
          
          // 检查是否有部分收集的数据可以保存
          if (localOGResults && localOGResults.length > 0) {
            const partialItems = localOGResults
              .map((result) => {
                if (result.status === 'fulfilled' && result.value) {
                  return result.value;
                }
                return null;
              })
              .filter(item => item !== null);
            
            if (partialItems.length > 0) {
              console.log(`[Tab Cleaner Background] 🆕 Fallback: Saving ${partialItems.length} partially collected items...`);
              
              const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
                opengraphData: partialItems,
                tabCount: partialItems.length,
              };
              
              const updatedSessions = [newSession, ...existingSessions];
              await chrome.storage.local.set({ 
                sessions: updatedSessions,
                lastCleanTime: Date.now(),
                currentSessionId: sessionId,
              });
              
              console.log(`[Tab Cleaner Background] ✅ Fallback: Saved ${partialItems.length} items`);
            }
          }
          
          // 打开个人空间
          await chrome.tabs.create({
            url: chrome.runtime.getURL("personalspace.html")
          });
          console.log(`[Tab Cleaner Background] ✅ Fallback: Personal space opened`);
        } catch (fallbackError) {
          console.error('[Tab Cleaner Background] ❌ Fallback also failed:', fallbackError);
        }
        
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
          // ✅ 确保新卡片有时间戳
          const newOgData = {
            ...ogData,
            timestamp: Date.now(),
            created_at: Date.now(),
            id: ogData.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          const newSession = {
            id: sessionId,
            name: '洗衣筐1',
            createdAt: Date.now(),
            opengraphData: [newOgData],
            tabCount: 1,
          };
          await chrome.storage.local.set({ 
            sessions: [newSession],
            currentSessionId: sessionId,
          });
        } else {
          // ✅ 添加到最新 session，新卡片排在最前面
          const latestSession = existingSessions[0];
          // ✅ 确保新卡片有时间戳
          const newOgData = {
            ...ogData,
            timestamp: Date.now(),
            created_at: Date.now(),
            id: ogData.id || `og_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          // ✅ 新卡片添加到数组开头，确保排在最前面
          const updatedData = [newOgData, ...(latestSession.opengraphData || [])];
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
              const pageUrl = String(item.url || item.page_url || '').trim();
              let image = item.original_image_url || item.image;
              // ✅ 关键：确保 image 是字符串，不是数组
              if (image) {
                if (Array.isArray(image)) {
                  image = image.length > 0 ? String(image[0]).trim() : null;
                } else if (typeof image === 'string') {
                  image = image.trim() || null;
                } else {
                  image = String(image).trim() || null;
                }
              }

              const normalized = {
                url: pageUrl,
                title: item.title ? String(item.title).trim() : null,
                description: item.description ? String(item.description).trim() : null,
                image: image || null,
                original_image_url: image || null,
                site_name: item.site_name ? String(item.site_name).trim() : null,
                tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
                tab_title: item.tab_title ? String(item.tab_title).trim() : null,
                is_doc_card: Boolean(item.is_doc_card || false),
                is_screenshot: Boolean(item.is_screenshot || false),
                success: Boolean(item.success !== undefined ? item.success : true),
                metadata: {
                  page_url: pageUrl || null,
                  pageUrl: pageUrl || null,
                  url: pageUrl || null,
                  image: image || null,
                  original_image_url: image || null,
                  originalImageUrl: image || null,
                },
              };
              
              return normalized;
            };
            
            const normalizedOgData = normalizeItem(ogData);
            
            // ✅ 获取用户ID并添加到请求头
            const userId = await getUserId();
            const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
            
            // ✅ 添加详细日志
            console.log(`[Tab Cleaner Background] 📤 Sending preview item to backend:`, {
              url: embeddingUrl,
              userId: userId,  // ✅ 记录用户ID
              item: {
                url: normalizedOgData.url,
                hasTitle: !!(normalizedOgData.title),
                hasImage: !!(normalizedOgData.image),
                image: normalizedOgData.image ? normalizedOgData.image.substring(0, 60) + '...' : null
              }
            });
            
            fetch(embeddingUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-User-ID': userId  // ✅ 添加用户ID header
              },
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
          const pageUrl = String(item.url || item.page_url || '').trim();
          let image = item.original_image_url || item.image;
          // ✅ 关键：确保 image 是字符串，不是数组
          if (image) {
            if (Array.isArray(image)) {
              image = image.length > 0 ? String(image[0]).trim() : null;
            } else if (typeof image === 'string') {
              image = image.trim() || null;
            } else {
              image = String(image).trim() || null;
            }
          }

          const normalized = {
            url: pageUrl,
            title: item.title ? String(item.title).trim() : null,
            description: item.description ? String(item.description).trim() : null,
            image: image || null,
            original_image_url: image || null,
            site_name: item.site_name ? String(item.site_name).trim() : null,
            tab_id: item.tab_id !== undefined && item.tab_id !== null ? Number(item.tab_id) : null,
            tab_title: item.tab_title ? String(item.tab_title).trim() : null,
            is_doc_card: Boolean(item.is_doc_card || false),
            is_screenshot: Boolean(item.is_screenshot || false),
            success: Boolean(item.success !== undefined ? item.success : true),
            metadata: {
              page_url: pageUrl || null,
              pageUrl: pageUrl || null,
              url: pageUrl || null,
              image: image || null,
              original_image_url: image || null,
              originalImageUrl: image || null,
            },
          };
          
          return normalized;
        };
        
        const normalizedItem = normalizeItem(ogData);
        // ✅ 获取用户ID并添加到请求头
        const userId = await getUserId();
        const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
        
        console.log('[Tab Cleaner Background] 📤 Sending OG data to backend for embedding:', {
          url: embeddingUrl,
          userId: userId,  // ✅ 记录用户ID
          item: {
            url: normalizedItem.url,
            hasTitle: !!(normalizedItem.title),
            hasImage: !!(normalizedItem.image),
            image: normalizedItem.image ? normalizedItem.image.substring(0, 60) + '...' : null
          }
        });
        
        const response = await fetch(embeddingUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-User-ID': userId  // ✅ 添加用户ID header
          },
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

