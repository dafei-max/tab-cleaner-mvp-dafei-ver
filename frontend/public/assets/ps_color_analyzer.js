/**
 * PersonalSpace 颜色分析器
 * 
 * 🎯 核心思路（模仿 Eagle）：
 * 1. PersonalSpace 加载时，扫描所有卡片
 * 2. 对于没有颜色数据的卡片，批量提取颜色
 * 3. 缓存到 chrome.storage，下次直接用
 * 4. 颜色搜索时，直接从缓存读取
 */

(function() {
  'use strict';

  console.log('[PS Color Analyzer] 🎨 Initializing...');

  // ==================== 配置 ====================
  
  const CONFIG = {
    // 批处理
    batchSize: 5,           // 每批处理 5 张图
    batchDelay: 300,        // 批次间隔 300ms
    
    // 颜色提取
    maxColors: 5,           // 最多 5 个主色
    sampleRate: 10,         // 采样率（每 10 个像素取 1 个）
    
    // 缓存
    cacheKey: 'color_cache',
    cacheExpiry: 7 * 24 * 60 * 60 * 1000, // 7天过期
  };

  // ==================== 核心：从图片 URL 提取颜色 ====================
  
  /**
   * 🆕 从 IndexedDB 加载图片（优先使用，无 CORS 限制）
   */
  async function loadImageFromIndexedDB(imageUrl) {
    try {
      if (window.__TAB_CLEANER_EAGLE_STORAGE && window.__TAB_CLEANER_EAGLE_STORAGE.loadImage) {
        const imageData = await window.__TAB_CLEANER_EAGLE_STORAGE.loadImage(imageUrl);
        if (imageData && imageData.dataUrl) {
          console.log('[PS Color Analyzer] ✅ Loaded from IndexedDB:', imageUrl.substring(0, 50));
          return imageData.dataUrl;
        }
      }
    } catch (error) {
      console.warn('[PS Color Analyzer] ⚠️ Failed to load from IndexedDB:', error);
    }
    return null;
  }

  /**
   * 🎨 从图片 URL 或 Data URL 提取颜色（PersonalSpace 专用）
   * 
   * 🆕 优化：优先从 IndexedDB 加载，无 CORS 限制
   * 
   * 策略：
   * 1. 优先从 IndexedDB 加载（如果存在）
   * 2. 如果失败，尝试直接加载 URL
   * 3. 绘制到临时 Canvas
   * 4. 提取颜色
   * 5. 销毁临时元素
   */
  async function extractColorsFromUrl(imageUrl) {
    return new Promise(async (resolve) => {
      try {
        console.log('[PS Color Analyzer] 🖼️ Loading:', imageUrl);
        
        // 🆕 步骤 1：优先从 IndexedDB 加载（无 CORS 限制）
        let dataUrl = null;
        if (imageUrl && !imageUrl.startsWith('data:')) {
          dataUrl = await loadImageFromIndexedDB(imageUrl);
        } else if (imageUrl && imageUrl.startsWith('data:')) {
          // 已经是 Data URL，直接使用
          dataUrl = imageUrl;
        }
        
        // 1. 创建隐藏的 <img>
        const img = new Image();
        img.crossOrigin = 'anonymous'; // 尝试跨域（可能失败）
        
        // 设置超时
        const timeout = setTimeout(() => {
          console.warn('[PS Color Analyzer] ⏱️ Timeout:', imageUrl);
          resolve({ success: false, error: 'timeout', colors: [] });
        }, 5000);
        
        img.onload = () => {
          clearTimeout(timeout);
          try {
            // 2. 创建临时 Canvas
            const canvas = document.createElement('canvas');
            const maxSize = 200; // 缩小尺寸加快处理
            const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // 3. 提取颜色
            const colors = extractDominantColors(canvas);
            
            const source = dataUrl ? 'IndexedDB' : 'URL';
            console.log(`[PS Color Analyzer] ✅ Extracted ${colors.length} colors from ${source}`);
            resolve({ success: true, colors });
            
          } catch (canvasError) {
            console.warn('[PS Color Analyzer] ⚠️ Canvas failed (CORS?):', canvasError.message);
            resolve({ success: false, error: 'canvas_tainted', colors: [] });
          }
        };
        
        img.onerror = () => {
          clearTimeout(timeout);
          console.warn('[PS Color Analyzer] ⚠️ Image load failed:', imageUrl);
          resolve({ success: false, error: 'image_load_failed', colors: [] });
        };
        
        // 4. 开始加载（优先使用 IndexedDB 中的 Data URL）
        img.src = dataUrl || imageUrl;
        
      } catch (error) {
        console.error('[PS Color Analyzer] ❌ Error:', error);
        resolve({ success: false, error: error.message, colors: [] });
      }
    });
  }
  
  /**
   * 🎨 提取主色（k-means 聚类）
   */
  function extractDominantColors(canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // 快速采样
      const samples = [];
      const sampleRate = CONFIG.sampleRate;
      
      for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // 跳过透明、纯白、纯黑
        if (a < 128) continue;
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 5 && g < 5 && b < 5) continue;
        
        samples.push([r, g, b]);
      }
      
      if (samples.length === 0) {
        return [];
      }
      
      // k-means 聚类
      const k = Math.min(CONFIG.maxColors, samples.length);
      const clusters = kMeans(samples, k);
      
      // 转换为结果格式
      return clusters.map(cluster => ({
        hex: rgbToHex(cluster.center),
        rgb: cluster.center,
        percentage: (cluster.points.length / samples.length) * 100,
      })).sort((a, b) => b.percentage - a.percentage);
      
    } catch (error) {
      console.error('[PS Color Analyzer] ❌ Color extraction failed:', error);
      return [];
    }
  }
  
  /**
   * k-means 聚类
   */
  function kMeans(points, k) {
    if (points.length <= k) {
      return points.map(p => ({ center: p, points: [p] }));
    }
    
    // 初始化中心点（均匀分布）
    let centers = [];
    const step = Math.floor(points.length / k);
    for (let i = 0; i < k; i++) {
      centers.push(points[i * step].slice());
    }
    
    // 迭代 10 次
    for (let iter = 0; iter < 10; iter++) {
      const clusters = centers.map(() => []);
      
      // 分配点到最近的中心
      for (const point of points) {
        let minDist = Infinity;
        let minIdx = 0;
        
        for (let i = 0; i < centers.length; i++) {
          const dist = colorDistance(point, centers[i]);
          if (dist < minDist) {
            minDist = dist;
            minIdx = i;
          }
        }
        
        clusters[minIdx].push(point);
      }
      
      // 更新中心
      for (let i = 0; i < centers.length; i++) {
        if (clusters[i].length > 0) {
          centers[i] = calculateMean(clusters[i]);
        }
      }
    }
    
    // 最终分配
    const finalClusters = centers.map(() => []);
    for (const point of points) {
      let minDist = Infinity;
      let minIdx = 0;
      
      for (let i = 0; i < centers.length; i++) {
        const dist = colorDistance(point, centers[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }
      
      finalClusters[minIdx].push(point);
    }
    
    return centers.map((center, i) => ({
      center: center.map(Math.round),
      points: finalClusters[i],
    })).filter(c => c.points.length > 0);
  }
  
  function colorDistance(c1, c2) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  
  function calculateMean(colors) {
    const sum = colors.reduce((acc, c) => [
      acc[0] + c[0],
      acc[1] + c[1],
      acc[2] + c[2],
    ], [0, 0, 0]);
    
    return [
      Math.round(sum[0] / colors.length),
      Math.round(sum[1] / colors.length),
      Math.round(sum[2] / colors.length),
    ];
  }
  
  function rgbToHex(rgb) {
    const [r, g, b] = rgb;
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  // ==================== 批量处理 ====================
  
  /**
   * 📦 批量分析 PersonalSpace 的所有卡片
   * 
   * @param {Array} sessions - Session 数组，每个 session 包含 opengraphData
   * @param {Object} options - 选项
   * @param {Function} options.onProgress - 进度回调 (current, total)
   * @param {Function} options.onCardComplete - 卡片完成回调 (card, analyzed, total)
   * @param {Function} options.onUpdateSession - 更新 session 的回调 (sessionId, updates)
   * @param {boolean} options.forceReanalyze - 是否强制重新分析
   */
  async function analyzeSessions(sessions, options = {}) {
    const {
      onProgress = null,
      onCardComplete = null,
      onUpdateSession = null,
      forceReanalyze = false,
    } = options;
    
    console.log('[PS Color Analyzer] 📦 Starting batch analysis...');
    
    // 1. 加载颜色缓存
    const colorCache = await loadColorCache();
    
    // 2. 收集需要分析的卡片
    const needsAnalysis = [];
    
    for (const session of sessions) {
      if (!session || !Array.isArray(session.opengraphData)) continue;
      
      for (const item of session.opengraphData) {
        // 跳过已有颜色数据的卡片（除非强制重新分析）
        if (!forceReanalyze && item.dominant_colors && Array.isArray(item.dominant_colors) && item.dominant_colors.length > 0) {
          continue;
        }
        
        // 优先级：image (URL) > thumbnail (base64) > screenshot_image (base64)
        // 只处理 URL 图片（base64 图片由其他函数处理）
        const imageUrl = item.image && !item.image.startsWith('data:') ? item.image : null;
        
        if (!imageUrl) continue;
        
        // 检查缓存
        const cached = colorCache[imageUrl];
        if (!forceReanalyze && cached && !isCacheExpired(cached)) {
          // 从缓存恢复颜色数据
          if (onUpdateSession) {
            const itemIndex = session.opengraphData.findIndex(og => og.id === item.id);
            if (itemIndex >= 0) {
              onUpdateSession(session.id, {
                opengraphData: session.opengraphData.map((og, idx) => 
                  idx === itemIndex ? { ...og, dominant_colors: cached.colors.map(c => c.hex) } : og
                )
              });
            }
          }
          continue;
        }
        
        // 需要分析
        needsAnalysis.push({
          sessionId: session.id,
          itemId: item.id,
          itemUrl: item.url,
          imageUrl: imageUrl,
        });
      }
    }
    
    console.log(`[PS Color Analyzer] 📊 Found ${needsAnalysis.length} cards needing analysis`);
    
    if (needsAnalysis.length === 0) {
      return { success: true, analyzed: 0, failed: 0 };
    }
    
    // 3. 分批处理
    let analyzed = 0;
    let failed = 0;
    
    for (let i = 0; i < needsAnalysis.length; i += CONFIG.batchSize) {
      const batch = needsAnalysis.slice(i, i + CONFIG.batchSize);
      
      // 并发处理一批
      const results = await Promise.all(
        batch.map(item => extractColorsFromUrl(item.imageUrl))
      );
      
      // 更新数据
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const result = results[j];
        
        if (result.success && result.colors.length > 0) {
          // 转换颜色格式：从 { hex, rgb, percentage } 转为 hex 字符串数组
          const colorHexArray = result.colors.map(c => c.hex);
          
          // 更新 session 中的卡片
          const session = sessions.find(s => s.id === item.sessionId);
          if (session && Array.isArray(session.opengraphData)) {
            const itemIndex = session.opengraphData.findIndex(og => og.id === item.itemId);
            if (itemIndex >= 0 && onUpdateSession) {
              onUpdateSession(session.id, {
                opengraphData: session.opengraphData.map((og, idx) => 
                  idx === itemIndex ? { ...og, dominant_colors: colorHexArray } : og
                )
              });
            }
          }
          
          // 更新缓存
          colorCache[item.imageUrl] = {
            colors: result.colors,
            timestamp: Date.now(),
          };
          
          analyzed++;
          
          if (onCardComplete) {
            const session = sessions.find(s => s.id === item.sessionId);
            const card = session?.opengraphData?.find(og => og.id === item.itemId);
            if (card) {
              onCardComplete(card, analyzed, needsAnalysis.length);
            }
          }
        } else {
          failed++;
          console.warn(`[PS Color Analyzer] ⚠️ Failed: ${item.imageUrl}`, result.error);
        }
        
        if (onProgress) {
          onProgress(analyzed + failed, needsAnalysis.length);
        }
      }
      
      // 批次间延迟
      if (i + CONFIG.batchSize < needsAnalysis.length) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.batchDelay));
      }
    }
    
    // 4. 保存缓存
    await saveColorCache(colorCache);
    
    console.log(`[PS Color Analyzer] ✅ Analysis complete: ${analyzed} success, ${failed} failed`);
    
    return {
      success: true,
      analyzed,
      failed,
      total: needsAnalysis.length,
    };
  }

  // ==================== 缓存管理 ====================
  
  async function loadColorCache() {
    try {
      const result = await chrome.storage.local.get(CONFIG.cacheKey);
      return result[CONFIG.cacheKey] || {};
    } catch (error) {
      console.error('[PS Color Analyzer] ❌ Failed to load cache:', error);
      return {};
    }
  }
  
  async function saveColorCache(cache) {
    try {
      await chrome.storage.local.set({ [CONFIG.cacheKey]: cache });
      console.log('[PS Color Analyzer] 💾 Cache saved');
    } catch (error) {
      console.error('[PS Color Analyzer] ❌ Failed to save cache:', error);
    }
  }
  
  function isCacheExpired(cached) {
    return Date.now() - cached.timestamp > CONFIG.cacheExpiry;
  }
  
  async function clearExpiredCache() {
    const cache = await loadColorCache();
    const now = Date.now();
    
    let cleared = 0;
    for (const [url, data] of Object.entries(cache)) {
      if (now - data.timestamp > CONFIG.cacheExpiry) {
        delete cache[url];
        cleared++;
      }
    }
    
    if (cleared > 0) {
      await saveColorCache(cache);
      console.log(`[PS Color Analyzer] 🗑️ Cleared ${cleared} expired cache entries`);
    }
  }

  // ==================== 导出 API ====================
  
  window.__TAB_CLEANER_PS_COLOR_ANALYZER = {
    // 核心功能
    analyzeSessions,
    extractColorsFromUrl,
    
    // 缓存管理
    loadColorCache,
    saveColorCache,
    clearExpiredCache,
    
    // 配置
    config: CONFIG,
  };
  
  console.log('[PS Color Analyzer] ✅ Ready');

})();

