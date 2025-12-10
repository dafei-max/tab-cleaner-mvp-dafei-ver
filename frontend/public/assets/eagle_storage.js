/**
 * Tab Cleaner - Eagle 式本地图片存储
 * 
 * 🎯 目标：
 * 像 Eagle 一样，将图片永久保存到本地，彻底解决 CORS 问题
 * 
 * 📋 架构：
 * 1. 保存时：下载图片到 IndexedDB（Base64 Data URL）
 * 2. 显示时：从 IndexedDB 读取（永不过期）
 * 3. 颜色提取：直接从本地数据提取（永远成功）
 * 
 * 💾 存储结构：
 * IndexedDB: tab_cleaner_images
 *   - key: image_hash (URL 的 hash)
 *   - value: { dataUrl, timestamp, originalUrl, colors }
 */

(function() {
  'use strict';

  console.log('[Eagle Storage] 🦅 Initializing...');

  // ==================== IndexedDB 管理 ====================
  
  const DB_NAME = 'tab_cleaner_images';
  const DB_VERSION = 2; // 🆕 升级版本以添加新字段
  const STORE_NAME = 'images';
  
  let db = null;
  
  /**
   * 初始化 IndexedDB
   */
  async function initDB() {
    if (db) {
      // 🆕 确保 _db 引用已更新
      if (window.__TAB_CLEANER_EAGLE_STORAGE) {
        window.__TAB_CLEANER_EAGLE_STORAGE._db = db;
      }
      return db;
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        reject(new Error('IndexedDB open failed'));
      };
      
      request.onsuccess = () => {
        db = request.result;
        // 🆕 保存 db 引用供外部使用
        if (window.__TAB_CLEANER_EAGLE_STORAGE) {
          window.__TAB_CLEANER_EAGLE_STORAGE._db = db;
        }
        console.log('[Eagle Storage] ✅ IndexedDB initialized');
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // 创建新的 object store
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
          objectStore.createIndex('url', 'originalUrl', { unique: false });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          // 🆕 添加新索引
          objectStore.createIndex('dateTime', 'dateTime', { unique: false });
          objectStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          console.log('[Eagle Storage] 🔧 Object store created');
        } else if (oldVersion < 2) {
          // 🆕 升级现有 store：添加新索引
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(STORE_NAME);
          
          // 添加新索引（如果不存在）
          if (!objectStore.indexNames.contains('dateTime')) {
            objectStore.createIndex('dateTime', 'dateTime', { unique: false });
          }
          if (!objectStore.indexNames.contains('tags')) {
            objectStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          }
          
          console.log('[Eagle Storage] 🔧 Database upgraded to version 2');
        }
      };
    });
  }
  
  /**
   * 🆕 生成快速 caption（描述主体颜色和关键信息）
   */
  function generateQuickCaption(colors, imageUrl = '') {
    const colorNames = [];
    if (colors && colors.length > 0) {
      colors.forEach(c => {
        const hex = typeof c === 'string' ? c : c.hex;
        if (hex) {
          const colorName = getColorName(hex);
          if (colorName) colorNames.push(colorName);
        }
      });
    }
    
    const colorDesc = colorNames.length > 0 
      ? `主要颜色: ${colorNames.slice(0, 3).join(', ')}` 
      : '颜色: 未检测';
    
    // 从 URL 提取关键词（域名、文件名等）
    let urlKeywords = '';
    try {
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        const url = new URL(imageUrl);
        const hostname = url.hostname.replace('www.', '');
        const pathname = url.pathname;
        const filename = pathname.split('/').pop() || '';
        urlKeywords = `${hostname} ${filename}`.trim();
      }
    } catch (e) {
      // URL 解析失败，忽略
    }
    
    return `${colorDesc}${urlKeywords ? ` | ${urlKeywords}` : ''}`.trim();
  }
  
  /**
   * 🆕 生成标签（基于颜色和 URL）
   */
  function generateTags(colors, imageUrl = '') {
    const tags = [];
    
    // 颜色标签
    if (colors && colors.length > 0) {
      colors.forEach(c => {
        const hex = typeof c === 'string' ? c : c.hex;
        if (hex) {
          const colorName = getColorName(hex);
          if (colorName) tags.push(colorName);
        }
      });
    }
    
    // URL 标签（域名、文件扩展名等）
    try {
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        const url = new URL(imageUrl);
        const hostname = url.hostname.replace('www.', '').split('.')[0];
        if (hostname) tags.push(hostname);
        
        const ext = url.pathname.split('.').pop()?.toLowerCase();
        if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
          tags.push(ext);
        }
      }
    } catch (e) {
      // URL 解析失败，忽略
    }
    
    // 去重
    return [...new Set(tags)];
  }
  
  /**
   * 🆕 获取颜色名称（简化版）
   */
  function getColorName(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const normalized = hex.toUpperCase().replace('#', '');
    if (normalized.length !== 6) return null;
    
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    
    // 简化的颜色名称映射
    const colorMap = [
      { name: '红色', ranges: [[200, 255], [0, 100], [0, 100]] },
      { name: '橙色', ranges: [[200, 255], [100, 200], [0, 100]] },
      { name: '黄色', ranges: [[200, 255], [200, 255], [0, 100]] },
      { name: '绿色', ranges: [[0, 100], [150, 255], [0, 100]] },
      { name: '蓝色', ranges: [[0, 100], [0, 100], [150, 255]] },
      { name: '紫色', ranges: [[100, 200], [0, 100], [150, 255]] },
      { name: '粉色', ranges: [[200, 255], [100, 200], [150, 255]] },
      { name: '棕色', ranges: [[100, 150], [50, 100], [0, 50]] },
      { name: '灰色', ranges: [[100, 150], [100, 150], [100, 150]] },
      { name: '黑色', ranges: [[0, 50], [0, 50], [0, 50]] },
      { name: '白色', ranges: [[200, 255], [200, 255], [200, 255]] },
    ];
    
    for (const color of colorMap) {
      const [rRange, gRange, bRange] = color.ranges;
      if (r >= rRange[0] && r <= rRange[1] &&
          g >= gRange[0] && g <= gRange[1] &&
          b >= bRange[0] && b <= bRange[1]) {
        return color.name;
      }
    }
    
    return null;
  }

  // ==================== 并发 caption 生成队列 ====================
  
  // 🆕 并发控制：最多同时处理 5 个 caption 生成请求
  const CAPTION_CONCURRENCY = 5;
  const captionQueue = [];
  let activeCaptionTasks = 0;
  
  /**
   * 🆕 从视觉语言模型 API 生成快速 caption 和 tags
   * @param {string} dataUrl - 图片 Data URL
   * @param {string} imageUrl - 原始图片 URL（用于日志）
   * @returns {Promise<{quickCaption: string, tags: string[]}>}
   */
  async function generateCaptionFromAPI(dataUrl, imageUrl = '') {
    const startTime = Date.now();
    const urlPreview = imageUrl ? imageUrl.substring(0, 60) : 'local-image';
    
    console.log(`[Eagle Storage] 🚀 [CAPTION] Starting API call for: ${urlPreview}`);
    
    try {
      // 获取 API 配置
      const apiUrl = window.__TAB_CLEANER_API_CONFIG?.getBaseUrlSync?.() || 
                     'https://tab-cleaner-mvp-app-production.up.railway.app';
      
      // 获取用户 ID
      let userId = 'anonymous';
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const result = await chrome.storage.local.get(['user_id']);
          userId = result.user_id || 'anonymous';
        } catch (e) {
          console.warn('[Eagle Storage] Failed to get user_id:', e);
        }
      }
      
      // 调用 embedding API（会自动生成 caption）
      const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
      console.log(`[Eagle Storage] 📡 [CAPTION] Calling API: ${embeddingUrl}`);
      
      const response = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId,
        },
        body: JSON.stringify({
          opengraph_items: [{
            url: imageUrl || 'local-image',
            image: dataUrl, // 使用 Data URL
            title: '',
            description: '',
          }],
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const result = await response.json();
      if (result.data && result.data.length > 0) {
        const enrichedItem = result.data[0];
        
        // 提取 caption 和 tags
        const quickCaption = enrichedItem.image_caption || '';
        const tags = [
          ...(enrichedItem.style_tags || []),
          ...(enrichedItem.object_tags || []),
        ];
        
        // 添加颜色标签（如果有）
        if (enrichedItem.dominant_colors && Array.isArray(enrichedItem.dominant_colors)) {
          enrichedItem.dominant_colors.forEach(color => {
            const colorName = getColorName(color);
            if (colorName && !tags.includes(colorName)) {
              tags.push(colorName);
            }
          });
        }
        
        const duration = Date.now() - startTime;
        console.log(`[Eagle Storage] ✅ [CAPTION] SUCCESS! (${duration}ms)`);
        console.log(`[Eagle Storage] 📝 [CAPTION] Caption: "${quickCaption}"`);
        console.log(`[Eagle Storage] 🏷️ [CAPTION] Tags (${tags.length}):`, tags);
        console.log(`[Eagle Storage] 🔗 [CAPTION] Image URL: ${urlPreview}`);
        
        return { quickCaption, tags };
      }
      
      throw new Error('No data returned from API');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Eagle Storage] ❌ [CAPTION] FAILED! (${duration}ms)`);
      console.error(`[Eagle Storage] ❌ [CAPTION] Error:`, error.message);
      console.error(`[Eagle Storage] ❌ [CAPTION] Image URL: ${urlPreview}`);
      // 降级：使用本地生成的 caption
      return null;
    }
  }
  
  /**
   * 🆕 检查是否是 Pinterest 页面
   */
  function isPinterestPage(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('pinterest.com') || 
             urlObj.hostname.includes('pinimg.com');
    } catch (e) {
      return url.includes('pinterest.com') || url.includes('pinimg.com');
    }
  }
  
  /**
   * 🆕 更新 session 中 Pinterest 卡片的 title
   */
  async function updatePinterestCardTitle(imageUrl, caption) {
    try {
      // 检查是否有 chrome.storage.local 访问权限
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.log('[Eagle Storage] ℹ️ chrome.storage.local not available, skipping Pinterest title update');
        return;
      }
      
      if (!caption || !caption.trim()) {
        return;
      }
      
      // 获取所有 sessions
      const storageResult = await chrome.storage.local.get(['sessions']);
      const sessions = storageResult.sessions || [];
      
      if (!Array.isArray(sessions) || sessions.length === 0) {
        return;
      }
      
      // 🆕 从 IndexedDB 获取图片数据，获取 hash
      const imageData = await loadImage(imageUrl);
      if (!imageData || !imageData.hash) {
        console.log('[Eagle Storage] ℹ️ Image not found in IndexedDB, skipping title update');
        return;
      }
      
      let hasUpdate = false;
      const updatedSessions = sessions.map(session => {
        if (!session || !session.opengraphData || !Array.isArray(session.opengraphData)) {
          return session;
        }
        
        let sessionUpdated = false;
        // 查找匹配的卡片
        const updatedData = session.opengraphData.map(item => {
          // 检查是否是 Pinterest 页面
          const itemUrl = item.url || '';
          if (!isPinterestPage(itemUrl)) {
            return item;
          }
          
          // 🆕 多种匹配方式：
          // 1. 通过 eagle://hash 匹配
          const itemImageRef = item.image || '';
          if (itemImageRef.startsWith('eagle://')) {
            const itemHash = itemImageRef.replace('eagle://', '');
            if (itemHash === imageData.hash) {
              // 匹配成功，更新 title
              if (caption.trim() !== (item.title || '').trim()) {
                console.log('[Eagle Storage] 🎨 Updating Pinterest card title (by hash):', {
                  url: itemUrl.substring(0, 50),
                  oldTitle: item.title?.substring(0, 30) || '(empty)',
                  newTitle: caption.substring(0, 50),
                });
                sessionUpdated = true;
                hasUpdate = true;
                return {
                  ...item,
                  title: caption.trim(),
                };
              }
            }
          }
          
          // 2. 通过 original_image_url 匹配
          const itemImageUrl = item.original_image_url || '';
          if (itemImageUrl && imageUrl) {
            // 提取文件名进行匹配（Pinterest 图片 URL 可能包含参数）
            const getImageId = (url) => {
              try {
                const urlObj = new URL(url);
                const pathname = urlObj.pathname;
                // Pinterest 图片 URL 格式：/pinimg.com/originals/xx/xx/xx.jpg
                const match = pathname.match(/\/([^\/]+\.(jpg|jpeg|png|webp))$/i);
                return match ? match[1] : pathname.split('/').pop();
              } catch (e) {
                return url.split('/').pop()?.split('?')[0] || '';
              }
            };
            
            const itemImageId = getImageId(itemImageUrl);
            const targetImageId = getImageId(imageUrl);
            
            if (itemImageId && targetImageId && itemImageId === targetImageId) {
              // 匹配成功，更新 title
              if (caption.trim() !== (item.title || '').trim()) {
                console.log('[Eagle Storage] 🎨 Updating Pinterest card title (by URL):', {
                  url: itemUrl.substring(0, 50),
                  oldTitle: item.title?.substring(0, 30) || '(empty)',
                  newTitle: caption.substring(0, 50),
                });
                sessionUpdated = true;
                hasUpdate = true;
                return {
                  ...item,
                  title: caption.trim(),
                };
              }
            }
          }
          
          return item;
        });
        
        if (sessionUpdated) {
          return {
            ...session,
            opengraphData: updatedData,
          };
        }
        
        return session;
      });
      
      // 如果有更新，保存回 storage
      if (hasUpdate) {
        await chrome.storage.local.set({ sessions: updatedSessions });
        console.log('[Eagle Storage] ✅ Pinterest card title updated in sessions');
        
        // 🆕 触发自定义事件，通知前端更新 UI
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pinterest-card-title-updated', {
            detail: { imageUrl, caption }
          }));
        }
      }
    } catch (error) {
      console.warn('[Eagle Storage] ⚠️ Failed to update Pinterest card title:', error);
    }
  }
  
  /**
   * 🆕 处理 caption 生成队列
   */
  async function processCaptionQueue() {
    if (activeCaptionTasks >= CAPTION_CONCURRENCY || captionQueue.length === 0) {
      return;
    }
    
    const task = captionQueue.shift();
    if (!task) return;
    
    activeCaptionTasks++;
    
    const queueLength = captionQueue.length;
    const activeCount = activeCaptionTasks;
    
    console.log(`[Eagle Storage] 🔄 [CAPTION QUEUE] Processing task (${activeCount}/${CAPTION_CONCURRENCY} active, ${queueLength} remaining)`);
    
    try {
      const { hash, dataUrl, imageUrl } = task;
      
      console.log(`[Eagle Storage] 🎯 [CAPTION QUEUE] Task details:`, {
        hash: hash.substring(0, 12) + '...',
        imageUrl: imageUrl ? imageUrl.substring(0, 60) : 'N/A',
        dataUrlSize: dataUrl ? `${(dataUrl.length / 1024).toFixed(1)} KB` : 'N/A',
      });
      
      // 调用 API 生成 caption
      const result = await generateCaptionFromAPI(dataUrl, imageUrl);
      
      if (result) {
        // 更新 IndexedDB 中的 caption 和 tags
        await updateImageCaption(hash, result.quickCaption, result.tags);
        
        console.log(`[Eagle Storage] ✅✅✅ [CAPTION] SAVED TO INDEXEDDB! ✅✅✅`);
        console.log(`[Eagle Storage] 📦 [CAPTION] Hash: ${hash.substring(0, 12)}...`);
        console.log(`[Eagle Storage] 📝 [CAPTION] Caption: "${result.quickCaption}"`);
        console.log(`[Eagle Storage] 🏷️ [CAPTION] Tags: ${result.tags.length} tags`, result.tags);
        console.log(`[Eagle Storage] 🔗 [CAPTION] Image: ${imageUrl ? imageUrl.substring(0, 60) : 'N/A'}`);
        
        // 🆕 如果是 Pinterest 页面，更新卡片的 title
        if (isPinterestPage(imageUrl) && result.quickCaption && result.quickCaption.trim()) {
          console.log(`[Eagle Storage] 🎨 [CAPTION] Updating Pinterest card title...`);
          await updatePinterestCardTitle(imageUrl, result.quickCaption);
        }
      } else {
        // API 失败，使用本地生成的 caption
        const colors = task.colors || [];
        const quickCaption = generateQuickCaption(colors, imageUrl);
        const tags = generateTags(colors, imageUrl);
        await updateImageCaption(hash, quickCaption, tags);
        console.warn(`[Eagle Storage] ⚠️ [CAPTION] API failed, using local caption for: ${hash.substring(0, 12)}...`);
        console.warn(`[Eagle Storage] ⚠️ [CAPTION] Local caption: "${quickCaption}"`);
      }
      
      if (task.resolve) task.resolve(result);
    } catch (error) {
      console.error('[Eagle Storage] ❌ Caption task failed:', error);
      if (task.reject) task.reject(error);
    } finally {
      activeCaptionTasks--;
      // 处理下一个任务
      processCaptionQueue();
    }
  }
  
  /**
   * 🆕 更新图片的 caption 和 tags
   */
  async function updateImageCaption(hash, quickCaption, tags) {
    try {
      await initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(hash);
        
        getRequest.onsuccess = () => {
          const imageData = getRequest.result;
          if (!imageData) {
            console.error(`[Eagle Storage] ❌ [CAPTION] Image not found in IndexedDB: ${hash.substring(0, 12)}...`);
            reject(new Error('Image not found'));
            return;
          }
          
          // 更新 caption 和 tags
          const oldCaption = imageData.quickCaption || '(none)';
          imageData.quickCaption = quickCaption;
          imageData.tags = tags;
          
          const putRequest = store.put(imageData);
          putRequest.onsuccess = () => {
            console.log(`[Eagle Storage] 💾 [CAPTION] IndexedDB updated successfully!`);
            console.log(`[Eagle Storage] 📦 [CAPTION] Hash: ${hash.substring(0, 12)}...`);
            console.log(`[Eagle Storage] 📝 [CAPTION] Old: "${oldCaption.substring(0, 50)}"`);
            console.log(`[Eagle Storage] 📝 [CAPTION] New: "${quickCaption.substring(0, 50)}"`);
            resolve(imageData);
          };
          putRequest.onerror = () => {
            console.error(`[Eagle Storage] ❌ [CAPTION] Failed to save to IndexedDB: ${hash.substring(0, 12)}...`);
            reject(new Error('Failed to update caption'));
          };
        };
        
        getRequest.onerror = () => {
          console.error(`[Eagle Storage] ❌ [CAPTION] Failed to read from IndexedDB: ${hash.substring(0, 12)}...`);
          reject(new Error('Failed to get image'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ [CAPTION] Update caption failed:', error);
      throw error;
    }
  }

  /**
   * 保存图片到 IndexedDB
   * 🆕 添加快速 caption、tags 和时间戳（并发调用 API 生成）
   */
  async function saveImage(imageUrl, dataUrl, colors = [], metadata = {}) {
    try {
      await initDB();
      
      const hash = await hashUrl(imageUrl);
      
      // 🆕 先使用本地生成的 caption 和 tags（作为占位符）
      const quickCaption = generateQuickCaption(colors, imageUrl);
      const tags = generateTags(colors, imageUrl);
      const dateTime = new Date().toISOString(); // ISO 格式时间戳
      
      const imageData = {
        hash,
        originalUrl: imageUrl,
        dataUrl,
        colors,
        timestamp: Date.now(),
        // 🆕 新增字段（先用本地生成的，后续 API 会更新）
        quickCaption,
        tags,
        dateTime,
        ...metadata, // 允许传入额外元数据
      };
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(imageData);
        
        request.onsuccess = () => {
          console.log('[Eagle Storage] 💾 Image saved:', hash, { quickCaption, tags: tags.length });
          
          // 🆕 异步调用 API 生成更好的 caption（并发控制）
          if (dataUrl && dataUrl.startsWith('data:image')) {
            captionQueue.push({
              hash,
              dataUrl,
              imageUrl,
              colors,
              resolve: (result) => {
                if (result) {
                  console.log('[Eagle Storage] ✅ API caption generated for:', hash);
                }
              },
              reject: (error) => {
                console.warn('[Eagle Storage] ⚠️ API caption generation failed for:', hash, error);
              },
            });
            
            // 触发队列处理
            processCaptionQueue();
          }
          
          resolve(imageData);
        };
        
        request.onerror = () => {
          reject(new Error('Failed to save image'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ Save failed:', error);
      throw error;
    }
  }
  
  /**
   * 从 IndexedDB 读取图片（通过 URL）
   */
  async function loadImage(imageUrl) {
    try {
      await initDB();
      
      const hash = await hashUrl(imageUrl);
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(hash);
        
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            console.log('[Eagle Storage] 📖 Image loaded:', hash);
            resolve(result);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = () => {
          reject(new Error('Failed to load image'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ Load failed:', error);
      return null;
    }
  }
  
  /**
   * 🆕 从 IndexedDB 读取图片（通过 hash，用于 eagle://hash 协议）
   */
  async function loadImageByHash(imageHash) {
    try {
      await initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(imageHash);
        
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            console.log('[Eagle Storage] 📖 Image loaded by hash:', imageHash);
            resolve(result);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = () => {
          reject(new Error('Failed to load image by hash'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ Load by hash failed:', error);
      return null;
    }
  }
  
  /**
   * 🆕 解析图片引用（支持 eagle://hash 协议和普通 URL）
   * 返回实际的 Data URL 或原始 URL
   */
  async function resolveImageReference(imageRef) {
    if (!imageRef || typeof imageRef !== 'string') {
      return null;
    }
    
    // 如果是 eagle:// 协议，从 IndexedDB 加载
    if (imageRef.startsWith('eagle://')) {
      const hash = imageRef.replace('eagle://', '');
      const imageData = await loadImageByHash(hash);
      if (imageData && imageData.dataUrl) {
        return imageData.dataUrl;
      }
      // 如果 IndexedDB 中没有，返回原始 URL（如果有）
      return imageData?.originalUrl || null;
    }
    
    // 如果是 data: URL，直接返回
    if (imageRef.startsWith('data:')) {
      return imageRef;
    }
    
    // 如果是普通 URL，尝试从 IndexedDB 加载（可能已经保存过）
    const imageData = await loadImage(imageRef);
    if (imageData && imageData.dataUrl) {
      return imageData.dataUrl;
    }
    
    // 否则返回原始 URL
    return imageRef;
  }
  
  /**
   * 生成 URL 的 hash
   */
  async function hashUrl(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // 取前 16 位
  }

  // ==================== 图片下载（通过 background.js）====================
  
  /**
   * 🦅 Eagle 式保存：下载图片到本地
   * 🆕 优化：优先从 IndexedDB 读取，只在没有时才 fetch
   */
  async function eagleSave(imageUrl, options = {}) {
    const {
      generateThumbnail = true,
      extractColors = true,
    } = options;
    
    console.log('[Eagle Storage] 🦅 Eagle-style save:', imageUrl);
    
    try {
      // 1. 检查是否已存在（优先从 IndexedDB 读取）
      const existing = await loadImage(imageUrl);
      if (existing && existing.dataUrl) {
        console.log('[Eagle Storage] ✅ Image already in IndexedDB, using cache');
        return existing;
      }
      
      // 🆕 2. 如果 IndexedDB 中没有，尝试从已有的 Data URL 中获取（如果卡片已经有 dataUrl）
      // 这种情况发生在迁移时，卡片可能已经有 dataUrl 但还没保存到 IndexedDB
      // 注意：这个函数主要用于迁移，新图片应该已经在 opengraph_local_v2.js 中保存到 IndexedDB 了
      console.log('[Eagle Storage] ⚠️ Image not in IndexedDB, but migration should not fetch');
      console.log('[Eagle Storage] ℹ️ New images are already saved to IndexedDB by opengraph_local_v2.js');
      console.log('[Eagle Storage] ℹ️ Skipping fetch to avoid CSP errors');
      
      // 返回一个占位记录，不进行 fetch
      return {
        hash: await hashUrl(imageUrl),
        originalUrl: imageUrl,
        dataUrl: null,
        colors: [],
        timestamp: Date.now(),
        error: 'Image should already be in IndexedDB (saved by opengraph_local_v2.js). Migration fetch skipped.',
      };
      
    } catch (error) {
      console.error('[Eagle Storage] ❌ Eagle-style save failed:', error);
      
      // 降级：至少保存原始 URL
      return {
        hash: await hashUrl(imageUrl),
        originalUrl: imageUrl,
        dataUrl: null,
        colors: [],
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }
  
  /**
   * 生成缩略图 + 提取颜色
   */
  async function generateThumbnailAndColors(dataUrl, extractColors = true) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        
        img.onload = () => {
          try {
            // 生成缩略图
            const canvas = document.createElement('canvas');
            const maxSize = 400; // 缩略图最大边长
            const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const thumbnail = canvas.toDataURL('image/jpeg', 0.85);
            
            let colors = [];
            
            // 提取颜色
            if (extractColors) {
              colors = extractDominantColors(canvas);
            }
            
            resolve({ thumbnail, colors });
          } catch (error) {
            console.error('[Eagle Storage] ❌ Canvas processing failed:', error);
            resolve({ thumbnail: null, colors: [] });
          }
        };
        
        img.onerror = () => {
          resolve({ thumbnail: null, colors: [] });
        };
        
        img.src = dataUrl;
      } catch (error) {
        resolve({ thumbnail: null, colors: [] });
      }
    });
  }
  
  /**
   * 提取主色（简化版 k-means）
   */
  function extractDominantColors(canvas, maxColors = 5) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      const samples = [];
      const sampleRate = 10;
      
      for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        if (a < 128) continue;
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 5 && g < 5 && b < 5) continue;
        
        samples.push([r, g, b]);
      }
      
      if (samples.length === 0) {
        return [];
      }
      
      // 简化：只取前 N 个颜色的平均值
      const step = Math.floor(samples.length / maxColors);
      const colors = [];
      
      for (let i = 0; i < maxColors && i * step < samples.length; i++) {
        const sample = samples[i * step];
        colors.push({
          hex: rgbToHex(sample),
          rgb: sample,
          percentage: 100 / maxColors,
        });
      }
      
      return colors;
      
    } catch (error) {
      console.error('[Eagle Storage] ❌ Color extraction failed:', error);
      return [];
    }
  }
  
  function rgbToHex(rgb) {
    const [r, g, b] = rgb;
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  // ==================== 批量迁移（补全历史数据）====================
  
  /**
   * 🔄 将现有的 URL 迁移到 Eagle 式存储
   */
  async function migrateExistingImages(cards, options = {}) {
    const {
      onProgress = null,
      batchSize = 3,
      batchDelay = 500,
    } = options;
    
    console.log('[Eagle Storage] 🔄 Starting migration...');
    
    const needsMigration = cards.filter(card => {
      return card.image && 
             card.image.startsWith('http') && 
             !card.image.startsWith('data:');
    });
    
    console.log(`[Eagle Storage] 📊 Found ${needsMigration.length} images to migrate`);
    
    let migrated = 0;
    let failed = 0;
    
    for (let i = 0; i < needsMigration.length; i += batchSize) {
      const batch = needsMigration.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(card => eagleSave(card.image))
      );
      
      for (let j = 0; j < batch.length; j++) {
        const card = batch[j];
        const result = results[j];
        
        if (result.status === 'fulfilled' && result.value.dataUrl) {
          // 更新卡片数据
          card.image = result.value.dataUrl;
          card.colors = result.value.colors.map(c => c.hex);
          migrated++;
        } else {
          failed++;
        }
        
        if (onProgress) {
          onProgress(migrated + failed, needsMigration.length);
        }
      }
      
      // 批次间延迟
      if (i + batchSize < needsMigration.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    console.log(`[Eagle Storage] ✅ Migration complete: ${migrated} success, ${failed} failed`);
    
    return { migrated, failed, total: needsMigration.length };
  }

  // ==================== 清理未被收入个人空间的 IndexedDB 数据 ====================
  
  /**
   * 🧹 清理未被收入个人空间的 IndexedDB 数据
   * 只保留在 sessions 中引用的图片，删除其他无用数据
   * 
   * ⚠️ 注意：此函数在页面上下文中运行，无法直接访问 chrome.storage.local
   * 需要通过 postMessage 与 background script 通信
   */
  async function cleanupUnusedImages() {
    try {
      await initDB();
      
      // 🆕 检查 chrome API 是否可用（在页面上下文中可能不可用）
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[Eagle Storage] ⚠️ chrome.storage.local not available in this context, skipping cleanup');
        console.log('[Eagle Storage] ℹ️ Cleanup should be called from background script or extension page');
        return { error: 'chrome.storage.local not available in page context' };
      }
      
      // 1. 获取所有 sessions，收集所有被引用的图片 hash
      const storageResult = await chrome.storage.local.get(['sessions']);
      const sessions = storageResult.sessions || [];
      
      const referencedHashes = new Set();
      const referencedUrls = new Set();
      
      // 收集所有被引用的图片
      sessions.forEach(session => {
        if (session?.opengraphData) {
          session.opengraphData.forEach(item => {
            // 收集 eagle://hash 引用
            if (item.image && item.image.startsWith('eagle://')) {
              const hash = item.image.replace('eagle://', '');
              referencedHashes.add(hash);
            }
            // 收集 original_image_url（用于查找）
            if (item.original_image_url) {
              referencedUrls.add(item.original_image_url);
            }
          });
        }
      });
      
      console.log(`[Eagle Storage] 🧹 Cleanup: Found ${referencedHashes.size} referenced hashes, ${referencedUrls.size} referenced URLs`);
      
      // 2. 获取 IndexedDB 中所有图片
      const allImages = await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('Failed to get all images'));
      });
      
      console.log(`[Eagle Storage] 🧹 Cleanup: Found ${allImages.length} images in IndexedDB`);
      
      // 3. 找出未引用的图片
      const unusedImages = allImages.filter(img => {
        // 检查是否被引用（通过 hash 或 URL）
        if (referencedHashes.has(img.hash)) return false;
        if (referencedUrls.has(img.originalUrl)) return false;
        
        // 保留最近 7 天内的图片（即使未引用，可能是刚保存的）
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (img.timestamp && img.timestamp > sevenDaysAgo) return false;
        
        return true;
      });
      
      console.log(`[Eagle Storage] 🧹 Cleanup: Found ${unusedImages.length} unused images to delete`);
      
      // 4. 删除未引用的图片
      if (unusedImages.length > 0) {
        const deletePromises = unusedImages.map(img => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(img.hash);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to delete ${img.hash}`));
          });
        });
        
        await Promise.all(deletePromises);
        console.log(`[Eagle Storage] ✅ Cleanup: Deleted ${unusedImages.length} unused images`);
      } else {
        console.log(`[Eagle Storage] ✅ Cleanup: No unused images to delete`);
      }
      
      return {
        total: allImages.length,
        referenced: referencedHashes.size + referencedUrls.size,
        deleted: unusedImages.length,
        remaining: allImages.length - unusedImages.length,
      };
    } catch (error) {
      console.error('[Eagle Storage] ❌ Cleanup failed:', error);
      return { error: error.message };
    }
  }

  // ==================== 本地搜索功能 ====================
  
  /**
   * 🆕 本地搜索图片（基于 caption、tags 和时间）
   * @param {Object} options - 搜索选项
   * @param {string} options.query - 搜索关键词（在 caption 和 tags 中搜索）
   * @param {string} options.dateFrom - 开始日期（ISO 格式）
   * @param {string} options.dateTo - 结束日期（ISO 格式）
   * @param {string[]} options.tags - 标签过滤
   * @param {number} options.limit - 结果数量限制
   * @returns {Promise<Array>} 匹配的图片数据
   */
  async function searchImages(options = {}) {
    try {
      await initDB();
      
      const {
        query = '',
        dateFrom = null,
        dateTo = null,
        tags = [],
        limit = 100,
      } = options;
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
          let results = request.result || [];
          
          // 🆕 统计：检测本地 caption 和 tags 的使用情况
          const totalImages = results.length;
          const imagesWithCaption = results.filter(img => 
            img.quickCaption && img.quickCaption.trim()
          ).length;
          const imagesWithTags = results.filter(img => 
            img.tags && Array.isArray(img.tags) && img.tags.length > 0
          ).length;
          
          console.log(`[Eagle Storage] 🔍 Local search stats:`, {
            totalImages,
            imagesWithCaption,
            imagesWithTags,
            captionUsage: `${((imagesWithCaption / totalImages) * 100).toFixed(1)}%`,
            tagsUsage: `${((imagesWithTags / totalImages) * 100).toFixed(1)}%`,
          });
          
          // 1. 关键词搜索（在 caption 和 tags 中）
          if (query && query.trim()) {
            const queryLower = query.toLowerCase().trim();
            
            // 🆕 统计匹配方式
            let captionMatches = 0;
            let tagMatches = 0;
            let urlMatches = 0;
            
            results = results.filter(img => {
              const captionMatch = img.quickCaption && 
                img.quickCaption.toLowerCase().includes(queryLower);
              const tagMatch = img.tags && Array.isArray(img.tags) &&
                img.tags.some(tag => tag.toLowerCase().includes(queryLower));
              const urlMatch = img.originalUrl && 
                img.originalUrl.toLowerCase().includes(queryLower);
              
              if (captionMatch) captionMatches++;
              if (tagMatch) tagMatches++;
              if (urlMatch) urlMatches++;
              
              return captionMatch || tagMatch || urlMatch;
            });
            
            // 🆕 详细日志：显示匹配统计
            console.log(`[Eagle Storage] 🔍 Search matching stats for "${query}":`, {
              captionMatches,
              tagMatches,
              urlMatches,
              totalMatches: results.length,
              captionUsed: captionMatches > 0 ? '✅ YES' : '❌ NO',
            });
            
            // 🆕 如果没有通过 caption 匹配，警告
            if (captionMatches === 0 && imagesWithCaption > 0) {
              console.warn(`[Eagle Storage] ⚠️ Query "${query}" did not match any captions, but ${imagesWithCaption} images have captions available`);
              console.warn(`[Eagle Storage] ⚠️ This might indicate: 1) Query doesn't match caption content, 2) Captions are not indexed properly`);
            }
          }
          
          // 2. 标签过滤
          if (tags && tags.length > 0) {
            const beforeTagFilter = results.length;
            results = results.filter(img => {
              if (!img.tags || !Array.isArray(img.tags)) return false;
              return tags.some(tag => 
                img.tags.some(imgTag => 
                  imgTag.toLowerCase() === tag.toLowerCase()
                )
              );
            });
            console.log(`[Eagle Storage] 🏷️ Tag filter: ${beforeTagFilter} → ${results.length} (filtered by ${tags.length} tags)`);
          }
          
          // 3. 时间范围过滤
          if (dateFrom) {
            const beforeDateFilter = results.length;
            results = results.filter(img => {
              if (!img.dateTime) return false;
              return img.dateTime >= dateFrom;
            });
            console.log(`[Eagle Storage] 📅 Date filter (from): ${beforeDateFilter} → ${results.length}`);
          }
          if (dateTo) {
            const beforeDateFilter = results.length;
            results = results.filter(img => {
              if (!img.dateTime) return false;
              return img.dateTime <= dateTo;
            });
            console.log(`[Eagle Storage] 📅 Date filter (to): ${beforeDateFilter} → ${results.length}`);
          }
          
          // 4. 按时间排序（最新的在前）
          results.sort((a, b) => {
            const timeA = a.dateTime || a.timestamp || 0;
            const timeB = b.dateTime || b.timestamp || 0;
            return timeB - timeA;
          });
          
          // 5. 限制结果数量
          const limitedResults = results.slice(0, limit);
          
          // 🆕 最终结果统计
          const finalWithCaption = limitedResults.filter(img => 
            img.quickCaption && img.quickCaption.trim()
          ).length;
          const finalWithTags = limitedResults.filter(img => 
            img.tags && Array.isArray(img.tags) && img.tags.length > 0
          ).length;
          
          console.log(`[Eagle Storage] 🔍 Search complete:`, {
            query: query || '(no query)',
            totalResults: limitedResults.length,
            resultsWithCaption: finalWithCaption,
            resultsWithTags: finalWithTags,
            captionDetected: finalWithCaption > 0 ? '✅ YES' : '❌ NO',
          });
          
          resolve(limitedResults);
        };
        
        request.onerror = () => {
          reject(new Error('Failed to search images'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ Search failed:', error);
      return [];
    }
  }
  
  /**
   * 🆕 获取所有标签（用于标签云）
   */
  async function getAllTags() {
    try {
      await initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
          const allImages = request.result || [];
          const tagCounts = {};
          
          allImages.forEach(img => {
            if (img.tags && Array.isArray(img.tags)) {
              img.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
              });
            }
          });
          
          // 转换为数组并按使用频率排序
          const tags = Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
          
          resolve(tags);
        };
        
        request.onerror = () => {
          reject(new Error('Failed to get tags'));
        };
      });
    } catch (error) {
      console.error('[Eagle Storage] ❌ Get tags failed:', error);
      return [];
    }
  }
  
  /**
   * 🆕 为 session 中存在的图片补充 caption 和 tags
   * 检查 IndexedDB 中缺少 caption/tags 的图片，并批量生成
   */
  async function enrichSessionImages(options = {}) {
    try {
      await initDB();
      
      // 检查 chrome.storage.local 是否可用
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[Eagle Storage] ⚠️ chrome.storage.local not available, skipping enrichment');
        return { error: 'chrome.storage.local not available' };
      }
      
      const {
        onProgress = null,
        batchSize = 5,
        maxItems = 50, // 最多处理 50 个，避免过载
      } = options;
      
      console.log('[Eagle Storage] 🔍 Starting session images enrichment...');
      
      // 1. 获取所有 sessions，收集被引用的图片 URL 和 hash
      const storageResult = await chrome.storage.local.get(['sessions']);
      const sessions = storageResult.sessions || [];
      
      const referencedHashes = new Set();
      const referencedUrls = new Set();
      const allItemImages = []; // 🆕 用于调试
      
      sessions.forEach(session => {
        if (session?.opengraphData) {
          session.opengraphData.forEach(item => {
            // 收集 eagle://hash 引用
            if (item.image && item.image.startsWith('eagle://')) {
              const hash = item.image.replace('eagle://', '');
              referencedHashes.add(hash);
            }
            // 收集 original_image_url
            if (item.original_image_url) {
              referencedUrls.add(item.original_image_url);
            }
            // 🆕 收集 item.url（可能是图片的原始 URL）
            if (item.url && (item.url.startsWith('http://') || item.url.startsWith('https://'))) {
              referencedUrls.add(item.url);
            }
            // 🆕 收集 item.image（如果是 URL 格式）
            if (item.image && (item.image.startsWith('http://') || item.image.startsWith('https://'))) {
              referencedUrls.add(item.image);
            }
            
            // 🆕 调试：记录所有图片引用
            allItemImages.push({
              image: item.image?.substring(0, 50) || 'none',
              original_image_url: item.original_image_url?.substring(0, 50) || 'none',
              url: item.url?.substring(0, 50) || 'none',
            });
          });
        }
      });
      
      console.log(`[Eagle Storage] 📊 Found ${referencedHashes.size} referenced hashes, ${referencedUrls.size} referenced URLs`);
      console.log(`[Eagle Storage] 🔍 Sample item images:`, allItemImages.slice(0, 3));
      
      // 2. 获取 IndexedDB 中所有图片
      const allImages = await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('Failed to get all images'));
      });
      
      console.log(`[Eagle Storage] 📊 Found ${allImages.length} images in IndexedDB`);
      if (allImages.length > 0) {
        console.log(`[Eagle Storage] 🔍 Sample IndexedDB images:`, allImages.slice(0, 3).map(img => ({
          hash: img.hash?.substring(0, 20) || 'none',
          originalUrl: img.originalUrl?.substring(0, 50) || 'none',
          hasCaption: !!(img.quickCaption && img.quickCaption.trim()),
          captionLength: img.quickCaption?.length || 0,
          hasTags: !!(img.tags && Array.isArray(img.tags) && img.tags.length > 0),
        })));
      }
      
      // 3. 找出需要补充的图片（在 session 中被引用，但缺少 caption 或 tags）
      const needsEnrichment = allImages.filter(img => {
        // 🆕 改进的匹配逻辑：检查多种可能的匹配方式
        let isReferenced = false;
        
        // 方式1: 通过 hash 匹配
        if (referencedHashes.has(img.hash)) {
          isReferenced = true;
        }
        
        // 方式2: 通过 originalUrl 精确匹配
        if (img.originalUrl && referencedUrls.has(img.originalUrl)) {
          isReferenced = true;
        }
        
        // 方式3: 通过 originalUrl 的部分匹配（处理 URL 参数差异）
        if (img.originalUrl && !isReferenced) {
          const imgUrlBase = img.originalUrl.split('?')[0].split('#')[0];
          for (const refUrl of referencedUrls) {
            const refUrlBase = refUrl.split('?')[0].split('#')[0];
            if (imgUrlBase === refUrlBase || imgUrlBase.includes(refUrlBase) || refUrlBase.includes(imgUrlBase)) {
              isReferenced = true;
              break;
            }
          }
        }
        
        if (!isReferenced) return false;
        
        // 检查是否缺少 caption 或 tags
        // 🆕 放宽判断条件：只要 caption 看起来是本地生成的占位符，就需要更新
        const hasCaption = img.quickCaption && 
                          img.quickCaption.trim() && 
                          img.quickCaption.length > 20 &&
                          !img.quickCaption.includes('主要颜色:') && // 排除本地生成的占位符
                          !img.quickCaption.startsWith('图片来自'); // 排除其他占位符
        const hasTags = img.tags && Array.isArray(img.tags) && img.tags.length > 0;
        
        // 🆕 如果 caption 太短或看起来像占位符，也需要更新
        const needsCaptionUpdate = !hasCaption || 
                                   img.quickCaption.length < 30 || 
                                   img.quickCaption.includes('主要颜色:') ||
                                   img.quickCaption.startsWith('图片来自');
        
        // 需要补充：有 dataUrl 但缺少 caption 或 tags
        return img.dataUrl && img.dataUrl.startsWith('data:image') && (needsCaptionUpdate || !hasTags);
      });
      
      console.log(`[Eagle Storage] 📊 Found ${needsEnrichment.length} images need caption/tags enrichment`);
      
      if (needsEnrichment.length === 0) {
        // 🆕 详细调试：为什么没有找到需要补充的图片
        console.log('[Eagle Storage] 🔍 Debug: Why no images need enrichment?');
        console.log(`  - Total IndexedDB images: ${allImages.length}`);
        console.log(`  - Referenced hashes: ${referencedHashes.size}`);
        console.log(`  - Referenced URLs: ${referencedUrls.size}`);
        
        // 检查是否有匹配但被过滤掉的图片
        const matchedButFiltered = allImages.filter(img => {
          const isReferenced = referencedHashes.has(img.hash) || 
                              (img.originalUrl && referencedUrls.has(img.originalUrl));
          if (!isReferenced) return false;
          
          const hasCaption = img.quickCaption && 
                            img.quickCaption.trim() && 
                            img.quickCaption.length > 20 &&
                            !img.quickCaption.includes('主要颜色:');
          const hasTags = img.tags && Array.isArray(img.tags) && img.tags.length > 0;
          
          return hasCaption && hasTags; // 这些是被过滤掉的（已有完整数据）
        });
        
        console.log(`  - Matched but already enriched: ${matchedButFiltered.length}`);
        if (matchedButFiltered.length > 0) {
          console.log(`  - Sample enriched images:`, matchedButFiltered.slice(0, 2).map(img => ({
            hash: img.hash?.substring(0, 20),
            caption: img.quickCaption?.substring(0, 50),
            tags: img.tags?.length || 0,
          })));
        }
        
        // 🆕 如果 IndexedDB 中有图片但 session 中没有引用，可能是匹配问题
        if (allImages.length > 0 && referencedHashes.size === 0 && referencedUrls.size === 0) {
          console.warn('[Eagle Storage] ⚠️ IndexedDB has images but no session references found - possible matching issue');
          console.warn('[Eagle Storage] ⚠️ This might mean session images are not in eagle:// format yet');
          
          // 🆕 尝试更宽松的匹配：直接处理所有 IndexedDB 中有 dataUrl 但缺少 caption 的图片
          const allNeedsEnrichment = allImages.filter(img => {
            if (!img.dataUrl || !img.dataUrl.startsWith('data:image')) return false;
            
            const hasCaption = img.quickCaption && 
                              img.quickCaption.trim() && 
                              img.quickCaption.length > 30 &&
                              !img.quickCaption.includes('主要颜色:') &&
                              !img.quickCaption.startsWith('图片来自');
            const hasTags = img.tags && Array.isArray(img.tags) && img.tags.length > 0;
            
            return !hasCaption || !hasTags;
          });
          
          if (allNeedsEnrichment.length > 0) {
            console.log(`[Eagle Storage] 🔄 Found ${allNeedsEnrichment.length} images in IndexedDB that need enrichment (without session matching)`);
            // 继续处理这些图片
            const toProcess = allNeedsEnrichment.slice(0, maxItems);
            console.log(`[Eagle Storage] 🚀 Processing ${toProcess.length} images (batch size: ${batchSize})`);
            
            let enriched = 0;
            let failed = 0;
            let skipped = 0;
            
            for (let i = 0; i < toProcess.length; i += batchSize) {
              const batch = toProcess.slice(i, i + batchSize);
              
              const results = await Promise.allSettled(
                batch.map(async (img) => {
                  try {
                    const current = await loadImageByHash(img.hash);
                    if (current) {
                      const hasCaption = current.quickCaption && 
                                       current.quickCaption.trim() && 
                                       !current.quickCaption.includes('主要颜色:') &&
                                       current.quickCaption.length > 30;
                      const hasTags = current.tags && Array.isArray(current.tags) && current.tags.length > 0;
                      
                      if (hasCaption && hasTags) {
                        skipped++;
                        return { status: 'skipped', hash: img.hash };
                      }
                    }
                    
                    console.log(`[Eagle Storage] 🎯 [ENRICH] Processing image ${i + 1}/${toProcess.length}: ${img.hash.substring(0, 12)}...`);
                    const result = await generateCaptionFromAPI(img.dataUrl, img.originalUrl);
                    
                    if (result && result.quickCaption && result.quickCaption.trim()) {
                      await updateImageCaption(img.hash, result.quickCaption, result.tags);
                      
                      if (isPinterestPage(img.originalUrl)) {
                        console.log(`[Eagle Storage] 🎨 [ENRICH] Pinterest detected, updating title...`);
                        await updatePinterestCardTitle(img.originalUrl, result.quickCaption);
                      }
                      
                      enriched++;
                      console.log(`[Eagle Storage] ✅ [ENRICH] Success ${enriched}/${toProcess.length}: ${img.hash.substring(0, 12)}...`);
                      return { status: 'success', hash: img.hash };
                    } else {
                      failed++;
                      console.warn(`[Eagle Storage] ❌ [ENRICH] Failed ${failed}/${toProcess.length}: ${img.hash.substring(0, 12)}...`);
                      return { status: 'failed', hash: img.hash };
                    }
                  } catch (error) {
                    console.warn(`[Eagle Storage] ⚠️ Failed to enrich image ${img.hash}:`, error);
                    failed++;
                    return { status: 'error', hash: img.hash, error: error.message };
                  }
                })
              );
              
              if (onProgress) {
                onProgress(i + batch.length, toProcess.length, enriched, failed, skipped);
              }
              
              if (i + batchSize < toProcess.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
            
            console.log(`[Eagle Storage] ✅ Enrichment complete: ${enriched} enriched, ${failed} failed, ${skipped} skipped`);
            
            return {
              enriched,
              failed,
              skipped,
              total: toProcess.length,
            };
          }
        }
        
        console.log('[Eagle Storage] ✅ All session images already have caption and tags');
        return { enriched: 0, total: 0, skipped: 0 };
      }
      
      // 4. 限制处理数量，避免过载
      const toProcess = needsEnrichment.slice(0, maxItems);
      console.log(`[Eagle Storage] 🚀 Processing ${toProcess.length} images (batch size: ${batchSize})`);
      
      let enriched = 0;
      let failed = 0;
      let skipped = 0;
      
      // 5. 批量处理（使用并发控制）
      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (img) => {
            try {
              // 检查是否已经有 caption（可能正在处理中）
              const current = await loadImageByHash(img.hash);
              if (current) {
                const hasCaption = current.quickCaption && 
                                 current.quickCaption.trim() && 
                                 !current.quickCaption.includes('主要颜色:') &&
                                 current.quickCaption.length > 20;
                const hasTags = current.tags && Array.isArray(current.tags) && current.tags.length > 0;
                
                if (hasCaption && hasTags) {
                  skipped++;
                  return { status: 'skipped', hash: img.hash };
                }
              }
              
              // 调用 API 生成 caption
              const result = await generateCaptionFromAPI(img.dataUrl, img.originalUrl);
              
              if (result && result.quickCaption && result.quickCaption.trim()) {
                // 更新 IndexedDB
                await updateImageCaption(img.hash, result.quickCaption, result.tags);
                
                // 如果是 Pinterest 页面，更新卡片标题
                if (isPinterestPage(img.originalUrl)) {
                  await updatePinterestCardTitle(img.originalUrl, result.quickCaption);
                }
                
                enriched++;
                return { status: 'success', hash: img.hash };
              } else {
                failed++;
                return { status: 'failed', hash: img.hash };
              }
            } catch (error) {
              console.warn(`[Eagle Storage] ⚠️ Failed to enrich image ${img.hash}:`, error);
              failed++;
              return { status: 'error', hash: img.hash, error: error.message };
            }
          })
        );
        
        // 进度回调
        if (onProgress) {
          onProgress(i + batch.length, toProcess.length, enriched, failed, skipped);
        }
        
        // 批次间延迟，避免过载
        if (i + batchSize < toProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`[Eagle Storage] ✅ Enrichment complete: ${enriched} enriched, ${failed} failed, ${skipped} skipped`);
      
      return {
        enriched,
        failed,
        skipped,
        total: toProcess.length,
      };
    } catch (error) {
      console.error('[Eagle Storage] ❌ Enrichment failed:', error);
      return { error: error.message };
    }
  }

  // ==================== 导出 API ====================
  
  window.__TAB_CLEANER_EAGLE_STORAGE = {
    // 核心功能
    eagleSave,
    loadImage,
    loadImageByHash,  // 🆕 通过 hash 加载
    resolveImageReference,  // 🆕 解析图片引用（支持 eagle:// 协议）
    saveImage,
    
    // 批量操作
    migrateExistingImages,
    
    // IndexedDB 管理
    initDB,
    cleanupUnusedImages,  // 🆕 清理未被收入个人空间的无用数据（仅在扩展页面中可用）
    _db: null,  // 🆕 暴露 db 引用供 background script 使用
    
    // 🆕 本地搜索功能
    searchImages,
    getAllTags,
    
    // 🆕 批量补充功能
    enrichSessionImages,  // 为 session 中的图片补充 caption 和 tags
  };
  
  // 自动初始化
  initDB().then((database) => {
    // 🆕 保存 db 引用供外部使用
    window.__TAB_CLEANER_EAGLE_STORAGE._db = database;
    console.log('[Eagle Storage] ✅ Initialized and ready');
  }).catch((error) => {
    console.error('[Eagle Storage] ❌ Initialization failed:', error);
  });
  
  // 🆕 定期清理（每 24 小时执行一次）
  // ⚠️ 注意：cleanup 需要在有 chrome.storage.local 访问权限的上下文中运行
  // 所以只在扩展页面（如 PersonalSpace）中执行，不在普通网页中执行
  let lastCleanupTime = 0;
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 小时
  
  async function scheduleCleanup() {
    // 🆕 检查是否在扩展上下文中（可以访问 chrome.storage.local）
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.log('[Eagle Storage] ℹ️ Skipping cleanup (not in extension context)');
      return;
    }
    
    const now = Date.now();
    if (now - lastCleanupTime > CLEANUP_INTERVAL) {
      lastCleanupTime = now;
      console.log('[Eagle Storage] 🧹 Starting scheduled cleanup...');
      await cleanupUnusedImages();
    }
  }
  
  // 🆕 只在扩展页面中触发清理（延迟执行，避免阻塞）
  // 检查是否在扩展页面中（通过 URL 判断）
  if (typeof window !== 'undefined') {
    const isExtensionPage = window.location.protocol === 'chrome-extension:' || 
                           window.location.href.includes('personalspace.html') ||
                           window.location.href.includes('sidepanel.html');
    
    if (isExtensionPage) {
      window.addEventListener('load', () => {
        setTimeout(scheduleCleanup, 10000); // 延迟 10 秒执行
      });
    } else {
      console.log('[Eagle Storage] ℹ️ Running in page context, cleanup will be handled by extension pages');
    }
  }
  
  console.log('[Eagle Storage] ✅ Ready');

})();
