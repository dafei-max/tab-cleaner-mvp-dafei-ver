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
        // 如果没有 OG 图片，尝试找第一个大图
        const images = Array.from(document.querySelectorAll('img[src]'));
        const largeImage = images.find(img => {
          const src = img.src;
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
          result.image = largeImage.src;
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

      // 9. 判断是否成功
      result.success = !!(result.title && result.title !== window.location.href);

    } catch (error) {
      result.error = error.message || String(error);
      result.success = false;
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
   */
  window.__TAB_CLEANER_GET_OPENGRAPH = function() {
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
