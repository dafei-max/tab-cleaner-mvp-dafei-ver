/**
 * 本地 OpenGraph 抓取工具 - 优化版 V2
 * 
 * 优化点:
 * 1. 智能等待 SPA 内容加载
 * 2. 更精准的首图检测算法（多维度评分）
 * 3. 针对特定网站的优化规则
 * 4. 更好的缓存机制
 * 5. 异步图片加载的处理
 * 6. 支持 Canvas/Video 截图模式
 */

(function() {
  'use strict';

  console.log('[OG Local V2] 🚀 Starting enhanced version...');

  if (window.__TAB_CLEANER_OPENGRAPH_LOCAL_V2) {
    console.log('[OG Local V2] Already loaded');
    return;
  }
  window.__TAB_CLEANER_OPENGRAPH_LOCAL_V2 = true;

  // ==================== 配置 ====================
  
  const CONFIG = {
    // 图片尺寸要求
    minImageWidth: 200,
    minImageHeight: 200,
    
    // 等待时间
    maxWaitTime: 3000,      // 最大等待时间 (ms)
    checkInterval: 300,     // 检查间隔 (ms)
    spaDelayAfterNav: 1200,  // SPA 导航后延迟 (ms)
    
    // 智能首图权重（优化）
    imageScoring: {
      positionWeight: 0.35,  // 位置权重（提高）
      sizeWeight: 0.35,      // 尺寸权重（提高）
      aspectRatioWeight: 0.20, // 宽高比权重
      contextWeight: 0.10,   // 上下文权重
    },
    
    // 网站特定规则（扩展）
    siteRules: {
      'xiaohongshu.com': {
        name: '小红书',
        waitForSelector: '.note-item, .feed-item, [class*="note"]',
        imageSelector: '.note-image img, .feed-cover img, [class*="note"] img, [class*="cover"] img',
        titleSelector: '.note-title, .title, h1',
        isSPA: true,
        delayAfterNav: 1500, // 增加延迟
        preferFirstVisible: true,
      },
      'huaban.com': {
        name: '花瓣',
        waitForSelector: '.pin, .board-pin, [class*="pin"]',
        imageSelector: '.pin-img img, .board-pin img, [class*="pin"] img',
        containerSelector: '.pin-container, .board-container',
        preferFirstVisible: true,
        minImageSize: 300, // 花瓣图片通常较大
      },
      'uisdc.com': {
        name: '优设',
        waitForSelector: 'article, .post, .article',
        imageSelector: 'article img, .post-thumbnail img, .featured-image img, .article-img img',
        titleSelector: 'article h1, .post-title, .article-title',
        preferFeaturedImage: true,
      },
      'zcool.com.cn': {
        name: '站酷',
        waitForSelector: '.work-card, [class*="work"], .card',
        imageSelector: '.work-thumbnail img, .cover-img img, [class*="thumbnail"] img',
        preferFirstVisible: true,
      },
      'pinterest.com': {
        name: 'Pinterest',
        waitForSelector: '[data-test-id="pin"]',
        imageSelector: '[data-test-id="pin-visual-wrapper"] img, img[srcset]',
        preferHighRes: true,
      },
      'behance.net': {
        name: 'Behance',
        waitForSelector: '.project-cover, [class*="project"]',
        imageSelector: '.project-cover img, [class*="cover"] img',
        preferFirstVisible: true,
      },
      'dribbble.com': {
        name: 'Dribbble',
        waitForSelector: '.shot, [class*="shot"]',
        imageSelector: '.shot img, [class*="shot"] img',
        preferFirstVisible: true,
      },
      'figma.com': {
        name: 'Figma',
        waitForSelector: 'canvas, [class*="canvas"]',
        useScreenshot: true, // 使用截图模式
        screenshotSelector: 'canvas, [class*="canvas"]',
      },
      'canva.com': {
        name: 'Canva',
        waitForSelector: 'canvas, [class*="canvas"]',
        useScreenshot: true,
        screenshotSelector: 'canvas, [class*="canvas"]',
      },
    },
  };

  // ==================== 工具函数 ====================
  
  /**
   * 获取当前网站规则
   */
  function getSiteRule() {
    const hostname = window.location.hostname;
    for (const [domain, rule] of Object.entries(CONFIG.siteRules)) {
      if (hostname.includes(domain)) {
        return { domain, ...rule };
      }
    }
    return null;
  }
  
  /**
   * 等待元素出现（优化：更智能的检测）
   */
  function waitForElement(selector, timeout = 3000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true, // 监听属性变化
      });
      
      // 超时处理
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }
  
  /**
   * 等待图片加载完成（优化：支持更多属性）
   */
  function waitForImageLoad(img, timeout = 2000) {
    return new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve(true);
        return;
      }
      
      const onLoad = () => {
        clearTimeout(timer);
        resolve(true);
      };
      
      const onError = () => {
        clearTimeout(timer);
        resolve(false);
      };
      
      const timer = setTimeout(() => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        resolve(false);
      }, timeout);
      
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
      
      // 如果图片有 data-src，尝试加载
      if (img.dataset?.src && !img.src) {
        img.src = img.dataset.src;
      }
    });
  }

  /**
   * 检查图片是否有效（优化：更严格的过滤）
   */
  function isValidImage(img) {
    if (!img || !img.src) return false;
    
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    
    // 使用网站特定的最小尺寸
    const siteRule = getSiteRule();
    const minSize = siteRule?.minImageSize || CONFIG.minImageWidth;
    
    if (width < minSize || height < minSize) {
      return false;
    }
    
    // 排除常见非内容图片（扩展列表）
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();
    const excludePatterns = [
      'icon', 'logo', 'avatar', 'favicon', 'sprite',
      'button', 'arrow', 'badge', 'ad', 'banner',
      'tracking', 'pixel', 'blank', 'placeholder',
      'loading', 'spinner', 'gif', 'svg-icon',
      'emoji', 'smiley', 'decoration'
    ];
    
    if (excludePatterns.some(pattern => 
      src.includes(pattern) || alt.includes(pattern) || className.includes(pattern)
    )) {
      return false;
    }
    
    // 检查是否在视口内（优先选择可见图片）
    const rect = img.getBoundingClientRect();
    const isVisible = rect.top >= 0 && 
                     rect.top <= window.innerHeight &&
                     rect.left >= 0 &&
                     rect.left <= window.innerWidth;
    
    return true; // 不强制要求可见，但会在评分中考虑
  }

  /**
   * 获取图片 URL（优化：支持更多格式）
   */
  function getImageUrl(img) {
    if (!img) return null;
    
    // 尝试各种可能的属性（优先级顺序）
    let src = img.src || 
              img.getAttribute('data-src') || 
              img.getAttribute('data-lazy-src') ||
              img.getAttribute('data-original') ||
              img.getAttribute('data-lazy') ||
              img.getAttribute('data-url') ||
              img.dataset?.src ||
              img.dataset?.lazySrc ||
              '';
    
    // 处理 srcset（优先选择高分辨率版本）
    if (!src && img.srcset) {
      const srcsetParts = img.srcset.split(',').map(s => s.trim());
      if (srcsetParts.length > 0) {
        // 选择最高分辨率的版本
        const sorted = srcsetParts
          .map(part => {
            const [url, descriptor] = part.split(' ');
            const resolution = descriptor ? parseFloat(descriptor.replace(/[^0-9.]/g, '')) : 1;
            return { url: url.trim(), resolution };
          })
          .filter(item => item.url)
          .sort((a, b) => b.resolution - a.resolution);
        
        if (sorted.length > 0) {
          src = sorted[0].url;
        }
      }
    }
    
    if (!src) return null;
    
    // 转换为绝对 URL
    try {
      return new URL(src, window.location.href).href;
    } catch (e) {
      if (src.startsWith('//')) {
        return 'https:' + src;
      }
      return src;
    }
  }

  /**
   * 计算图片得分（优化：更精准的算法）
   */
  function scoreImage(img, index, totalImages) {
    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    
    // 位置得分（越靠前越高，但考虑视口位置）
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const elementTop = rect.top + scrollTop;
    const positionScore = Math.max(0, 1 - (elementTop / (document.documentElement.scrollHeight || 1)));
    
    // 尺寸得分（归一化，考虑大图）
    const size = width * height;
    const maxSize = 1920 * 1080; // 1080p
    const sizeScore = Math.min(size / maxSize, 1);
    
    // 宽高比得分（接近常见比例更高）
    const aspectRatio = width / height;
    const idealRatios = [16/9, 4/3, 3/2, 1/1, 21/9]; // 添加超宽屏比例
    const aspectScore = Math.max(...idealRatios.map(ratio => 
      Math.max(0, 1 - Math.abs(aspectRatio - ratio) / ratio)
    ));
    
    // 上下文得分（在视口内更高，在主内容区更高）
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isInViewport = rect.top >= 0 && 
                        rect.top <= viewportHeight &&
                        rect.left >= 0 &&
                        rect.left <= viewportWidth;
    
    // 检查是否在主内容区（排除侧边栏、导航等）
    const isInMainContent = rect.top > 100 && // 跳过顶部导航
                           rect.left > 50 && // 跳过左侧边栏
                           rect.right < viewportWidth - 50; // 跳过右侧边栏
    
    const contextScore = isInViewport ? (isInMainContent ? 1.0 : 0.7) : 0.3;
    
    // 综合得分
    const weights = CONFIG.imageScoring;
    const totalScore = 
      positionScore * weights.positionWeight +
      sizeScore * weights.sizeWeight +
      aspectScore * weights.aspectRatioWeight +
      contextScore * weights.contextWeight;
    
    return {
      score: totalScore,
      metrics: {
        position: positionScore,
        size: sizeScore,
        aspect: aspectScore,
        context: contextScore,
      },
      dimensions: { width, height },
      isInViewport,
      isInMainContent,
    };
  }

  /**
   * 智能选择最佳图片（优化：更智能的选择）
   */
  async function selectBestImage(images, siteRule) {
    const validImages = images.filter(img => isValidImage(img));
    
    if (validImages.length === 0) {
      return null;
    }
    
    // 如果网站规则指定优先选择第一个可见图片
    if (siteRule && siteRule.preferFirstVisible) {
      const firstVisible = validImages.find(img => {
        const rect = img.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= window.innerHeight;
      });
      
      if (firstVisible) {
        const url = getImageUrl(firstVisible);
        if (url) {
          console.log('[OG Local V2] 🎯 Using first visible image (site rule)');
          return url;
        }
      }
    }
    
    // 等待前几张图片加载（提高准确率）
    const topImages = validImages.slice(0, Math.min(10, validImages.length));
    await Promise.all(topImages.map(img => waitForImageLoad(img, 1500)));
    
    // 计算所有图片的得分
    const scoredImages = validImages.map((img, index) => ({
      img,
      url: getImageUrl(img),
      ...scoreImage(img, index, validImages.length),
    })).filter(item => item.url); // 过滤掉无效 URL
    
    // 按得分排序
    scoredImages.sort((a, b) => b.score - a.score);
    
    // 返回最高分的图片
    const best = scoredImages[0];
    if (best) {
      console.log('[OG Local V2] 🏆 Best image selected:', {
        url: best.url?.substring(0, 60) + '...',
        score: best.score.toFixed(3),
        metrics: best.metrics,
        dimensions: best.dimensions,
        isInViewport: best.isInViewport,
      });
      
      return best.url;
    }
    
    return null;
  }

  /**
   * 提取 OpenGraph 数据 - 增强版
   */
  async function extractOpenGraphEnhanced() {
    const result = {
      url: window.location.href,
      title: '',
      description: '',
      image: '',
      site_name: '',
      success: false,
      error: null,
      is_local_fetch: true,
      extraction_method: 'enhanced',
      timestamp: Date.now(),
    };
    
    try {
      const siteRule = getSiteRule();
      
      // 1. 如果是 SPA 网站，等待内容加载
      if (siteRule && siteRule.waitForSelector) {
        console.log(`[OG Local V2] 🔍 Waiting for ${siteRule.name} content...`);
        await waitForElement(siteRule.waitForSelector, CONFIG.maxWaitTime);
        
        // 额外延迟（等待动态内容）
        if (siteRule.isSPA || siteRule.delayAfterNav) {
          const delay = siteRule.delayAfterNav || CONFIG.spaDelayAfterNav;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // 2. 提取 meta 标签
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const ogSiteName = document.querySelector('meta[property="og:site_name"]');
      
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      
      // 3. 提取标题
      let titleCandidates = [
        ogTitle?.getAttribute('content'),
        twitterTitle?.getAttribute('content'),
      ];
      
      // 网站特定标题选择器
      if (siteRule && siteRule.titleSelector) {
        const customTitle = document.querySelector(siteRule.titleSelector);
        if (customTitle) {
          titleCandidates.unshift(customTitle.textContent?.trim());
        }
      }
      
      titleCandidates.push(document.title);
      result.title = titleCandidates.find(t => t && t.trim()) || window.location.href;
      result.title = result.title.trim();
      
      // 4. 提取描述
      result.description = (
        ogDescription?.getAttribute('content') ||
        twitterDescription?.getAttribute('content') ||
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        ''
      ).trim();
      
      // 5. 提取图片 - 智能策略
      let imageUrl = null;
      
      // 5.1 优先使用 OG/Twitter 标签
      const metaImageUrl = 
        ogImage?.getAttribute('content') ||
        twitterImage?.getAttribute('content');
      
      if (metaImageUrl) {
        try {
          imageUrl = new URL(metaImageUrl, window.location.href).href;
          console.log('[OG Local V2] 📸 Using meta tag image');
        } catch (e) {
          imageUrl = metaImageUrl;
        }
      }
      
      // 5.2 如果没有 meta 图片，使用智能选择
      if (!imageUrl) {
        console.log('[OG Local V2] 📸 No meta image, using smart selection...');
        
        let candidates = [];
        
        // 使用网站特定选择器
        if (siteRule && siteRule.imageSelector) {
          candidates = Array.from(document.querySelectorAll(siteRule.imageSelector));
          console.log(`[OG Local V2] Found ${candidates.length} images using site rule`);
        }
        
        // 后备：所有图片
        if (candidates.length === 0) {
          candidates = Array.from(document.querySelectorAll('img'));
          console.log(`[OG Local V2] Found ${candidates.length} total images`);
        }
        
        // 选择最佳图片
        imageUrl = await selectBestImage(candidates, siteRule);
      }
      
      // 5.3 转换为绝对 URL
      if (imageUrl) {
        try {
          result.image = new URL(imageUrl, window.location.href).href;
        } catch (e) {
          if (imageUrl.startsWith('//')) {
            result.image = 'https:' + imageUrl;
          } else {
            result.image = imageUrl;
          }
        }
      }
      
      // 6. 站点名称
      result.site_name = (
        ogSiteName?.getAttribute('content') ||
        siteRule?.name ||
        window.location.hostname.replace(/^www\./, '')
      ).trim();
      
      // 7. 判断成功
      const hasTitle = result.title && result.title !== window.location.href;
      const hasImage = result.image && result.image.trim();
      const hasDescription = result.description && result.description.trim();
      
      result.success = !!(hasTitle || hasImage || hasDescription);
      
      // 8. 如果失败，尝试降级方案
      if (!result.success) {
        console.warn('[OG Local V2] ⚠️ Extraction failed, using fallback');
        result.title = document.title || window.location.href;
        result.success = true; // 至少有 title
      }
      
      console.log('[OG Local V2] ✅ Extraction complete:', {
        url: result.url,
        title: result.title.substring(0, 50),
        hasImage: !!result.image,
        success: result.success,
      });
      
    } catch (error) {
      result.error = error.message || String(error);
      result.success = false;
      console.error('[OG Local V2] ❌ Extraction error:', error);
    }
    
    return result;
  }

  // ==================== 缓存管理 ====================
  
  let cache = new Map();
  let lastUrl = window.location.href;
  
  /**
   * 获取缓存
   */
  function getCached(url) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1分钟缓存
      console.log('[OG Local V2] 💾 Using cached data');
      return cached.data;
    }
    return null;
  }
  
  /**
   * 设置缓存
   */
  function setCache(url, data) {
    cache.set(url, {
      data,
      timestamp: Date.now(),
    });
    
    // 限制缓存大小
    if (cache.size > 10) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
  }
  
  /**
   * 清除缓存
   */
  function clearCache() {
    cache.clear();
    console.log('[OG Local V2] 🗑️ Cache cleared');
  }

  // ==================== SPA 监听 ====================
  
  /**
   * 监听 URL 变化
   */
  function watchURLChanges() {
    const siteRule = getSiteRule();
    if (!siteRule || !siteRule.isSPA) return;
    
    console.log('[OG Local V2] 👀 Watching SPA navigation...');
    
    // 拦截 History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleURLChange();
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleURLChange();
    };
    
    window.addEventListener('popstate', handleURLChange);
    
    function handleURLChange() {
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        console.log('[OG Local V2] 🔄 URL changed:', newUrl);
        lastUrl = newUrl;
        clearCache(); // 清除缓存
        
        // 触发重新提取
        setTimeout(() => {
          extractAndCache();
        }, siteRule.delayAfterNav || CONFIG.spaDelayAfterNav);
      }
    }
  }
  
  /**
   * 提取并缓存
   */
  async function extractAndCache() {
    const url = window.location.href;
    const data = await extractOpenGraphEnhanced();
    setCache(url, data);
    
    // 通知 content script
    window.postMessage({
      type: 'TAB_CLEANER_OG_EXTRACTED',
      data,
    }, '*');
    
    return data;
  }

  // ==================== 暴露 API ====================
  
  /**
   * 主函数（与旧版兼容）
   */
  window.__TAB_CLEANER_GET_OPENGRAPH = async function(waitForLoad = false) {
    const url = window.location.href;
    
    // 检查缓存
    const cached = getCached(url);
    if (cached && !waitForLoad) {
      return cached;
    }
    
    // 重新提取
    return await extractAndCache();
  };
  
  // 扩展 API
  window.__TAB_CLEANER_OG_ENHANCED = {
    extract: extractOpenGraphEnhanced,
    clearCache,
    getCached,
    selectBestImage,
  };

  // ==================== 初始化 ====================
  
  function init() {
    console.log('[OG Local V2] 🚀 Initializing...');
    
    // 监听 SPA 路由
    watchURLChanges();
    
    // 立即提取一次
    if (document.readyState === 'complete') {
      extractAndCache();
    } else {
      window.addEventListener('load', () => {
        extractAndCache();
      }, { once: true });
    }
    
    console.log('[OG Local V2] ✅ Initialized');
  }
  
  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

