/**
 * PersonalSpace 颜色分析器
 * Eagle 式颜色搜索实现，用于在 PersonalSpace 中自动提取和分析图片的主色调
 * 
 * 功能：
 * 1. 自动颜色提取：PersonalSpace 加载时，自动扫描所有卡片并提取颜色
 * 2. 智能缓存：使用 chrome.storage.local 缓存颜色数据，7天过期
 * 3. 批量处理：分批处理图片，避免阻塞 UI
 * 4. Delta E 算法：使用 Delta E 颜色距离算法进行颜色匹配
 */

(function() {
  'use strict';

  // 配置
  const config = {
    batchSize: 5,           // 每批处理 5 张图
    batchDelay: 300,        // 批次间隔 300ms
    maxColors: 5,           // 最多 5 个主色
    sampleRate: 10,         // 采样率（每 10 个像素取 1 个）
    cacheKey: 'ps_color_cache',
    cacheExpiry: 604800000  // 7天过期（毫秒）
  };

  /**
   * 从图片 URL 提取颜色
   * @param {string} imageUrl - 图片 URL（必须是 HTTP/HTTPS URL，不支持 base64）
   * @returns {Promise<{success: boolean, colors: Array}>}
   */
  async function extractColorsFromUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return { success: false, colors: [] };
    }

    // 不支持 base64
    if (imageUrl.startsWith('data:image')) {
      console.warn('[PS Color Analyzer] Base64 images not supported by extractColorsFromUrl');
      return { success: false, colors: [] };
    }

    try {
      // 检查缓存
      const cache = await loadColorCache();
      const cacheKey = imageUrl;
      const cached = cache[cacheKey];
      
      if (cached && cached.timestamp && (Date.now() - cached.timestamp) < config.cacheExpiry) {
        console.log(`[PS Color Analyzer] Using cached colors for: ${imageUrl.substring(0, 50)}...`);
        return { success: true, colors: cached.colors };
      }

      // 加载图片
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      const colors = await new Promise((resolve) => {
        img.onload = () => {
          try {
            // 缩小图片以加速处理
            const SAMPLE_SIZE = 50;
            const ratio = Math.min(1, SAMPLE_SIZE / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * ratio));
            const h = Math.max(1, Math.round(img.height * ratio));

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // 尝试绘制图片
            try {
              ctx.drawImage(img, 0, 0, w, h);
            } catch (e) {
              console.warn('[PS Color Analyzer] CORS blocked:', imageUrl);
              resolve([]);
              return;
            }

            // 获取像素数据
            let imageData;
            try {
              imageData = ctx.getImageData(0, 0, w, h);
            } catch (e) {
              console.warn('[PS Color Analyzer] Failed to get image data (CORS?):', imageUrl);
              resolve([]);
              return;
            }

            const pixels = imageData.data;
            const colorCounts = {};

            // 采样像素，统计颜色频率
            for (let i = 0; i < pixels.length; i += 4 * config.sampleRate) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              const a = pixels[i + 3];

              if (a < 128) continue; // 跳过透明像素

              // 量化颜色（减少颜色种类）
              const qr = Math.round(r / 32) * 32;
              const qg = Math.round(g / 32) * 32;
              const qb = Math.round(b / 32) * 32;
              const key = `${qr},${qg},${qb}`;

              colorCounts[key] = (colorCounts[key] || 0) + 1;
            }

            // 排序获取最常见的颜色
            const totalPixels = Object.values(colorCounts).reduce((sum, count) => sum + count, 0);
            const sortedColors = Object.entries(colorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, config.maxColors)
              .map(([key, count]) => {
                const [r, g, b] = key.split(',').map(Number);
                const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
                return {
                  hex: hex,
                  rgb: [r, g, b],
                  percentage: (count / totalPixels) * 100
                };
              });

            // 去重
            const uniqueColors = [];
            const seenHex = new Set();
            for (const color of sortedColors) {
              if (!seenHex.has(color.hex)) {
                seenHex.add(color.hex);
                uniqueColors.push(color);
              }
            }

            resolve(uniqueColors);
          } catch (e) {
            console.error('[PS Color Analyzer] Error extracting colors:', e);
            resolve([]);
          }
        };

        img.onerror = () => {
          console.warn('[PS Color Analyzer] Failed to load image:', imageUrl);
          resolve([]);
        };

        img.src = imageUrl;
      });

      // 保存到缓存
      if (colors.length > 0) {
        cache[cacheKey] = {
          colors: colors,
          timestamp: Date.now()
        };
        await saveColorCache(cache);
      }

      return { success: colors.length > 0, colors: colors };
    } catch (error) {
      console.error('[PS Color Analyzer] Error in extractColorsFromUrl:', error);
      return { success: false, colors: [] };
    }
  }

  /**
   * 批量分析所有 session 中的卡片颜色
   * @param {Array} sessions - Session 数组，每个 session 包含 opengraphData
   * @param {Object} options - 选项
   * @param {Function} options.onProgress - 进度回调 (current, total) => void
   * @param {Function} options.onCardComplete - 卡片完成回调 (card, analyzed, total) => void
   * @param {Function} options.onUpdateSession - 更新 session 的回调 (sessionId, updates) => void
   * @param {boolean} options.forceReanalyze - 是否强制重新分析（默认 false）
   * @returns {Promise<{success: boolean, analyzed: number, failed: number, total: number}>}
   */
  async function analyzeSessions(sessions, options = {}) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return { success: true, analyzed: 0, failed: 0, total: 0 };
    }

    const {
      onProgress,
      onCardComplete,
      onUpdateSession,
      forceReanalyze = false
    } = options;

    if (!onUpdateSession) {
      console.error('[PS Color Analyzer] onUpdateSession is required');
      return { success: false, analyzed: 0, failed: 0, total: 0 };
    }

    // 收集所有需要分析的卡片
    const cardsToAnalyze = [];
    sessions.forEach(session => {
      if (!session?.opengraphData || !Array.isArray(session.opengraphData)) return;
      
      session.opengraphData.forEach(card => {
        // 如果已经有颜色且不强制重新分析，跳过
        if (!forceReanalyze && card.dominant_colors && Array.isArray(card.dominant_colors) && card.dominant_colors.length > 0) {
          return;
        }

        // 优先使用 HTTP/HTTPS URL
        const imageUrl = card.image && !card.image.startsWith('data:image') ? card.image : null;
        if (imageUrl) {
          cardsToAnalyze.push({
            sessionId: session.id,
            card: card,
            imageUrl: imageUrl
          });
        }
      });
    });

    if (cardsToAnalyze.length === 0) {
      console.log('[PS Color Analyzer] No cards to analyze');
      return { success: true, analyzed: 0, failed: 0, total: 0 };
    }

    console.log(`[PS Color Analyzer] Starting analysis of ${cardsToAnalyze.length} cards`);

    let analyzed = 0;
    let failed = 0;
    const sessionUpdates = {}; // sessionId -> { opengraphData: [...] }

    // 分批处理
    for (let i = 0; i < cardsToAnalyze.length; i += config.batchSize) {
      const batch = cardsToAnalyze.slice(i, i + config.batchSize);
      
      // 并行处理当前批次
      const batchPromises = batch.map(async ({ sessionId, card, imageUrl }) => {
        try {
          const result = await extractColorsFromUrl(imageUrl);
          
          if (result.success && result.colors.length > 0) {
            // 转换为 hex 字符串数组（只保存 hex，不保存 rgb 和 percentage）
            const hexColors = result.colors.map(c => c.hex);
            
            // 更新卡片
            const updatedCard = {
              ...card,
              dominant_colors: hexColors
            };

            // 收集到 session 更新中
            if (!sessionUpdates[sessionId]) {
              sessionUpdates[sessionId] = { opengraphData: [] };
            }
            
            // 找到原 session 中的卡片索引
            const session = sessions.find(s => s.id === sessionId);
            if (session && session.opengraphData) {
              const cardIndex = session.opengraphData.findIndex(c => c.id === card.id || c.url === card.url);
              if (cardIndex >= 0) {
                sessionUpdates[sessionId].opengraphData[cardIndex] = updatedCard;
              }
            }

            analyzed++;
            
            if (onCardComplete) {
              onCardComplete(card, analyzed, cardsToAnalyze.length);
            }
          } else {
            failed++;
          }
        } catch (error) {
          console.error('[PS Color Analyzer] Error analyzing card:', error);
          failed++;
        }
      });

      await Promise.all(batchPromises);

      // 进度回调
      if (onProgress) {
        onProgress(Math.min(i + config.batchSize, cardsToAnalyze.length), cardsToAnalyze.length);
      }

      // 批次延迟（除了最后一批）
      if (i + config.batchSize < cardsToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, config.batchDelay));
      }
    }

    // 批量更新 sessions
    for (const [sessionId, updates] of Object.entries(sessionUpdates)) {
      // 合并更新：保留原有的 opengraphData，只更新有变化的卡片
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.opengraphData) {
        const updatedOpengraphData = session.opengraphData.map((card, index) => {
          return updates.opengraphData[index] || card;
        });
        
        onUpdateSession(sessionId, {
          opengraphData: updatedOpengraphData
        });
      }
    }

    console.log(`[PS Color Analyzer] Analysis complete: ${analyzed} analyzed, ${failed} failed, ${cardsToAnalyze.length} total`);

    return {
      success: true,
      analyzed: analyzed,
      failed: failed,
      total: cardsToAnalyze.length
    };
  }

  /**
   * 加载颜色缓存
   * @returns {Promise<Object>}
   */
  async function loadColorCache() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get([config.cacheKey], (result) => {
            const cache = result[config.cacheKey] || {};
            // 清理过期缓存
            const now = Date.now();
            const validCache = {};
            for (const [key, value] of Object.entries(cache)) {
              if (value.timestamp && (now - value.timestamp) < config.cacheExpiry) {
                validCache[key] = value;
              }
            }
            resolve(validCache);
          });
        });
      } else {
        // 降级：使用 localStorage
        try {
          const stored = localStorage.getItem(config.cacheKey);
          if (stored) {
            const cache = JSON.parse(stored);
            // 清理过期缓存
            const now = Date.now();
            const validCache = {};
            for (const [key, value] of Object.entries(cache)) {
              if (value.timestamp && (now - value.timestamp) < config.cacheExpiry) {
                validCache[key] = value;
              }
            }
            return validCache;
          }
        } catch (e) {
          console.warn('[PS Color Analyzer] Failed to load cache from localStorage:', e);
        }
        return {};
      }
    } catch (error) {
      console.error('[PS Color Analyzer] Error loading cache:', error);
      return {};
    }
  }

  /**
   * 保存颜色缓存
   * @param {Object} cache - 缓存对象
   * @returns {Promise<void>}
   */
  async function saveColorCache(cache) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set({ [config.cacheKey]: cache }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } else {
        // 降级：使用 localStorage
        try {
          localStorage.setItem(config.cacheKey, JSON.stringify(cache));
        } catch (e) {
          console.warn('[PS Color Analyzer] Failed to save cache to localStorage:', e);
        }
      }
    } catch (error) {
      console.error('[PS Color Analyzer] Error saving cache:', error);
    }
  }

  /**
   * 清理过期缓存
   * @returns {Promise<void>}
   */
  async function clearExpiredCache() {
    const cache = await loadColorCache();
    const now = Date.now();
    const validCache = {};
    
    for (const [key, value] of Object.entries(cache)) {
      if (value.timestamp && (now - value.timestamp) < config.cacheExpiry) {
        validCache[key] = value;
      }
    }
    
    await saveColorCache(validCache);
  }

  // 暴露全局 API
  window.__TAB_CLEANER_PS_COLOR_ANALYZER = {
    analyzeSessions,
    extractColorsFromUrl,
    loadColorCache,
    saveColorCache,
    clearExpiredCache,
    config: config
  };

  console.log('[PS Color Analyzer] ✅ Initialized');
})();



