/**
 * 本地 OpenGraph 抓取工具
 * 在 Content Script 中运行，可以直接访问页面的 DOM
 * 优势：
 * 1. 使用用户的浏览器会话（可以访问需要登录的页面）
 * 2. 绕过风控（使用真实浏览器环境）
 * 3. 减少后端负载
 */

(function() {
  'use strict';

  console.log('[OpenGraph Local] Script starting execution...');
  console.log('[OpenGraph Local] Document readyState:', document.readyState);
  console.log('[OpenGraph Local] Window location:', window.location.href);

  // ✅ 避免重复加载，但如果函数不存在，允许重新加载
  if (window.__TAB_CLEANER_OPENGRAPH_LOCAL && typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function') {
    console.log('[OpenGraph Local] Already loaded and function exists, skipping...');
    return;
  }
  
  // 如果标志已设置但函数不存在，重置标志（可能是之前的加载失败了）
  if (window.__TAB_CLEANER_OPENGRAPH_LOCAL && typeof window.__TAB_CLEANER_GET_OPENGRAPH !== 'function') {
    console.warn('[OpenGraph Local] Flag set but function missing, reloading...');
    window.__TAB_CLEANER_OPENGRAPH_LOCAL = false;
  }
  
  try {
    window.__TAB_CLEANER_OPENGRAPH_LOCAL = true;
    console.log('[OpenGraph Local] Flag set:', window.__TAB_CLEANER_OPENGRAPH_LOCAL);
  } catch (e) {
    console.error('[OpenGraph Local] Failed to set flag:', e);
    // 继续执行，即使设置标志失败
  }

  /**
   * 🆕 从已渲染的 <img> 元素生成缩略图
   * 利用已加载的图片缓存，无需重新下载
   * @param {HTMLImageElement} imgElement - 图片元素
   * @returns {string|null} - thumbnail base64 或 null
   */
  function generateThumbnailFromElement(imgElement) {
    if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
      return null;
    }
    
    const THUMBNAIL_SIZE = 200;
    const THUMBNAIL_QUALITY = 0.7;
    
    try {
      const ratio = Math.min(1, THUMBNAIL_SIZE / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
      const targetW = Math.round(imgElement.naturalWidth * ratio);
      const targetH = Math.round(imgElement.naturalHeight * ratio);
      
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, targetW, targetH);
      
      // 尝试读取像素（检测 CORS 污染）
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch (corsError) {
        console.warn('[OG Thumbnail] Canvas tainted by CORS:', imgElement.src?.substring(0, 50));
        return null;
      }
      
      const thumbnail = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
      const sizeKB = (thumbnail.length / 1024).toFixed(1);
      console.log(`[OG Thumbnail] ✅ Generated: ${targetW}x${targetH}, ${sizeKB}KB`);
      return thumbnail;
    } catch (e) {
      console.warn('[OG Thumbnail] Failed:', e.message);
      return null;
    }
  }

  /**
   * 从当前页面提取 OpenGraph 数据
   * @returns {Object} OpenGraph 数据
   */
  function extractOpenGraphLocal() {
    const result = {
      url: window.location.href,
      title: '',
      description: '',
      image: '', // ✅ 确保 image 始终是字符串，不是数组
      thumbnail: null, // 🆕 小缩略图用于后端打标
      site_name: '',
      success: false,
      error: null,
      is_local_fetch: true, // 标记为本地抓取
    };

    try {
      // 1. 提取 OpenGraph 标签
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const ogSiteName = document.querySelector('meta[property="og:site_name"]');
      const ogImageWidth = document.querySelector('meta[property="og:image:width"]');
      const ogImageHeight = document.querySelector('meta[property="og:image:height"]');

      // 2. 提取 Twitter Card 标签（作为后备）
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      const twitterImage = document.querySelector('meta[name="twitter:image"]');

      // 3. 提取标准 meta 标签（作为后备）
      const metaTitle = document.querySelector('meta[name="title"]') || document.querySelector('title');
      const metaDescription = document.querySelector('meta[name="description"]');

      // 4. 提取标题
      result.title = (
        ogTitle?.getAttribute('content') ||
        twitterTitle?.getAttribute('content') ||
        (metaTitle?.textContent || metaTitle?.getAttribute('content')) ||
        document.title ||
        window.location.href
      ).trim();

      // 5. 提取描述
      result.description = (
        ogDescription?.getAttribute('content') ||
        twitterDescription?.getAttribute('content') ||
        metaDescription?.getAttribute('content') ||
        ''
      ).trim();

      // 6. 提取图片
      const imageUrl = (
        ogImage?.getAttribute('content') ||
        twitterImage?.getAttribute('content') ||
        ''
      ).trim();

      if (imageUrl) {
        // 处理相对 URL
        try {
          result.image = new URL(imageUrl, window.location.href).href;
        } catch (e) {
          result.image = imageUrl;
        }
        
        // 🆕 尝试找到页面上渲染这个图片的 <img> 元素，生成 thumbnail
        const matchingImg = Array.from(document.querySelectorAll('img')).find(img => {
          const src = img.src || img.getAttribute('data-src') || '';
          return src === result.image || src === imageUrl;
        });
        if (matchingImg && matchingImg.complete && matchingImg.naturalWidth > 0) {
          result.thumbnail = generateThumbnailFromElement(matchingImg);
        }
      } else {
        // ✅ 瀑布流站点特殊处理：Pinterest、小红书等
        const hostname = window.location.hostname || '';
        const isPinterest = hostname.includes('pinterest.com');
        const isXiaohongshu = hostname.includes('xiaohongshu.com') || hostname.includes('xhslink.com');

        if (isPinterest || isXiaohongshu) {
          // 统一策略：从当前页面中找到「视口中用户正在看的那张大图」
          const allImages = Array.from(document.querySelectorAll('img'));
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

          let largestImage = null;
          let largestImageElement = null; // 🆕 保存元素引用，用于生成 thumbnail
          let largestVisibleArea = 0;
          let largestTotalSize = 0;

          allImages.forEach(img => {
            const srcCandidate = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            if (!srcCandidate) return;

            // Pinterest 优先 pinimg CDN，小红书优先 xhscdn CDN；但如果没命中，也允许作为候选
            const lowerSrc = srcCandidate.toLowerCase();
            if (isPinterest && !lowerSrc.includes('pinimg.com')) {
              // 对 Pinterest，我们只关心 pinimg 的大图，避免抓到 UI 图片
              return;
            }
            if (isXiaohongshu && !lowerSrc.includes('xhscdn.com') && !lowerSrc.includes('xiaohongshu.com')) {
              // 小红书优先它的图片 CDN
              return;
            }

            const rect = img.getBoundingClientRect();
            if (!rect || rect.width < 120 || rect.height < 120) {
              // 过滤掉太小的缩略图 / 头像
              return;
            }

            const isHorizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
            const isVerticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
            if (!isHorizontallyVisible || !isVerticallyVisible) {
              return;
            }

            // 计算与视口的交集面积（可见面积）
            const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
            const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
            const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
            if (visibleArea <= 0) return;

            // 总面积用于在可见面积接近时做 tie-break
            const totalWidth = img.naturalWidth || img.width || 0;
            const totalHeight = img.naturalHeight || img.height || 0;
            const totalSize = totalWidth * totalHeight;

            const isBetterVisible = visibleArea > largestVisibleArea * 1.15;
            const isSimilarVisible = !isBetterVisible && visibleArea >= largestVisibleArea * 0.85;
            const isBetterTotal = isSimilarVisible && totalSize > largestTotalSize;

            if (isBetterVisible || isBetterTotal || !largestImage) {
              largestVisibleArea = visibleArea;
              largestTotalSize = totalSize;
              largestImage = srcCandidate;
              largestImageElement = img; // 🆕 保存元素引用
            }
          });

          if (largestImage) {
            result.image = largestImage;
            // 🆕 尝试从已渲染的元素生成 thumbnail
            if (largestImageElement) {
              result.thumbnail = generateThumbnailFromElement(largestImageElement);
            }
          }
        }

        // 如果仍然没有找到图片，尝试找第一个大图（通用兜底）
        if (!result.image) {
          const images = Array.from(document.querySelectorAll('img'));
          const largeImage = images.find(img => {
            // 检查多个可能的 src 属性
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            if (!src) return false;
            
            // 排除小图标、logo、avatar 等
            const excludeKeywords = ['icon', 'logo', 'avatar', 'favicon', 'sprite', 'button', 'arrow', 'badge'];
            if (excludeKeywords.some(keyword => src.toLowerCase().includes(keyword))) {
              return false;
            }
            
            // 检查图片尺寸
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            return width >= 200 && height >= 200;
          });
          
          if (largeImage) {
            result.image = largeImage.src || largeImage.getAttribute('data-src') || largeImage.getAttribute('data-lazy-src') || '';
            // 🆕 尝试从已渲染的元素生成 thumbnail
            if (!result.thumbnail) {
              result.thumbnail = generateThumbnailFromElement(largeImage);
            }
          }
        }
        
        // 处理相对 URL
        if (result.image && !result.image.startsWith('http://') && !result.image.startsWith('https://')) {
          try {
            result.image = new URL(result.image, window.location.href).href;
          } catch (e) {
            // 如果 URL 解析失败，尝试添加协议
            if (result.image.startsWith('//')) {
              result.image = 'https:' + result.image;
            }
          }
        }
      }

      // 7. 提取站点名称
      result.site_name = (
        ogSiteName?.getAttribute('content') ||
        new URL(window.location.href).hostname.replace(/^www\./, '') ||
        ''
      ).trim();

      // 8. 提取图片尺寸
      if (ogImageWidth) {
        result.image_width = parseInt(ogImageWidth.getAttribute('content'), 10) || null;
      }
      if (ogImageHeight) {
        result.image_height = parseInt(ogImageHeight.getAttribute('content'), 10) || null;
      }

      // 9. 判断是否成功（放宽条件：只要有 title 或 image 就算成功）
      // 即使 title 等于 URL，只要有数据也算成功
      const hasTitle = result.title && result.title.trim() && result.title !== window.location.href;
      const hasImage = result.image && result.image.trim();
      const hasDescription = result.description && result.description.trim();
      
      // 只要有 title、image 或 description 中的任何一个，就算成功
      result.success = !!(hasTitle || hasImage || hasDescription);
      
      // 如果 title 为空或等于 URL，尝试使用 document.title
      if (!hasTitle) {
        result.title = document.title || window.location.href;
        // 如果现在有 title 了，重新判断 success
        if (result.title && result.title !== window.location.href) {
          result.success = true;
        }
      }
      
      // 10. 确保不设置 is_doc_card（本地抓取不应该生成 doc 卡片）
      // 如果没有图片，让前端使用占位符，而不是 doc 卡片
      result.is_doc_card = false;
      
      // 11. 添加调试日志
      console.log('[OpenGraph Local] Extracted data:', {
        url: result.url,
        title: result.title,
        hasImage: !!result.image,
        image: result.image ? result.image.substring(0, 50) + '...' : null,
        success: result.success
      });

    } catch (error) {
      result.error = error.message || String(error);
      result.success = false;
      result.is_doc_card = false; // 即使失败也不应该是 doc 卡片
    }

    // 12. 无论成功与否，都保存到本地存储（作为后备）
    // 注意：opengraph_local.js 运行在页面上下文中，无法直接访问 chrome.storage
    // 使用 window.postMessage 与 content script 通信，content script 再保存到 chrome.storage
    console.log('[OpenGraph Local] 💾 Requesting cache save via postMessage...', {
      url: result.url,
      success: result.success,
      hasTitle: !!(result.title),
      hasImage: !!(result.image),
      image: result.image ? result.image.substring(0, 60) + '...' : null // 确保图片链接被记录
    });
    
    // 通过 window.postMessage 发送到 content script（content script 会监听并保存）
    try {
      const cacheData = {
        ...result,
        timestamp: Date.now(),
        cached: true
      };
      
      // 确保图片链接被包含
      if (!cacheData.image && result.image) {
        cacheData.image = result.image;
        console.log('[OpenGraph Local] ✅ Restored image URL:', cacheData.image.substring(0, 60) + '...');
      }
      
      // 发送到 content script
      window.postMessage({
        type: 'TAB_CLEANER_CACHE_OPENGRAPH',
        data: cacheData
      }, '*');
      
      console.log('[OpenGraph Local] ✅ Cache save message posted to window');
    } catch (messageError) {
      console.warn('[OpenGraph Local] ⚠️ Failed to post cache message:', messageError);
    }

    return result;
  }

  /**
   * 发送 OpenGraph 数据到 background script
   * 注意：这个函数在页面加载时自动调用，但可能在某些情况下失败
   * 所以使用 try-catch 包裹，避免影响主要功能
   */
  function sendOpenGraphToBackground() {
    try {
      const ogData = extractOpenGraphLocal();
      
      // 发送消息到 background script（可选，不影响主要功能）
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            action: 'opengraph-local',
            data: ogData
          }).catch(err => {
            // 静默失败，不影响主要功能
            console.debug('[OpenGraph Local] Failed to send to background (non-critical):', err);
          });
        } catch (e) {
          // 在某些页面（如 chrome://）可能无法使用 chrome.runtime
          console.debug('[OpenGraph Local] Cannot send message (non-critical):', e.message);
        }
      }
    } catch (error) {
      // 静默失败，不影响主要功能
      console.debug('[OpenGraph Local] sendOpenGraphToBackground failed (non-critical):', error);
    }
  }

  // ✅ 全局状态对象（用于消息通信）
  window.__OG_EXTRACTION_STATUS = {
    inProgress: false,
    completed: false,
    data: null,
    timestamp: Date.now()
  };

  // ✅ 优化：智能提取策略 - 立即提取 + 监听变化 + 延迟优化
  let extractionAttempts = 0;
  const MAX_EXTRACTION_ATTEMPTS = 3;
  let lastExtractedData = null;
  let lastExtractedUrl = null; // ✅ 追踪最后提取的 URL
  let mutationObserver = null;
  let retryTimeout = null;

  /**
   * 检查提取的数据是否完整
   */
  function isDataComplete(data) {
    if (!data) return false;
    const hasTitle = data.title && data.title.trim() && data.title !== window.location.href;
    const hasImage = data.image && data.image.trim();
    const hasDescription = data.description && data.description.trim();
    return hasTitle || hasImage || hasDescription;
  }

  /**
   * 重置提取状态（用于 URL 变化时）
   */
  function resetExtractionState() {
    console.log('[OpenGraph Local] 🔄 Resetting extraction state for new URL');
    extractionAttempts = 0;
    lastExtractedData = null;
    lastExtractedUrl = window.location.href;
    
    // 清理现有的监听器
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  }

  /**
   * 检查 URL 是否变化，如果变化则重新提取
   */
  function checkUrlAndReextract() {
    const currentUrl = window.location.href;
    
    // 如果 URL 没有变化，不需要重新提取
    if (lastExtractedUrl === currentUrl) {
      return;
    }
    
    console.log('[OpenGraph Local] 🔄 URL changed:', {
      from: lastExtractedUrl,
      to: currentUrl
    });
    
    // 重置状态并立即重新提取
    resetExtractionState();
    
    // 立即提取新 URL 的数据
    const newData = extractOpenGraphLocal();
    lastExtractedData = newData;
    lastExtractedUrl = currentUrl;
    
    console.log('[OpenGraph Local] ✅ Re-extracted for new URL:', {
      success: newData.success,
      hasTitle: !!(newData.title),
      hasImage: !!(newData.image)
    });
    
    // 发送到后台
    sendOpenGraphToBackground();
    
    // 如果数据不完整，设置监听和重试
    if (!isDataComplete(newData)) {
      setupMutationObserver();
      if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
        setTimeout(() => {
          smartExtract();
        }, 500);
      }
    } else {
      setupMutationObserver();
    }
  }

  /**
   * 智能提取：立即提取 + 如果数据不完整则监听变化
   */
  function smartExtract() {
    extractionAttempts++;
    const currentData = extractOpenGraphLocal();
    
    // 更新 URL 记录
    lastExtractedUrl = window.location.href;
    
    // 如果数据完整，立即保存
    if (isDataComplete(currentData)) {
      console.log(`[OpenGraph Local] ✅ Complete data extracted (attempt ${extractionAttempts})`);
      lastExtractedData = currentData;
      sendOpenGraphToBackground();
      
      // 如果已经有完整数据，停止监听（避免重复提取）
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      return;
    }

    // 如果数据不完整，保存当前数据（可能后续会优化）
    if (!lastExtractedData || !isDataComplete(lastExtractedData)) {
      lastExtractedData = currentData;
      sendOpenGraphToBackground();
    }

    // 如果还没达到最大尝试次数，继续监听
    if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
      // 设置重试（延迟递增：500ms, 1500ms, 3000ms）
      const delays = [500, 1500, 3000];
      const delay = delays[extractionAttempts - 1] || 3000;
      
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      
      retryTimeout = setTimeout(() => {
        console.log(`[OpenGraph Local] 🔄 Retry extraction (attempt ${extractionAttempts + 1}/${MAX_EXTRACTION_ATTEMPTS})`);
        smartExtract();
      }, delay);
    } else {
      console.log(`[OpenGraph Local] ⚠️ Max extraction attempts reached, using best available data`);
    }
  }

  /**
   * 带等待的 OpenGraph 抓取（支持动态加载的 OG 标签）
   * 使用 MutationObserver 监听动态插入的 OG 标签
   */
  async function extractOpenGraphWithWait(maxWaitTime = 8000) {
    window.__OG_EXTRACTION_STATUS.inProgress = true;
    window.__OG_EXTRACTION_STATUS.completed = false;
    
    console.log('[OG] Starting extractOpenGraphWithWait, maxWaitTime:', maxWaitTime);
    
    // 第一次抓取
    let ogData = extractOpenGraphLocal();
    
    // 如果已经有图片，立即返回
    if (ogData.image && ogData.image.trim()) {
      console.log('[OG] ✅ Got OG image immediately');
      window.__OG_EXTRACTION_STATUS = {
        inProgress: false,
        completed: true,
        data: ogData,
        timestamp: Date.now()
      };
      return ogData;
    }
    
    // 没有图片，等待动态加载
    console.log('[OG] No image found, waiting for dynamic OG tags...');
    
    return new Promise((resolve) => {
      let resolved = false;
      const startTime = Date.now();
      const checkInterval = 300;
      
      // 使用 MutationObserver 监听 OG 标签
      const observer = new MutationObserver(() => {
        if (resolved) return;
        
        const newOgData = extractOpenGraphLocal();
        if (newOgData.image && newOgData.image.trim()) {
          resolved = true;
          observer.disconnect();
          
          window.__OG_EXTRACTION_STATUS = {
            inProgress: false,
            completed: true,
            data: newOgData,
            timestamp: Date.now()
          };
          
          console.log('[OG] ✅ Got OG image after mutation');
          resolve(newOgData);
        }
      });
      
      // 监听 head 中的变化
      observer.observe(document.head || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['content', 'property', 'name']
      });
      
      // 轮询检查（每 300ms 检查一次）
      const pollInterval = setInterval(() => {
        if (resolved) {
          clearInterval(pollInterval);
          return;
        }
        
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxWaitTime) {
          resolved = true;
          observer.disconnect();
          clearInterval(pollInterval);
          
          const finalOgData = extractOpenGraphLocal();
          window.__OG_EXTRACTION_STATUS = {
            inProgress: false,
            completed: true,
            data: finalOgData,
            timestamp: Date.now()
          };
          
          if (finalOgData.image && finalOgData.image.trim()) {
            console.log('[OG] ✅ Got OG image after polling');
          } else {
            console.log('[OG] ⚠️ Timeout, no OG image found');
          }
          
          resolve(finalOgData);
        } else {
          // 重新抓取（处理 React/Vue SPA）
          const currentOgData = extractOpenGraphLocal();
          if (currentOgData.image && currentOgData.image.trim()) {
            resolved = true;
            observer.disconnect();
            clearInterval(pollInterval);
            
            window.__OG_EXTRACTION_STATUS = {
              inProgress: false,
              completed: true,
              data: currentOgData,
              timestamp: Date.now()
            };
            
            console.log('[OG] ✅ Got OG image after waiting');
            resolve(currentOgData);
          }
        }
      }, checkInterval);
      
      // 超时断开（5秒后放弃，返回无图片的数据）
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          clearInterval(pollInterval);
          
          const finalOgData = extractOpenGraphLocal();
          window.__OG_EXTRACTION_STATUS = {
            inProgress: false,
            completed: true,
            data: finalOgData,
            timestamp: Date.now()
          };
          
          console.log('[OG] ⚠️ Timeout, no OG image found');
          resolve(finalOgData);
        }
      }, Math.min(maxWaitTime, 5000));
    });
  }

  /**
   * 使用 MutationObserver 监听 DOM 变化
   * 当检测到 OG 标签或图片变化时，立即重新提取
   */
  function setupMutationObserver() {
    if (mutationObserver) return; // 已经设置过了

    mutationObserver = new MutationObserver((mutations) => {
      let shouldReExtract = false;
      
      for (const mutation of mutations) {
        // 检查是否有新的 meta 标签添加（OG 标签）
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              const tagName = node.tagName?.toLowerCase();
              if (tagName === 'meta' && (
                node.getAttribute('property')?.startsWith('og:') ||
                node.getAttribute('name')?.startsWith('twitter:')
              )) {
                shouldReExtract = true;
                break;
              }
              // 检查是否有新的图片添加
              if (tagName === 'img' || node.querySelector?.('img')) {
                shouldReExtract = true;
                break;
              }
            }
          }
        }
        
        // 检查 OG 标签的属性变化
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          if (attrName === 'content' || attrName === 'property' || attrName === 'name') {
            const target = mutation.target;
            if (target.tagName?.toLowerCase() === 'meta' && (
              target.getAttribute('property')?.startsWith('og:') ||
              target.getAttribute('name')?.startsWith('twitter:')
            )) {
              shouldReExtract = true;
              break;
            }
          }
        }
        
        if (shouldReExtract) break;
      }
      
      if (shouldReExtract && extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
        console.log('[OpenGraph Local] 🔍 DOM changed, re-extracting...');
        // 延迟一下，避免频繁提取
        if (retryTimeout) {
          clearTimeout(retryTimeout);
        }
        retryTimeout = setTimeout(() => {
          smartExtract();
        }, 200);
      }
    });

    // 监听 head 和 body 的变化
    mutationObserver.observe(document.head || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content', 'property', 'name', 'src', 'data-src', 'data-lazy-src']
    });

    if (document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-src', 'data-lazy-src']
      });
    }

    console.log('[OpenGraph Local] ✅ MutationObserver setup complete');
  }

  // ✅ 改进：立即执行初始提取 + 后续优化
  try {
    // 🚀 第一步：立即执行一次提取（不等待 load！这是关键）
    // 这确保用户快速点击"清理"时也能获取到数据
    console.log('[OpenGraph Local] [IMMEDIATE] Executing immediate extraction...');
    const immediateData = extractOpenGraphLocal();
    lastExtractedData = immediateData;
    lastExtractedUrl = window.location.href; // ✅ 记录当前 URL
    console.log('[OpenGraph Local] [IMMEDIATE] First extraction complete:', {
      success: immediateData.success,
      hasTitle: !!(immediateData.title),
      hasImage: !!(immediateData.image),
      url: lastExtractedUrl
    });
    
    // 第二步：发送到后台（可选，不影响主要功能）
    sendOpenGraphToBackground();
    
    // 第三步：如果数据不完整，继续监听和优化
    if (!isDataComplete(immediateData)) {
      console.log('[OpenGraph Local] Data not complete, setting up mutation observer and retries...');
      
      // 等待 DOMContentLoaded 再做一次更深入的扫描
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          console.log('[OpenGraph Local] DOMContentLoaded, attempting re-extraction...');
          if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
            smartExtract();
          }
        }, { once: true });
      } else {
        // 页面已加载，等待一下再尝试
        setTimeout(() => {
          console.log('[OpenGraph Local] Page already loaded, attempting delayed re-extraction...');
          if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
            smartExtract();
          }
        }, 500);
      }
      
      // 监听 load 事件做最后优化
      if (document.readyState !== 'complete') {
        window.addEventListener('load', () => {
          console.log('[OpenGraph Local] Window load event, final extraction attempt...');
          if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
            setTimeout(() => {
              smartExtract();
            }, 500);
          }
        }, { once: true });
      }
      
      // 设置 mutation observer
      setupMutationObserver();
    } else {
      console.log('[OpenGraph Local] ✅ Data already complete, skipping additional monitoring');
      // 数据已完整，但仍设置 observer 以防后续改变
      setupMutationObserver();
    }

    // ✅ 监听 URL 变化（SPA 支持，包括 Pinterest）
    let lastUrl = window.location.href;
    
    // 1. 监听 popstate 事件（浏览器前进/后退）
    window.addEventListener('popstate', () => {
      console.log('[OpenGraph Local] 🔄 popstate event detected');
      lastUrl = window.location.href;
      checkUrlAndReextract();
    });
    
    // 2. 监听 hashchange（虽然 Pinterest 可能不用，但为了兼容性）
    window.addEventListener('hashchange', () => {
      console.log('[OpenGraph Local] 🔄 hashchange event detected');
      lastUrl = window.location.href;
      checkUrlAndReextract();
    });

    // 3. 拦截 history.pushState 和 history.replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        console.log('[OpenGraph Local] 🔄 pushState detected, URL changed:', newUrl);
        lastUrl = newUrl;
        // 延迟一下，确保 DOM 已更新（Pinterest 等 SPA 需要时间）
        setTimeout(() => checkUrlAndReextract(), 300);
      }
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        console.log('[OpenGraph Local] 🔄 replaceState detected, URL changed:', newUrl);
        lastUrl = newUrl;
        // 延迟一下，确保 DOM 已更新
        setTimeout(() => checkUrlAndReextract(), 300);
      }
    };
    
    // 4. ✅ 定期检查 URL 变化（Pinterest 等可能直接修改 location.href）
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        console.log('[OpenGraph Local] 🔄 URL changed via location.href:', currentUrl);
        lastUrl = currentUrl;
        checkUrlAndReextract();
      }
    }, 1000); // 每秒检查一次

    console.log('[OpenGraph Local] ✅ URL change detection setup complete');

  } catch (e) {
    // 静默失败，不影响主要功能
    console.debug('[OpenGraph Local] Auto-send setup failed (non-critical):', e);
  }

  // ✅ 确保函数被正确暴露（使用 try-catch 包裹，确保即使出错也能暴露函数）
  // 注意：这个函数必须在脚本执行时立即暴露，不能延迟
  console.log('[OpenGraph Local] About to expose function...');
  console.log('[OpenGraph Local] Current window object:', typeof window);
  console.log('[OpenGraph Local] Can access window?', window !== undefined);
  
  try {
    /**
     * 暴露全局函数供外部调用
     * 可以等待页面加载完成后再提取（对于动态内容）
     */
    const openGraphFunction = function(waitForLoad = false) {
      console.log('[OpenGraph Local] Function called with waitForLoad:', waitForLoad);
      
      // ✅ 检查 URL 是否变化
      const currentUrl = window.location.href;
      if (lastExtractedUrl !== currentUrl) {
        console.log('[OpenGraph Local] ⚠️ URL changed since last extraction, re-extracting...');
        checkUrlAndReextract();
      }
      
      // 如果不需要等待，直接返回结果（优先使用已提取的数据）
      if (!waitForLoad) {
        // 如果有已提取的完整数据，优先使用
        if (lastExtractedData && isDataComplete(lastExtractedData)) {
          console.log('[OpenGraph Local] ✅ Using cached complete data');
          return lastExtractedData;
        }
        // 否则立即提取
        return extractOpenGraphLocal();
      }
      
      // 如果需要等待，使用智能提取策略
      return new Promise((resolve) => {
        // 如果已经有完整数据，直接返回
        if (lastExtractedData && isDataComplete(lastExtractedData)) {
          console.log('[OpenGraph Local] ✅ Using cached complete data (waitForLoad)');
          resolve(lastExtractedData);
          return;
        }

        // 立即提取一次
        const immediateData = extractOpenGraphLocal();
        if (isDataComplete(immediateData)) {
          lastExtractedData = immediateData;
          resolve(immediateData);
          return;
        }

        // 如果数据不完整，等待一段时间后重试
        let attempts = 0;
        const maxAttempts = 3;
        const delays = [300, 800, 1500]; // 递增延迟

        const tryExtract = () => {
          attempts++;
          const data = extractOpenGraphLocal();
          
          if (isDataComplete(data) || attempts >= maxAttempts) {
            lastExtractedData = data;
            resolve(data);
            return;
          }

          // 继续重试
          setTimeout(tryExtract, delays[attempts - 1] || 1500);
        };

        // 如果页面已经加载完成，延迟一下确保动态内容加载
        if (document.readyState === 'complete') {
          setTimeout(tryExtract, 300);
        } else {
          // 等待 load 事件
          window.addEventListener('load', () => {
            setTimeout(tryExtract, 300);
          }, { once: true });
        }
      });
    };
    
    // 尝试多种方式暴露函数
    try {
      window.__TAB_CLEANER_GET_OPENGRAPH = openGraphFunction;
      console.log('[OpenGraph Local] ✅ Function assigned to window.__TAB_CLEANER_GET_OPENGRAPH');
    } catch (e1) {
      console.error('[OpenGraph Local] Failed to assign to window:', e1);
      // 尝试直接设置
      try {
        Object.defineProperty(window, '__TAB_CLEANER_GET_OPENGRAPH', {
          value: openGraphFunction,
          writable: true,
          configurable: true
        });
        console.log('[OpenGraph Local] ✅ Function assigned via defineProperty');
      } catch (e2) {
        console.error('[OpenGraph Local] Failed to assign via defineProperty:', e2);
        throw e2;
      }
    }
    
    console.log('[OpenGraph Local] ✅ Loaded and ready');
    console.log('[OpenGraph Local] Function available:', typeof window.__TAB_CLEANER_GET_OPENGRAPH);
    console.log('[OpenGraph Local] Function is function?', typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function');
    console.log('[OpenGraph Local] Function value:', window.__TAB_CLEANER_GET_OPENGRAPH);
    
    // 验证函数是否真的可用
    if (typeof window.__TAB_CLEANER_GET_OPENGRAPH !== 'function') {
      throw new Error('Function was not properly assigned');
    }
  } catch (error) {
    console.error('[OpenGraph Local] ❌ Failed to expose function:', error);
    console.error('[OpenGraph Local] Error name:', error.name);
    console.error('[OpenGraph Local] Error message:', error.message);
    console.error('[OpenGraph Local] Error stack:', error.stack);
    // 即使出错，也尝试暴露一个基础函数
    try {
      window.__TAB_CLEANER_GET_OPENGRAPH = function() {
        return {
          url: window.location.href,
          title: document.title || window.location.href,
          success: false,
          error: 'OpenGraph function initialization failed: ' + error.message,
          is_doc_card: false,
        };
      };
      console.log('[OpenGraph Local] ⚠️ Fallback function exposed');
    } catch (fallbackError) {
      console.error('[OpenGraph Local] ❌ Even fallback function failed:', fallbackError);
    }
  }
  
  // ✅ 消息监听器（处理来自 background.js 的消息）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'sync-url') {
        // ✅ 同步 URL，确保使用最新的 URL
        const newUrl = request.url || window.location.href;
        if (newUrl !== window.location.href) {
          console.log('[OG] ⚠️ URL mismatch, current:', window.location.href, 'expected:', newUrl);
        }
        // 如果 URL 不匹配，重置状态
        if (lastExtractedUrl !== newUrl) {
          console.log('[OG] 🔄 Resetting extraction state for URL sync');
          resetExtractionState();
          lastExtractedUrl = newUrl;
        }
        sendResponse({ ok: true, url: window.location.href });
        return true;
      }
      
      if (request.action === 'extract-opengraph-with-wait') {
        console.log('[OG] Received extract-opengraph-with-wait message', {
          forceReextract: request.forceReextract,
          maxWaitTime: request.maxWaitTime
        });
        
        // ✅ 如果强制重新提取，重置状态
        if (request.forceReextract) {
          console.log('[OG] 🔄 Force re-extract requested, resetting state');
          resetExtractionState();
          lastExtractedUrl = window.location.href; // 更新为当前 URL
        }
        
        extractOpenGraphWithWait(request.maxWaitTime || 8000).then(data => {
          sendResponse(data);
        }).catch(err => {
          console.error('[OG] extractOpenGraphWithWait failed:', err);
          const fallbackData = extractOpenGraphLocal();
          sendResponse(fallbackData);
        });
        return true; // 异步响应
      }
      
      if (request.action === 'get-opengraph-status') {
        console.log('[OG] Received get-opengraph-status message');
        sendResponse(window.__OG_EXTRACTION_STATUS || {
          inProgress: false,
          completed: false,
          data: null,
          timestamp: Date.now()
        });
        return true;
      }
      
      // 兼容旧的 action
      if (request.action === 'extract-opengraph') {
        const data = extractOpenGraphLocal();
        window.__OG_EXTRACTION_STATUS = {
          inProgress: false,
          completed: true,
          data,
          timestamp: Date.now()
        };
        sendResponse(data);
        return true;
      }
    });
    
    console.log('[OpenGraph Local] ✅ Message listener registered');
  }

  console.log('[OpenGraph Local] Script execution completed');
  console.log('[OpenGraph Local] Final check - Function available:', typeof window.__TAB_CLEANER_GET_OPENGRAPH);
  console.log('[OpenGraph Local] Final check - Function is function?', typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function');
  
  // ✅ 最终验证：如果函数仍然不存在，强制暴露一个基础函数
  if (typeof window.__TAB_CLEANER_GET_OPENGRAPH !== 'function') {
    console.error('[OpenGraph Local] ⚠️ CRITICAL: Function still not available after all attempts, forcing fallback');
    try {
      window.__TAB_CLEANER_GET_OPENGRAPH = function(waitForLoad = false) {
        console.warn('[OpenGraph Local] Using forced fallback function');
        const result = {
          url: window.location.href,
          title: document.title || window.location.href,
          description: '',
          image: '',
          site_name: '',
          success: false,
          error: 'OpenGraph function initialization failed - using fallback',
          is_local_fetch: true,
          is_doc_card: false,
        };
        
        // 尝试提取基本数据
        try {
          const ogTitle = document.querySelector('meta[property="og:title"]');
          const ogImage = document.querySelector('meta[property="og:image"]');
          const ogDescription = document.querySelector('meta[property="og:description"]');
          
          if (ogTitle) result.title = ogTitle.getAttribute('content') || result.title;
          if (ogImage) {
            const imgUrl = ogImage.getAttribute('content') || '';
            if (imgUrl) {
              try {
                result.image = new URL(imgUrl, window.location.href).href;
              } catch (e) {
                result.image = imgUrl;
              }
            }
          }
          if (ogDescription) result.description = ogDescription.getAttribute('content') || '';
          
          if (result.title && result.title !== window.location.href) {
            result.success = true;
          }
        } catch (e) {
          console.error('[OpenGraph Local] Fallback extraction error:', e);
        }
        
        return waitForLoad ? Promise.resolve(result) : result;
      };
      console.log('[OpenGraph Local] ✅ Forced fallback function exposed');
    } catch (e) {
      console.error('[OpenGraph Local] ❌ Failed to expose forced fallback:', e);
    }
  }
})();
