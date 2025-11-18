/**
 * 本地 OpenGraph 抓取工具
 * 在 content script 中运行，利用用户已登录的会话来抓取 OpenGraph 数据
 * 这对于需要登录的网站（如小红书）特别有用
 */

/**
 * 从当前页面抓取 OpenGraph 数据
 * @returns {Object} OpenGraph 数据对象
 */
function fetchLocalOpenGraph() {
  const result = {
    url: window.location.href,
    title: '',
    description: '',
    image: '',
    site_name: '',
    success: false,
  };

  try {
    // 1. 获取 og:title 或 document.title（参考测试脚本的 best_text 逻辑）
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const metaTitle = document.querySelector('meta[name="og:title"]');
    const docTitle = document.title;
    
    // 优先级：og:title > meta[name="og:title"] > document.title
    result.title = (ogTitle ? ogTitle.getAttribute('content') : null) ||
                   (metaTitle ? metaTitle.getAttribute('content') : null) ||
                   (docTitle ? docTitle.trim() : null) ||
                   '';

    // 2. 获取 og:description（参考测试脚本的 best_text 逻辑）
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const metaOgDesc = document.querySelector('meta[name="og:description"]');
    const metaDesc = document.querySelector('meta[name="description"]');
    
    // 优先级：og:description > meta[name="og:description"] > meta[name="description"]
    result.description = (ogDescription ? ogDescription.getAttribute('content') : null) ||
                        (metaOgDesc ? metaOgDesc.getAttribute('content') : null) ||
                        (metaDesc ? metaDesc.getAttribute('content') : null) ||
                        '';

    // 3. 获取 og:image（参考测试脚本的 normalize_img 逻辑）
    const ogImage = document.querySelector('meta[property="og:image"]');
    const metaOgImage = document.querySelector('meta[name="og:image"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    const twitterImageSrc = document.querySelector('meta[name="twitter:image:src"]');
    
    // 优先级：og:image > meta[name="og:image"] > twitter:image > twitter:image:src > 页面第一张图片
    let imageCandidate = (ogImage ? ogImage.getAttribute('content') : null) ||
                        (metaOgImage ? metaOgImage.getAttribute('content') : null) ||
                        (twitterImage ? twitterImage.getAttribute('content') : null) ||
                        (twitterImageSrc ? twitterImageSrc.getAttribute('content') : null);
    
    // 如果没有找到，从网页中智能提取图片
    if (!imageCandidate) {
      const images = Array.from(document.querySelectorAll('img[src]'));
      if (images.length > 0) {
        // 过滤掉小图标、logo等，选择最有代表性的图片
        const excludeKeywords = [
          'icon', 'logo', 'avatar', 'favicon', 'sprite',
          'button', 'arrow', 'badge', 'spinner', 'loader',
          'placeholder', 'blank', 'pixel', 'tracker', 'beacon'
        ];
        
        let bestImage = null;
        let bestScore = 0;
        
        for (const img of images) {
          const src = img.getAttribute('src') || '';
          if (!src) continue;
          
          // 跳过 data URI 和 SVG（通常是小图标）
          if (src.startsWith('data:') || src.endsWith('.svg')) continue;
          
          // 跳过包含排除关键词的图片
          const srcLower = src.toLowerCase();
          if (excludeKeywords.some(keyword => srcLower.includes(keyword))) continue;
          
          // 计算图片的"代表性"分数
          let score = 0;
          
          // 优先选择有 alt 文本的图片（通常是内容图片）
          if (img.getAttribute('alt')) score += 10;
          
          // 优先选择较大的图片（通过 class、id 等判断）
          const imgClass = img.className || '';
          const imgId = img.id || '';
          const classIdStr = (imgClass + ' ' + imgId).toLowerCase();
          
          // 内容相关的关键词加分
          const contentKeywords = ['content', 'main', 'article', 'post', 'image', 'photo', 'picture', 'cover', 'hero', 'banner'];
          if (contentKeywords.some(keyword => classIdStr.includes(keyword))) score += 5;
          
          // 优先选择绝对 URL
          if (src.startsWith('http://') || src.startsWith('https://')) score += 3;
          
          // 优先选择常见的图片格式
          if (/\.(jpg|jpeg|png|webp)/i.test(src)) score += 2;
          
          // 跳过明显的小图片（通过 URL 中的尺寸参数判断）
          if (/[^a-z](16|32|48|64)x(16|32|48|64)|[?&]w=(16|32|48|64)|[?&]h=(16|32|48|64)/i.test(src)) {
            score -= 10;
          }
          
          // 优先选择可见的图片（在视口中或已加载）
          const rect = img.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) score += 5;
          
          if (score > bestScore) {
            bestScore = score;
            bestImage = src;
          }
        }
        
        if (bestImage) {
          imageCandidate = bestImage;
          console.log(`[Local OpenGraph] Extracted image from HTML (score=${bestScore}):`, bestImage.substring(0, 80));
        }
      }
    }
    
    // 处理图片 URL（参考测试脚本的 normalize_img 逻辑）
    if (imageCandidate) {
      let imageUrl = imageCandidate.trim();
      // 处理 // 开头的协议相对 URL
      if (imageUrl.startsWith('//')) {
        result.image = window.location.protocol + imageUrl;
      }
      // 处理绝对 URL（http:// 或 https://）
      else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        result.image = imageUrl;
      }
      // 处理相对路径
      else {
        try {
          result.image = new URL(imageUrl, window.location.href).href;
        } catch (e) {
          // URL 解析失败，尝试简单的拼接
          if (imageUrl.startsWith('/')) {
            result.image = window.location.origin + imageUrl;
          } else {
            result.image = window.location.origin + '/' + imageUrl;
          }
        }
      }
    }

    // 4. 获取 og:site_name（参考测试脚本的 best_text 逻辑）
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    const metaOgSiteName = document.querySelector('meta[name="og:site_name"]');
    
    // 优先级：og:site_name > meta[name="og:site_name"] > 域名
    result.site_name = (ogSiteName ? ogSiteName.getAttribute('content') : null) ||
                      (metaOgSiteName ? metaOgSiteName.getAttribute('content') : null) ||
                      window.location.hostname.replace('www.', '') ||
                      '';

    // 5. 判断是否成功（至少要有 title 或 image）
    result.success = !!(result.title || result.image);

    // 6. 尝试获取图片尺寸（如果图片已加载）
    if (result.image) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = result.image;
        // 注意：这里不等待图片加载，因为可能跨域或需要登录
        // 图片尺寸会在后端或前端加载时获取
      } catch (e) {
        // 忽略错误
      }
    }

    return result;
  } catch (error) {
    console.error('[Local OpenGraph] Error fetching OpenGraph:', error);
    result.success = false;
    result.error = error.message;
    return result;
  }
}

/**
 * 批量抓取多个标签页的 OpenGraph（通过消息传递）
 * 这个函数在 background script 中调用，通过消息传递到各个 content script
 */
async function fetchLocalOpenGraphForTabs(tabIds) {
  const results = [];
  
  for (const tabId of tabIds) {
    try {
      // 向 content script 发送消息，请求抓取 OpenGraph
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'fetch-opengraph'
      });
      
      if (response && response.success) {
        results.push({
          ...response,
          tab_id: tabId,
        });
      } else {
        results.push({
          url: '', // 需要从 tab 信息中获取
          success: false,
          error: response?.error || 'Failed to fetch OpenGraph',
          tab_id: tabId,
        });
      }
    } catch (error) {
      console.warn(`[Local OpenGraph] Failed to fetch from tab ${tabId}:`, error);
      results.push({
        url: '', // 需要从 tab 信息中获取
        success: false,
        error: error.message,
        tab_id: tabId,
      });
    }
  }
  
  return results;
}

// 如果在 content script 环境中，导出函数供消息监听器使用
if (typeof window !== 'undefined') {
  window.__TAB_CLEANER_FETCH_OPENGRAPH = fetchLocalOpenGraph;
}

// 注意：消息监听器应该在 content script 中设置（content.js 中已处理）
// 这里只导出函数供 content script 使用

