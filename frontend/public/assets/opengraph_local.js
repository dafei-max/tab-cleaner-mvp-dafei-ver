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

  // 避免重复加载
  if (window.__TAB_CLEANER_OPENGRAPH_LOCAL) {
    return;
  }
  window.__TAB_CLEANER_OPENGRAPH_LOCAL = true;

  /**
   * 从当前页面提取 OpenGraph 数据
   * @returns {Object} OpenGraph 数据
   */
  function extractOpenGraphLocal() {
    const result = {
      url: window.location.href,
      title: '',
      description: '',
      image: '',
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
      } else {
        // Pinterest 特殊处理：查找 pinimg.com 图片
        const isPinterest = window.location.hostname.includes('pinterest.com');
        if (isPinterest) {
          // 查找 pinimg.com 图片（Pinterest 的 CDN）
          const pinimgImages = Array.from(document.querySelectorAll('img')).filter(img => {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            return src.includes('pinimg.com');
          });
          
          if (pinimgImages.length > 0) {
            // 选择最大的图片（通常是主图）
            let largestImage = null;
            let largestSize = 0;
            
            pinimgImages.forEach(img => {
              const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
              const width = img.naturalWidth || img.width || 0;
              const height = img.naturalHeight || img.height || 0;
              const size = width * height;
              
              if (size > largestSize && width >= 200 && height >= 200) {
                largestSize = size;
                largestImage = src;
              }
            });
            
            if (largestImage) {
              result.image = largestImage;
            }
          }
        }
        
        // 如果没有找到图片，尝试找第一个大图
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

    return result;
  }

  /**
   * 发送 OpenGraph 数据到 background script
   */
  function sendOpenGraphToBackground() {
    const ogData = extractOpenGraphLocal();
    
    // 发送消息到 background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'opengraph-local',
        data: ogData
      }).catch(err => {
        console.warn('[OpenGraph Local] Failed to send to background:', err);
      });
    }
  }

  /**
   * 暴露全局函数供外部调用
   * 可以等待页面加载完成后再提取（对于动态内容）
   */
  window.__TAB_CLEANER_GET_OPENGRAPH = function(waitForLoad = false) {
    if (waitForLoad && document.readyState !== 'complete') {
      // 如果页面还在加载，等待一下
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve(extractOpenGraphLocal());
        } else {
          window.addEventListener('load', () => {
            // 等待动态内容加载（特别是 Pinterest 等动态页面）
            setTimeout(() => {
              resolve(extractOpenGraphLocal());
            }, 2000);
          }, { once: true });
        }
      });
    }
    return extractOpenGraphLocal();
  };

  // 页面加载完成后自动提取（可选）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendOpenGraphToBackground);
  } else {
    // 页面已加载，延迟一下确保动态内容加载
    setTimeout(sendOpenGraphToBackground, 1000);
  }

  console.log('[OpenGraph Local] Loaded and ready');
})();
