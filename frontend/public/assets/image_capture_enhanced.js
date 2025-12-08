/**
 * Tab Cleaner - 增强图片采集系统
 * 
 * 功能特性:
 * 1. 拖拽图片到桌宠保存 (Eagle 式交互)
 * 2. 图片悬停标记 (可点击精确抓图)
 * 3. 右键菜单 - 收藏到 Tab Cleaner
 * 4. 智能首图检测 (针对花瓣、优设等设计网站)
 * 5. SPA 路由变化监听 (小红书等单页应用)
 */

(function() {
  'use strict';

  if (window.__TAB_CLEANER_IMAGE_CAPTURE_ENHANCED) {
    console.log('[Image Capture] Already loaded');
    return;
  }
  window.__TAB_CLEANER_IMAGE_CAPTURE_ENHANCED = true;

  console.log('[Image Capture] 🚀 Initializing enhanced image capture system...');

  // ==================== 配置 ====================
  // ✅ V3 优化：降低阈值、减少延迟、增大按钮、增强视觉效果
  const CONFIG = {
    // 最小图片尺寸 (px) - V3: 从 200 → 150，当前再降到 100，进一步提高覆盖率
    minImageWidth: 100,
    minImageHeight: 100,
    
    // 悬停延迟 (ms) - V3: 从 150ms 降低到 80ms，响应更快
    hoverDelay: 80,
    
    // 桌宠选择器（多个可能的 ID）
    petSelectors: [
      '#tab-cleaner-pet-container',
      '.window-button-wrapper',
      '#tc-card',
      '[id*="pet"]',
      '[class*="pet"]',
    ],
    
    // 图片标记 - V3 优化
    imageMarker: {
      enabled: false, // 暂停悬浮加图按钮，避免遮挡页面交互
      showOnHover: true,
      iconSize: 44, // V3: 从 36 增大到 44，更醒目
      iconColor: '#4A90E2',
      position: 'top-right', // top-right, top-left, bottom-right, bottom-left
      zIndex: 999999, // V3: 提高 z-index，避免被遮挡
    },
    
    // 拖拽高亮样式 - V3 增强
    dragHighlight: {
      borderColor: '#4A90E2',
      borderWidth: 4, // V3: 从 3 增加到 4，更明显
      borderStyle: 'dashed',
      backgroundColor: 'rgba(74, 144, 226, 0.15)', // V3: 从 0.1 增加到 0.15
      boxShadow: '0 0 20px rgba(74, 144, 226, 0.5)', // V3: 新增发光效果
      animation: 'tc-pulse 1s ease-in-out infinite', // V3: 新增脉冲动画
    },
    
    // 平台检测 - V3 新增
    platform: {
      isMac: /Mac|iPhone|iPod|iPad/i.test(navigator.platform),
      modifierKey: null, // 动态设置
      modifierName: null, // 动态设置
    },
  };
  
  // ✅ V3: 初始化平台检测
  CONFIG.platform.modifierKey = CONFIG.platform.isMac ? 'metaKey' : 'ctrlKey';
  CONFIG.platform.modifierName = CONFIG.platform.isMac ? '⌘' : 'Ctrl';
  
  console.log(`[Image Capture] 🖥️ Platform: ${CONFIG.platform.isMac ? 'Mac' : 'Windows/Linux'}, Modifier: ${CONFIG.platform.modifierName}`);

  // ==================== 状态管理 ====================
  
  let draggedImage = null;
  let petElement = null;
  let currentMarker = null;
  let currentImage = null;
  let hoverTimeout = null; // ✅ 修复：防抖超时
  
  // ✅ 新增：桌宠位置缓存（从 storage 读取）
  let petPositionCache = null;
  let petVisibleCache = false;
  
  // ✅ 新增：桌宠尺寸（固定值，从 pet.js 获取）
  const PET_SIZE = {
    width: 315,
    height: 246,
  };
  
  // ✅ 新增：拖拽动画相关状态
  let dragTrailCanvas = null;
  let dragTrailContext = null;
  let dragTrailPoints = [];
  let savedCount = 0; // 保存计数
  let saveHistory = []; // 保存历史（用于撤销）

  // ==================== 工具函数 ====================
  
  /**
   * 检查 <img> 是否符合尺寸和 URL 要求
   */
  function isValidImage(img) {
    if (!img || !img.src) return false;
    
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    
    // 排除小图标
    if (width < CONFIG.minImageWidth || height < CONFIG.minImageHeight) {
      return false;
    }
    
    // 排除常见图标/logo
    const src = img.src.toLowerCase();
    const excludeKeywords = [
      'icon', 'logo', 'avatar', 'favicon', 'sprite', 
      'button', 'arrow', 'badge', 'ad', 'banner',
      'tracking', 'pixel', 'blank', 'placeholder'
    ];
    
    if (excludeKeywords.some(keyword => src.includes(keyword))) {
      return false;
    }
    
    return true;
  }

  /**
   * ✅ 新增：检查背景图是否符合要求（用于 div background-image）
   */
  function isValidBackgroundImage(element, url) {
    if (!element || !url) return false;

    const lower = url.toLowerCase();
    const excludeKeywords = [
      'icon', 'logo', 'avatar', 'favicon', 'sprite',
      'button', 'arrow', 'badge', 'ad', 'banner',
      'tracking', 'pixel', 'blank', 'placeholder', 'svg'
    ];
    if (excludeKeywords.some(k => lower.includes(k))) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < CONFIG.minImageWidth || rect.height < CONFIG.minImageHeight) {
      return false;
    }

    return true;
  }

  /**
   * ✅ 新增：扫描页面上所有“可采集图片”
   * 同时覆盖 <img> 和常见的 background-image 容器
   * 返回数组：[{ type: 'img' | 'background', element, src }]
   */
  function findAllImages() {
    const results = [];
    const seenElements = new Set();

    // 1. 传统 <img> 标签
    const imgNodes = document.querySelectorAll('img');
    imgNodes.forEach((img) => {
      if (!isValidImage(img)) return;
      if (seenElements.has(img)) return;
      seenElements.add(img);
      results.push({
        type: 'img',
        element: img,
        src: getImageUrl(img),
      });
    });

    // 2. 带背景图的常见容器（避免全量扫描所有节点，控制性能）
    const bgSelectors = [
      'div[style*="background-image"]',
      'section[style*="background-image"]',
      'article[style*="background-image"]',
      '.cover',
      '.thumbnail',
      '.hero',
      '.banner',
    ];

    bgSelectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((el) => {
        if (seenElements.has(el)) return;
        const style = window.getComputedStyle(el);
        const bg = style.backgroundImage;
        if (!bg || bg === 'none' || !bg.includes('url(')) return;

        const match = bg.match(/url\((\"|')?(.*?)(\"|')?\)/i);
        const url = match && match[2] ? match[2] : null;
        if (!url || !isValidBackgroundImage(el, url)) return;

        seenElements.add(el);
        results.push({
          type: 'background',
          element: el,
          src: url,
        });
      });
    });

    return results;
  }

  /**
   * ✅ 新增：视觉穿透查找图片或背景图
   * 使用 document.elementsFromPoint(x, y) 从“鼠标所在像素”向下扎一根针，
   * 在堆叠的元素列表中寻找：
   * 1. 可用的 <img>
   * 2. 带 background-image 的块级元素
   *
   * 返回形如：
   * { type: 'img' | 'background', element, src }
   */
  function findTargetImage(_ignoredTarget, x, y) {
    if (typeof document.elementsFromPoint !== 'function') {
      return null;
    }
    if (typeof x !== 'number' || typeof y !== 'number') {
      return null;
    }

    const stack = document.elementsFromPoint(x, y) || [];

    for (const el of stack) {
      if (!el || el === document || el === window) continue;

      // 忽略我们自己插入的 UI 和桌宠
      if (el.classList && (el.classList.contains('tc-image-marker') || el.classList.contains('tc-undo-button'))) {
        continue;
      }
      if (el.id === 'tab-cleaner-pet-container' || (el.closest && el.closest('#tab-cleaner-pet-container'))) {
        continue;
      }

      // 检查 1：<img>
      if (el.tagName === 'IMG' && isValidImage(el)) {
        return {
          type: 'img',
          element: el,
          src: getImageUrl(el),
        };
      }

      // 检查 2：background-image
      const style = window.getComputedStyle(el);
      const bg = style.backgroundImage;
      if (bg && bg !== 'none' && bg.includes('url(')) {
        const match = bg.match(/url\\((\"|')?(.*?)(\"|')?\\)/i);
        const url = match && match[2] ? match[2] : null;
        if (url && isValidBackgroundImage(el, url)) {
          return {
            type: 'background',
            element: el,
            src: url,
          };
        }
      }
    }

    return null;
  }

  /**
   * 获取图片完整 URL
   */
  function getImageUrl(img) {
    if (!img) return null;
    
    // 尝试多个可能的属性
    const src = img.src || 
                img.getAttribute('data-src') || 
                img.getAttribute('data-lazy-src') ||
                img.getAttribute('data-original') ||
                img.getAttribute('data-lazy') ||
                '';
    
    if (!src) return null;
    
    try {
      // 转换为绝对 URL
      return new URL(src, window.location.href).href;
    } catch (e) {
      // 处理协议相对 URL
      if (src.startsWith('//')) {
        return 'https:' + src;
      }
      return src;
    }
  }

  /**
   * ✅ 压缩 dataURL 图片，减小写入 chrome.storage 的体积
   * - 仅对 data:image/*;base64,... 生效
   * - 普通 https:// URL 不处理（只是一串短字符串）
   */
  async function compressImageIfNeeded(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
    
    // 只处理 data URL，普通 URL 基本不占配额
    if (!imageUrl.startsWith('data:')) {
      return imageUrl;
    }
    
    // 已经是较小的 JPEG，直接跳过
    if (imageUrl.includes('data:image/jpeg') && imageUrl.length < 200000) {
      return imageUrl;
    }
    
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          const maxSide = 1200;
          const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
          const targetW = Math.round(img.width * ratio);
          const targetH = Math.round(img.height * ratio);
          
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetW, targetH);
          
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          console.log(
            '[Image Capture] 📦 Compressed hover image:',
            `${(imageUrl.length / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB`
          );
          resolve(compressed);
        };
        img.onerror = () => resolve(imageUrl);
        img.src = imageUrl;
      } catch (e) {
        console.warn('[Image Capture] Failed to compress hover image:', e);
        resolve(imageUrl);
      }
    });
  }

  /**
   * 🆕 从已渲染的 <img> 元素生成缩略图（绕过 CORS 限制）
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
        console.warn('[Image Capture] Canvas tainted by CORS:', imgElement.src?.substring(0, 50));
        return null;
      }
      
      const thumbnail = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
      const sizeKB = (thumbnail.length / 1024).toFixed(1);
      console.log(`[Image Capture] 🖼️ Generated thumbnail from element: ${targetW}x${targetH}, ${sizeKB}KB`);
      return thumbnail;
    } catch (e) {
      console.warn('[Image Capture] Failed to generate thumbnail from element:', e.message);
      return null;
    }
  }

  /**
   * 🆕 生成 200px 缩略图用于后端打标（解决 URL 403 问题）
   * @param {string} imageUrl - 图片 URL 或 base64
   * @param {HTMLImageElement} imgElement - 可选，已渲染的图片元素（优先使用）
   * @returns {Promise<string|null>} - 200px 缩略图 base64，失败返回 null
   */
  async function generateThumbnail(imageUrl, imgElement = null) {
    // 🆕 优先从已渲染的元素生成（绕过 CORS）
    if (imgElement) {
      const thumbnail = generateThumbnailFromElement(imgElement);
      if (thumbnail) return thumbnail;
      console.log('[Image Capture] 🖼️ Element thumbnail failed, trying URL...');
    }
    
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    
    // ⚠️ 只处理 data:image，HTTP URL 因 CORS 无法加载到 canvas
    if (!imageUrl.startsWith('data:')) {
      console.log('[Image Capture] 🖼️ Skipping thumbnail for HTTP URL (CORS limitation)');
      return null;
    }
    
    const THUMBNAIL_SIZE = 200; // 缩略图最大边长
    const THUMBNAIL_QUALITY = 0.7; // JPEG 质量
    
    return new Promise((resolve) => {
      try {
        const img = new Image();
        
        img.onload = () => {
          const ratio = Math.min(1, THUMBNAIL_SIZE / Math.max(img.width, img.height));
          const targetW = Math.round(img.width * ratio);
          const targetH = Math.round(img.height * ratio);
          
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetW, targetH);
          
          const thumbnail = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
          const sizeKB = (thumbnail.length / 1024).toFixed(1);
          console.log(`[Image Capture] 🖼️ Generated thumbnail: ${targetW}x${targetH}, ${sizeKB}KB`);
          resolve(thumbnail);
        };
        
        img.onerror = (e) => {
          console.warn('[Image Capture] ⚠️ Failed to load image for thumbnail:', e);
          resolve(null);
        };
        
        img.src = imageUrl;
      } catch (e) {
        console.warn('[Image Capture] ⚠️ Failed to generate thumbnail:', e);
        resolve(null);
      }
    });
  }

  /**
   * ✅ 新增：从 chrome.storage.local 读取桌宠位置和可见性
   */
  async function loadPetPositionFromStorage() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[Image Capture] chrome.storage.local not available');
        resolve(null);
        return;
      }
      
      chrome.storage.local.get(['petVisible', 'petPosition'], (items) => {
        if (chrome.runtime.lastError) {
          console.warn('[Image Capture] Failed to load pet position:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        
        const visible = items.petVisible === true;
        const position = items.petPosition;
        
        petVisibleCache = visible;
        petPositionCache = position;
        
        console.log('[Image Capture] 📦 Pet state loaded from storage:', {
          visible,
          position,
        });
        
        resolve({ visible, position });
      });
    });
  }
  
  /**
   * ✅ 新增：计算桌宠的边界矩形（基于 storage 中的位置）
   */
  function getPetRectFromStorage() {
    if (!petVisibleCache || !petPositionCache) {
      return null;
    }
    
    // 解析位置（格式：'315px' 或 '315'）
    const parsePosition = (pos) => {
      if (!pos) return 0;
      if (typeof pos === 'number') return pos;
      const match = pos.toString().match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    
    const left = parsePosition(petPositionCache.left);
    const top = parsePosition(petPositionCache.top);
    
    return {
      left,
      top,
      right: left + PET_SIZE.width,
      bottom: top + PET_SIZE.height,
      width: PET_SIZE.width,
      height: PET_SIZE.height,
    };
  }
  
  /**
   * 查找桌宠元素（增强版：优先从 storage 读取位置）
   */
  function findPetElement() {
    // ✅ 优先：尝试从 DOM 查找（用于高亮等操作）
    if (petElement && document.contains(petElement)) {
      const style = window.getComputedStyle(petElement);
      if (style.display !== 'none' && petElement.offsetParent !== null) {
        return petElement;
      } else {
        petElement = null;
      }
    }
    
    // 重置缓存
    petElement = null;
    
    // ✅ 使用更精确的选择器，按优先级查找
    const selectors = [
      '#tab-cleaner-pet-container',  // 主要选择器
      '#tc-card',
      '.window-button-wrapper',
      '[id*="pet-container"]',
      '[id*="pet"]',
      '[class*="pet-container"]',
      '[class*="pet"]',
    ];
    
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && element.offsetParent !== null;
          
          if (isVisible) {
            petElement = element;
            return element;
          }
        }
      } catch (e) {
        console.warn('[Image Capture] Error querying selector:', selector, e);
      }
    }
    
    return null;
  }
  
  /**
   * 检查是否拖到桌宠区域 - 增强版：从 storage 读取位置
   */
  function isOverPet(x, y) {
    // ✅ 优先：从 storage 读取位置（更可靠）
    const petRect = getPetRectFromStorage();
    if (petRect) {
      const isOver = x >= petRect.left && x <= petRect.right &&
                     y >= petRect.top && y <= petRect.bottom;
      
      if (draggedImage) {
        console.log('[Image Capture] 🔍 isOverPet (from storage):', {
          mousePos: { x, y },
          petRect,
          isOver,
          petVisible: petVisibleCache,
        });
      }
      
      return isOver;
    }
    
    // ✅ 备用：从 DOM 查找（用于高亮等操作）
    const pet = findPetElement();
    if (!pet) {
      // 如果 DOM 也找不到，尝试刷新 storage 缓存
      loadPetPositionFromStorage().then(() => {
        const refreshedRect = getPetRectFromStorage();
        if (refreshedRect) {
          console.log('[Image Capture] 🔄 Refreshed pet position from storage');
        }
      });
      
      if (draggedImage) {
        console.log('[Image Capture] ⚠️ isOverPet: Pet not found in DOM or storage');
      }
      return false;
    }
    
    const rect = pet.getBoundingClientRect();
    const isOver = x >= rect.left && x <= rect.right &&
                   y >= rect.top && y <= rect.bottom;
    
    if (draggedImage) {
      console.log('[Image Capture] 🔍 isOverPet (from DOM):', {
        mousePos: { x, y },
        petRect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        isOver,
        petVisible: pet.offsetParent !== null,
        petDisplay: window.getComputedStyle(pet).display,
      });
    }
    
    return isOver;
  }
  
  /**
   * 高亮桌宠区域 - V3 增强版：边框+发光+脉冲动画
   */
  function highlightPet() {
    const pet = findPetElement();
    if (!pet) return;
    
    const style = CONFIG.dragHighlight;
    
    // ✅ V3: 增强视觉效果
    pet.style.border = `${style.borderWidth}px ${style.borderStyle} ${style.borderColor}`;
    pet.style.backgroundColor = style.backgroundColor;
    pet.style.boxShadow = style.boxShadow;
    pet.style.transition = 'all 0.2s ease';
    
    // ✅ V3: 添加脉冲动画
    if (!document.getElementById('tc-pulse-animation')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'tc-pulse-animation';
      styleSheet.textContent = `
        @keyframes tc-pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 30px rgba(74, 144, 226, 0.8);
            transform: scale(1.02);
          }
        }
        @keyframes tc-success-pulse {
          0% {
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 40px rgba(76, 175, 80, 1);
            transform: scale(1.05);
          }
          100% {
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
            transform: scale(1);
          }
        }
        @keyframes tc-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes tc-slide-up {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        @keyframes tc-slide-down {
          from {
            transform: translate(-50%, 0);
            opacity: 1;
          }
          to {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(styleSheet);
    }
    
    pet.style.animation = style.animation;
  }
  
  /**
   * 取消高亮桌宠区域 - V3 增强版
   */
  function unhighlightPet() {
    const pet = findPetElement();
    if (!pet) return;
    
    pet.style.border = '';
    pet.style.backgroundColor = '';
    pet.style.boxShadow = '';
    pet.style.animation = '';
  }
  
  /**
   * ✅ V3 新增：显示成功反馈（桌宠闪烁动画 + 数字跳动）
   */
  function showSuccessFeedback() {
    const pet = findPetElement();
    if (!pet) return;
    
    // 桌宠闪烁动画
    pet.style.animation = 'tc-success-pulse 0.5s ease-out';
    
    // ✅ 新增：数字跳动动画
    savedCount++;
    updatePetCounter(pet);
    
    setTimeout(() => {
      if (pet) {
        pet.style.animation = '';
      }
    }, 500);
  }
  
  /**
   * ✅ 新增：更新桌宠计数显示
   */
  function updatePetCounter(pet) {
    // 尝试在 pet 的 shadow DOM 中查找或创建计数器
    let counter = null;
    
    if (pet.shadowRoot) {
      counter = pet.shadowRoot.querySelector('.tc-saved-count');
      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'tc-saved-count';
        counter.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: #4CAF50;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          z-index: 1000;
        `;
        pet.shadowRoot.appendChild(counter);
      }
    } else {
      // 如果没有 shadow DOM，直接在 pet 上添加
      counter = pet.querySelector('.tc-saved-count');
      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'tc-saved-count';
        counter.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: #4CAF50;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          z-index: 1000;
        `;
        pet.appendChild(counter);
      }
    }
    
    counter.textContent = savedCount;
    counter.style.animation = 'none';
    requestAnimationFrame(() => {
      counter.style.animation = 'tc-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
  }
  
  /**
   * ✅ 新增：初始化拖拽轨迹画布
   */
  function initDragTrail() {
    if (dragTrailCanvas) return;
    
    dragTrailCanvas = document.createElement('canvas');
    dragTrailCanvas.className = 'tc-drag-trail';
    dragTrailCanvas.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 999998;
    `;
    dragTrailCanvas.width = window.innerWidth;
    dragTrailCanvas.height = window.innerHeight;
    dragTrailContext = dragTrailCanvas.getContext('2d');
  }
  
  /**
   * ✅ 新增：开始拖拽轨迹
   */
  function startDragTrail() {
    initDragTrail();
    document.body.appendChild(dragTrailCanvas);
    dragTrailPoints = [];
  }
  
  /**
   * ✅ 新增：添加轨迹点
   */
  function addDragTrailPoint(x, y) {
    if (!dragTrailContext) return;
    
    dragTrailPoints.push({ x, y, time: Date.now() });
    
    // 限制点数
    if (dragTrailPoints.length > 50) {
      dragTrailPoints.shift();
    }
    
    // 绘制轨迹（带发光效果的炫酷轨迹）
    dragTrailContext.clearRect(0, 0, dragTrailCanvas.width, dragTrailCanvas.height);
    
    // 使用渐变颜色 + 阴影，增强视觉效果
    const gradient = dragTrailContext.createLinearGradient(
      0,
      0,
      dragTrailCanvas.width,
      dragTrailCanvas.height
    );
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)');   // 淡蓝
    gradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.9)'); // 亮蓝
    gradient.addColorStop(1, 'rgba(129, 230, 217, 0.8)');  // 青色

    dragTrailContext.strokeStyle = gradient;
    dragTrailContext.lineWidth = 5;
    dragTrailContext.lineCap = 'round';
    dragTrailContext.lineJoin = 'round';
    dragTrailContext.shadowColor = 'rgba(96, 165, 250, 0.9)';
    dragTrailContext.shadowBlur = 18;
    dragTrailContext.shadowOffsetX = 0;
    dragTrailContext.shadowOffsetY = 0;
    
    if (dragTrailPoints.length > 1) {
      dragTrailContext.beginPath();
      dragTrailContext.moveTo(dragTrailPoints[0].x, dragTrailPoints[0].y);
      
      for (let i = 1; i < dragTrailPoints.length; i++) {
        dragTrailContext.lineTo(dragTrailPoints[i].x, dragTrailPoints[i].y);
      }
      
      dragTrailContext.stroke();
    }
  }
  
  /**
   * ✅ 新增：结束拖拽轨迹
   */
  function endDragTrail() {
    if (dragTrailCanvas && dragTrailCanvas.parentNode) {
      dragTrailCanvas.parentNode.removeChild(dragTrailCanvas);
    }
    dragTrailPoints = [];
      dragTrailContext = null;
      dragTrailCanvas = null;
  }

  /**
   * ✅ 新增：拖拽提示文案（视口底部居中）
   */
  function showDragHint() {
    const HINT_ID = 'tc-drag-to-pet-hint';
    if (document.getElementById(HINT_ID)) return;

    const hint = document.createElement('div');
    hint.id = HINT_ID;
    hint.textContent = 'Drag and drop to pet for storage · 拖入桌宠即可收藏';
    hint.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 32px;
      transform: translateX(-50%);
      padding: 10px 18px;
      background: rgba(15, 23, 42, 0.92);
      color: #F9FAFB;
      border-radius: 999px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.45);
      z-index: 999999;
      opacity: 0;
      pointer-events: none;
      white-space: nowrap;
      letter-spacing: 0.01em;
      backdrop-filter: blur(8px);
      transition: opacity 0.2s ease-out, transform 0.2s ease-out;
    `;

    document.body.appendChild(hint);

    requestAnimationFrame(() => {
      hint.style.opacity = '1';
      hint.style.transform = 'translateX(-50%) translateY(0)';
    });
  }

  function hideDragHint() {
    const HINT_ID = 'tc-drag-to-pet-hint';
    const hint = document.getElementById(HINT_ID);
    if (!hint) return;
    hint.style.opacity = '0';
    hint.style.transform = 'translateX(-50%) translateY(6px)';
    setTimeout(() => {
      if (hint.parentNode) {
        hint.parentNode.removeChild(hint);
      }
    }, 200);
  }
  
  /**
   * ✅ 新增：创建飞入动画缩略图
   */
  function createFlyingThumbnail(imageUrl, sourceRect) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'tc-flying-thumbnail';
    thumbnail.style.cssText = `
      position: fixed;
      left: ${sourceRect.left}px;
      top: ${sourceRect.top}px;
      width: ${sourceRect.width}px;
      height: ${sourceRect.height}px;
      background-image: url(${imageUrl});
      background-size: cover;
      background-position: center;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      pointer-events: none;
      transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    return thumbnail;
  }
  
  /**
   * ✅ 新增：播放飞入动画
   */
  async function playFlyInAnimation(imageUrl, sourceRect) {
    const thumbnail = createFlyingThumbnail(imageUrl, sourceRect);
    document.body.appendChild(thumbnail);
    
    // 获取桌宠位置
    const petRect = getPetRectFromStorage();
    if (!petRect) {
      const pet = findPetElement();
      if (pet) {
        const rect = pet.getBoundingClientRect();
        petRect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      } else {
        thumbnail.remove();
        return;
      }
    }
    
    const targetX = petRect.left + petRect.width / 2;
    const targetY = petRect.top + petRect.height / 2;
    
    // 触发动画
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        thumbnail.style.left = targetX + 'px';
        thumbnail.style.top = targetY + 'px';
        thumbnail.style.width = '0px';
        thumbnail.style.height = '0px';
        thumbnail.style.opacity = '0';
        
        setTimeout(() => {
          thumbnail.remove();
          resolve();
        }, 600);
      });
    });
  }
  
  /**
   * ✅ 新增：磁吸效果（接近桌宠时）
   */
  function applyMagnetEffect(x, y) {
    const petRect = getPetRectFromStorage();
    if (!petRect) return false;
    
    const petCenterX = petRect.left + petRect.width / 2;
    const petCenterY = petRect.top + petRect.height / 2;
    const distance = Math.sqrt(
      Math.pow(x - petCenterX, 2) + Math.pow(y - petCenterY, 2)
    );
    
    const magnetDistance = 50; // 磁吸距离
    if (distance < magnetDistance) {
      const pet = findPetElement();
      if (pet) {
        // ✅ 改为对宠物内部 SVG/avatar 做轮廓发光，而不是给容器加矩形阴影
        const root = pet.shadowRoot || pet;
        const avatar = root.querySelector('.avatar img, .avatar, .desktop-pet-main') || pet;

        avatar.style.filter = 'drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 28px rgba(74, 144, 226, 0.95))';
        avatar.style.transform = 'scale(1.06)';
        avatar.style.transition = 'filter 0.2s ease, transform 0.2s ease';
        return true;
      }
    } else {
      const pet = findPetElement();
      if (pet) {
        const root = pet.shadowRoot || pet;
        const avatar = root.querySelector('.avatar img, .avatar, .desktop-pet-main') || pet;
        avatar.style.transform = '';
        avatar.style.filter = '';
      }
    }
    
    return false;
  }
  
  /**
   * ✅ 新增：显示撤销按钮
   */
  function showUndoButton() {
    const existing = document.querySelector('.tc-undo-button');
    if (existing) existing.remove();
    
    const button = document.createElement('div');
    button.className = 'tc-undo-button';
    button.innerHTML = `
      <span>已保存</span>
      <button>撤销</button>
    `;
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1F2937;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      display: flex;
      gap: 12px;
      align-items: center;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      animation: tc-slide-up 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
    `;
    
    const undoBtn = button.querySelector('button');
    undoBtn.style.cssText = `
      background: #3B82F6;
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    undoBtn.addEventListener('click', () => {
      undoLastSave();
      button.remove();
    });
    
    document.body.appendChild(button);
    
    // 3秒后自动消失
    setTimeout(() => {
      if (button.parentNode) {
        button.style.animation = 'tc-slide-down 0.3s ease';
        setTimeout(() => button.remove(), 300);
      }
    }, 3000);
  }
  
  /**
   * ✅ 新增：撤销上次保存
   */
  function undoLastSave() {
    if (saveHistory.length === 0) {
      showNotification('⚠️ 没有可撤销的操作', 'info');
      return;
    }
    
    const last = saveHistory.pop();
    savedCount = Math.max(0, savedCount - 1);
    
    // 通知后端删除（如果需要）
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'delete-saved-image',
        url: last.url,
      }).catch(err => {
        console.warn('[Image Capture] Failed to delete:', err);
      });
    }
    
    showNotification('↩️ 已撤销保存', 'info');
  }

  // ==================== 1. 拖拽图片到桌宠 ====================
  
  /**
   * 初始化拖拽监听 - V3 增强版：完整反馈系统 + 动画效果 + 桌宠磁吸反馈
   */
  function initDragAndDrop() {
    // ✅ 新增：定义桌宠容器的选择器和激活类名
    const PET_CONTAINER_SELECTORS = [
      '#tab-cleaner-pet-container',
      '.tc-pet-container',
      '#tc-card',
    ];
    const PET_ACTIVE_CLASS = 'is-dragging-active';
    let petContainer = null;

    // 辅助函数：安全地获取桌宠元素
    const getPetContainer = () => {
      if (!petContainer || !document.contains(petContainer)) {
        for (const selector of PET_CONTAINER_SELECTORS) {
          const element = document.querySelector(selector);
          if (element) {
            petContainer = element;
            return element;
          }
        }
        return null;
      }
      return petContainer;
    };

    // ✅ V3: 拖拽开始 - 图片半透明反馈 + 开始轨迹 + 桌宠磁吸反馈 + 文案提示
    document.addEventListener('dragstart', (e) => {
      let hit = findTargetImage(null, e.clientX, e.clientY);

      // ✅ 兜底：有些站点的 dragstart 触发点和鼠标位置不完全对齐，或者图片被多层 wrapper 包裹
      // 如果基于坐标没找到图片，尝试从事件 target 向上找 <img> 或带 background-image 的元素
      if (!hit) {
        const t = e.target;
        if (t) {
          // 1) 最近的 <img>
          const imgEl = t.closest && t.closest('img');
          if (imgEl && isValidImage(imgEl)) {
            hit = {
              type: 'img',
              element: imgEl,
              src: getImageUrl(imgEl),
            };
          } else {
            // 2) 最近的带 background-image 的元素
            const bgEl = t.closest && t.closest('*');
            if (bgEl) {
              const style = window.getComputedStyle(bgEl);
              const bg = style.backgroundImage;
              if (bg && bg !== 'none' && bg.includes('url(')) {
                const match = bg.match(/url\((\"|')?(.*?)(\"|')?\)/i);
                const url = match && match[2] ? match[2] : null;
                if (url && isValidBackgroundImage(bgEl, url)) {
                  hit = {
                    type: 'background',
                    element: bgEl,
                    src: url,
                  };
                }
              }
            }
          }
        }
      }

      if (hit && hit.src) {
        const anchorEl = hit.element;
        const rect = anchorEl.getBoundingClientRect();
        draggedImage = {
          url: hit.src,
          element: hit.type === 'img' ? hit.element : null,
          sourceRect: rect,
        };
        
        console.log('[Image Capture] 🖼️ Drag started:', draggedImage.url);
        
        // ✅ 新增：开始拖拽轨迹
        startDragTrail();
        // ✅ 新增：显示底部提示文案
        showDragHint();
        
        // ✅ V3: 图片变半透明（仅对真实 <img> 生效）
        if (draggedImage.element) {
          draggedImage.element.style.opacity = '0.5';
          draggedImage.element.style.transition = 'opacity 0.2s ease';
        }
        
        // ✅ 设置 dataTransfer，确保在有蒙层的网站上拖拽效果正常
        if (e.dataTransfer) {
          try {
            const dragUrl = draggedImage.url;
            if (dragUrl) {
              e.dataTransfer.setData('text/uri-list', dragUrl);
              e.dataTransfer.setData('text/plain', dragUrl);
            }
            // 使用真实图片作为拖拽时的"幽灵图像"，提高视觉一致性
            if (draggedImage.element) {
              e.dataTransfer.setDragImage(draggedImage.element, rect.width / 2, rect.height / 2);
            } else {
              // 背景图场景：创建临时 img 作为 drag image
              const tempImg = document.createElement('img');
              tempImg.src = dragUrl;
              tempImg.style.position = 'fixed';
              tempImg.style.left = '-9999px';
              tempImg.style.top = '-9999px';
              tempImg.style.width = `${rect.width}px`;
              tempImg.style.height = `${rect.height}px`;
              document.body.appendChild(tempImg);
              e.dataTransfer.setDragImage(tempImg, rect.width / 2, rect.height / 2);
              // 记录以便拖拽结束后清理
              draggedImage._tempDragImage = tempImg;
            }
          } catch (err) {
            console.warn('[Image Capture] Failed to set drag image:', err);
          }
        }
        
        // ✅ V3: 隐藏悬停按钮（避免干扰）
        if (currentMarker) {
          currentMarker.style.opacity = '0';
          currentMarker.style.pointerEvents = 'none';
        }
        
        // ✅ 新增：拖拽开始 - 激活桌宠的"求投喂"状态
        const pet = getPetContainer();
        if (pet) {
          pet.classList.add(PET_ACTIVE_CLASS);
          console.log('[Image Capture] ✨ Pet activated for drag');
        }
        
        // 高亮桌宠
        highlightPet();
      }
    }, true);
    
    // ✅ V3: 拖拽过程 - 实时检测桌宠位置 + 轨迹 + 磁吸
    document.addEventListener('dragover', (e) => {
      if (draggedImage) {
        const x = e.clientX;
        const y = e.clientY;
        
        // ✅ 新增：添加轨迹点
        addDragTrailPoint(x, y);
        
        // ✅ 新增：磁吸效果
        applyMagnetEffect(x, y);
        
        if (isOverPet(x, y)) {
          e.preventDefault(); // 允许放置
          e.stopPropagation(); // 阻止事件冒泡
          highlightPet(); // 确保高亮
        } else {
          unhighlightPet(); // 移除高亮
        }
      }
    }, true);
    
    // ✅ V3: 拖拽结束 - 成功/失败反馈 + 飞入动画 + 取消桌宠磁吸状态 + 隐藏提示文案
    document.addEventListener('dragend', async (e) => {
      // ✅ 新增：无论拖拽成功还是取消，都要取消桌宠的高亮状态
      const pet = getPetContainer();
      if (pet && pet.classList.contains(PET_ACTIVE_CLASS)) {
        pet.classList.remove(PET_ACTIVE_CLASS);
        console.log('[Image Capture] ✨ Pet deactivated after drag');
      }
      // ✅ 新增：隐藏底部提示
      hideDragHint();
      
      if (draggedImage) {
        const target = draggedImage.element;
        const x = e.clientX;
        const y = e.clientY;
        
        // ✅ 新增：结束轨迹
        endDragTrail();
        
        console.log('[Image Capture] 🎯 Drag ended at:', { x, y });
        
        // 恢复图片透明度
        if (target) {
          target.style.opacity = '1';
        }
        
        // 恢复悬停按钮
        if (currentMarker) {
          currentMarker.style.pointerEvents = 'auto';
        }
        
        const overPet = isOverPet(x, y);
        if (overPet) {
          console.log('[Image Capture] ✅ Dropped on pet! Saving image...', draggedImage.url);
          
          // ✅ 新增：播放飞入动画
          if (draggedImage.sourceRect) {
            await playFlyInAnimation(draggedImage.url, draggedImage.sourceRect);
          }
          
          // ✅ V3: 显示成功反馈
          showSuccessFeedback();
          
          // 保存图片
          captureImage(draggedImage.url, draggedImage.element);
          
          // ✅ 新增：显示撤销按钮
          showUndoButton();
        } else {
          console.log('[Image Capture] ⚠️ Dropped outside pet area');
          showNotification('ℹ️ 请把图片拖到桌宠上方再松手才会保存', 'info');
          logEvent('drag_end_outside_pet', {
            url: draggedImage && draggedImage.url,
          });
        }
        
        // 移除高亮和磁吸效果
        unhighlightPet();
        const petElement = findPetElement();
        if (petElement) {
          petElement.style.transform = '';
          petElement.style.filter = '';
        }
        
        draggedImage = null;
      }
    }, true);
    
    // ✅ 新增：监听 drop 事件（作为备用检测）
    document.addEventListener('drop', (e) => {
      if (draggedImage) {
        const x = e.clientX;
        const y = e.clientY;
        const overPet = isOverPet(x, y);
        
        if (overPet) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);
    
    console.log('[Image Capture] ✅ Drag & drop listeners initialized');
  }

  // ==================== 2. 图片悬停标记 ====================
  
  /**
   * 创建标记图标 - V3 增强版：只显示"+"，添加发光效果
   */
  function createMarkerIcon() {
    const icon = document.createElement('div');
    icon.className = 'tc-image-marker';
    icon.title = '保存到个人空间 · Click to save to Personal Space';
    icon.innerHTML = `
      <svg width="${CONFIG.imageMarker.iconSize}" height="${CONFIG.imageMarker.iconSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="${CONFIG.imageMarker.iconColor}" fill-opacity="0.95"/>
        <path d="M12 6v12M6 12h12" stroke="white" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;
    icon.style.cssText = `
      position: fixed;
      width: ${CONFIG.imageMarker.iconSize}px;
      height: ${CONFIG.imageMarker.iconSize}px;
      cursor: pointer;
      z-index: ${CONFIG.imageMarker.zIndex};
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease, filter 0.2s ease;
      pointer-events: auto;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      isolation: isolate;
      transform: scale(1);
      filter: drop-shadow(0 0 0px rgba(74, 144, 226, 0));
    `;
    
    // ✅ V3: 悬停时放大 + 发光效果
    icon.addEventListener('mouseenter', () => {
      icon.style.transform = 'scale(1.1)';
      icon.style.boxShadow = '0 4px 20px rgba(74, 144, 226, 0.6)';
      icon.style.filter = 'drop-shadow(0 0 8px rgba(74, 144, 226, 0.8))';
    });
    
    icon.addEventListener('mouseleave', () => {
      icon.style.transform = 'scale(1)';
      icon.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)';
      icon.style.filter = 'drop-shadow(0 0 0px rgba(74, 144, 226, 0))';
    });
    
    return icon;
  }
  
  /**
   * 初始化图片标记（增强版：防止重复监听和遮挡问题）
   */
  function initImageMarkers() {
    if (!CONFIG.imageMarker.enabled) return;
    
    // ✅ 修复：使用防抖，避免频繁创建/移除标记
    let hoverTimeout = null;
    
    // 使用 mousemove + 视觉穿透，提高在复杂蒙层场景下的命中率
    document.addEventListener('mousemove', (e) => {
      const target = e.target;
      
      // ✅ 修复：忽略标记本身和桌宠元素
      if (target.classList && target.classList.contains('tc-image-marker')) {
        return;
      }
      if (target.closest && target.closest('#tab-cleaner-pet-container')) {
        return;
      }
      
      const hit = findTargetImage(null, e.clientX, e.clientY);
      if (!hit || !hit.src) return;

      const anchorEl = hit.element;
      const imgUrl = hit.src;
      
      // 对 <img> 用 isValidImage 进一步过滤；背景图用 isValidBackgroundImage 过滤
      if (hit.type === 'img' && !isValidImage(anchorEl)) {
        return;
      }
      if (hit.type === 'background' && !isValidBackgroundImage(anchorEl, imgUrl)) {
        return;
      }
      
      if (anchorEl) {
        // 清除之前的超时
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
        }
        
        // 移除旧标记
        if (currentMarker && currentImage !== anchorEl) {
          currentMarker.style.opacity = '0';
          setTimeout(() => {
            if (currentMarker && currentMarker.parentNode) {
              currentMarker.remove();
            }
            currentMarker = null;
          }, 200);
        }
        
        // ✅ V3: 延迟创建标记，从 150ms 降低到 80ms，响应更快
        hoverTimeout = setTimeout(() => {
          // 创建新标记
          if (!currentMarker || currentImage !== anchorEl) {
            // 确保旧标记已移除
            if (currentMarker && currentMarker.parentNode) {
              currentMarker.remove();
            }
            
            currentMarker = createMarkerIcon();
            
            // 点击标记保存图片
            currentMarker.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const imageUrl = imgUrl;
              if (imageUrl) {
                captureImage(imageUrl, hit.type === 'img' ? anchorEl : null);
              }
            });
            
            // ✅ 修复：将标记添加到 body 或图片的定位父元素，避免被遮挡
            const parent = anchorEl.offsetParent || anchorEl.parentElement || document.body;
            if (parent) {
              // 确保父元素有定位
              const parentPosition = window.getComputedStyle(parent).position;
              if (parentPosition === 'static') {
                parent.style.position = 'relative';
              }
              
              // ✅ V3: 计算标记位置（相对于图片，使用 fixed 定位避免被遮挡）
              const imgRect = anchorEl.getBoundingClientRect();
              
              currentMarker.style.position = 'fixed';
              currentMarker.style.top = `${imgRect.top + 8}px`;
              currentMarker.style.right = `${window.innerWidth - imgRect.right + 8}px`;
              
              // ✅ V3: 直接添加到 body，避免被父元素遮挡
              document.body.appendChild(currentMarker);
              
              // ✅ V3: 滚动时自动更新标记位置
              const updateMarkerPosition = () => {
                if (currentMarker && currentImage) {
                  const imgRect = currentImage.getBoundingClientRect();
                  currentMarker.style.top = `${imgRect.top + 8}px`;
                  currentMarker.style.right = `${window.innerWidth - imgRect.right + 8}px`;
                }
              };
              
              // 监听滚动（使用 passive 提高性能）
              window.addEventListener('scroll', updateMarkerPosition, { passive: true });
              
              // 清理函数（在标记移除时调用）
              if (!currentMarker._cleanup) {
                currentMarker._cleanup = () => {
                  window.removeEventListener('scroll', updateMarkerPosition);
                };
              }
              
              // 显示标记
              requestAnimationFrame(() => {
                if (currentMarker) {
                  currentMarker.style.opacity = '1';
                  currentMarker.style.transform = 'scale(1)';
                }
              });
            }
            
            currentImage = target;
          }
        }, CONFIG.hoverDelay); // ✅ V3: 使用配置的延迟（80ms），响应更快
      }
    }, true);
    
    // 鼠标移出
    document.addEventListener('mouseout', (e) => {
      const target = e.target;
      const relatedTarget = e.relatedTarget;
      
      // ✅ 修复：清除悬停超时
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      // ✅ 修复：如果移动到标记上，不要隐藏
      if (currentMarker && (
        relatedTarget === currentMarker || 
        (currentMarker.contains && currentMarker.contains(relatedTarget)) ||
        (relatedTarget && relatedTarget.classList && relatedTarget.classList.contains('tc-image-marker'))
      )) {
        return;
      }
      
      if (target.tagName === 'IMG' && currentMarker && currentImage === target) {
        currentMarker.style.opacity = '0';
        setTimeout(() => {
          if (currentMarker && currentMarker.style.opacity === '0') {
            // ✅ V3: 清理滚动监听
            if (currentMarker._cleanup) {
              currentMarker._cleanup();
            }
            if (currentMarker.parentNode) {
              currentMarker.remove();
            }
            currentMarker = null;
            currentImage = null;
          }
        }, 200);
      }
    }, true);
    
    // ✅ 修复：监听标记的鼠标进入，防止误隐藏
    document.addEventListener('mouseenter', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('tc-image-marker')) {
        // 标记被悬停，保持显示
        if (currentMarker) {
          currentMarker.style.opacity = '1';
        }
      }
    }, true);
  }

  // ==================== 3. 右键菜单 ====================
  
  /**
   * 初始化右键菜单（通过 background.js）- V3: 动态快捷键提示
   */
  function initContextMenu() {
    // ✅ V3: 发送消息给 background.js 注册右键菜单，包含动态快捷键提示
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'register-context-menu',
        config: {
          id: 'save-image-to-tab-cleaner',
          title: `收藏到 Tab Cleaner (${CONFIG.platform.modifierName}+点击)`, // V3: 动态快捷键提示
          contexts: ['image'],
        }
      }).catch(err => {
        console.warn('[Image Capture] Failed to register context menu:', err);
      });
    }
    
    // 监听来自 background.js 的消息
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'save-image-from-context-menu') {
          const imageUrl = request.imageUrl;
          if (imageUrl) {
            captureImage(imageUrl, null);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No image URL' });
          }
          return true;
        }
      });
    }
  }
  
  // ==================== 4. 快捷键支持 - V3 新增 ====================
  
  /**
   * ✅ V3 新增：显示快捷键帮助面板
   */
  function showShortcutsHelp() {
    const existing = document.querySelector('.tc-shortcuts-panel');
    if (existing) {
      existing.remove();
      return;
    }
    
    const panel = document.createElement('div');
    panel.className = 'tc-shortcuts-panel';
    panel.innerHTML = `
      <div class="tc-shortcuts-content">
        <div class="tc-shortcuts-header">
          <h3>Tab Cleaner 快捷键</h3>
          <button class="tc-close-btn">×</button>
        </div>
        <div class="tc-shortcuts-list">
          <div class="tc-shortcut-item">
            <kbd>${CONFIG.platform.modifierName}</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>
            <span>保存当前悬停的图片</span>
          </div>
          <div class="tc-shortcut-item">
            <kbd>?</kbd>
            <span>显示/隐藏快捷键帮助</span>
          </div>
        </div>
      </div>
    `;
    
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      animation: tc-fade-in 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      .tc-shortcuts-content {
        padding: 24px;
        min-width: 400px;
      }
      .tc-shortcuts-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      .tc-shortcuts-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1F2937;
      }
      .tc-close-btn {
        background: none;
        border: none;
        font-size: 24px;
        color: #6B7280;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      .tc-close-btn:hover {
        background: #F3F4F6;
      }
      .tc-shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .tc-shortcut-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 6px;
        background: #F9FAFB;
      }
      .tc-shortcut-item kbd {
        background: white;
        border: 1px solid #D1D5DB;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .tc-shortcut-item span {
        flex: 1;
        font-size: 14px;
        color: #6B7280;
      }
      @keyframes tc-fade-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(panel);
    
    // 关闭按钮
    panel.querySelector('.tc-close-btn').addEventListener('click', () => {
      panel.remove();
      style.remove();
    });
    
    // 点击外部关闭
    setTimeout(() => {
      const closePanel = (e) => {
        if (!panel.contains(e.target)) {
          panel.remove();
          style.remove();
          document.removeEventListener('click', closePanel);
        }
      };
      document.addEventListener('click', closePanel);
    }, 100);
  }
  
  /**
   * ✅ V3 新增：初始化快捷键支持（跨平台）
   */
  function initKeyboardShortcuts() {
    // 监听键盘事件
    document.addEventListener('keydown', (e) => {
      // 忽略输入框
      if (e.target.tagName === 'INPUT' || 
          e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable) {
        return;
      }
      
      // ✅ 显示快捷键帮助
      if (e.key === '?') {
        e.preventDefault();
        showShortcutsHelp();
        return;
      }
      
      // ✅ V3: 跨平台截图快捷键 - Mac: ⌘+Shift+S, Windows: Ctrl+Shift+S
      const modifierKey = CONFIG.platform.modifierKey;
      if (e[modifierKey] && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        
        const api = window.__TAB_CLEANER_SCREENSHOT_CAPTURE_API;
        if (api && typeof api.startSelectionMode === 'function') {
          console.log(`[Image Capture] ⌨️ Screenshot shortcut triggered (${CONFIG.platform.modifierName}+Shift+S)`);
          api.startSelectionMode();
          showNotification('🎯 拖拽选择截图区域（按 ESC 取消）', 'info');
          logEvent('shortcut_screenshot_enter', {
            platform: CONFIG.platform.isMac ? 'Mac' : 'Windows/Linux',
          });
        } else {
          showNotification('⚠️ 截图模块未就绪', 'error');
          logEvent('shortcut_screenshot_no_api', {});
        }
      }
    }, true);
    
    console.log(`[Image Capture] ✅ Keyboard shortcuts initialized (${CONFIG.platform.modifierName}+Shift+S, ? for help)`);
  }

  // ==================== 核心: 图片保存 ====================
  
  /**
   * 保存图片到 Tab Cleaner
   */
  async function captureImage(imageUrl, imageElement = null) {
    console.log('[Image Capture] 💾 Capturing image:', imageUrl);
    
    // ✅ 对 dataURL 图片做一次压缩，避免写入过大的 base64
    const finalImageUrl = await compressImageIfNeeded(imageUrl);
    
    // 🆕 生成 200px 缩略图（用于后端打标，解决 URL 403 问题）
    // 优先从已渲染的元素生成（绕过 CORS）
    const thumbnailStart = performance.now();
    const thumbnail = await generateThumbnail(imageUrl, imageElement);
    const thumbnailTime = (performance.now() - thumbnailStart).toFixed(0);
    console.log(`[Image Capture] 🖼️ Thumbnail generated in ${thumbnailTime}ms, success: ${!!thumbnail}`);
    
    // 构建 OpenGraph 数据
    const ogData = {
      url: window.location.href,
      title: document.title || window.location.href,
      description: '',
      image: finalImageUrl,
      thumbnail: thumbnail,        // 🆕 200px 缩略图用于打标
      site_name: window.location.hostname.replace(/^www\./, ''),
      success: true,
      is_local_fetch: true,
      is_doc_card: false,
      capture_method: 'manual', // 标记为手动采集
      timestamp: Date.now(),
    };
    
    // 尝试获取更多元数据
    try {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      
      if (ogTitle) {
        ogData.title = ogTitle.getAttribute('content') || ogData.title;
      }
      if (ogDescription) {
        ogData.description = ogDescription.getAttribute('content') || '';
      }
    } catch (e) {
      console.warn('[Image Capture] Failed to extract additional metadata:', e);
    }
    
    // 发送到 background.js 保存
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'save-captured-image',
        data: ogData,
      }).then(response => {
        if (response && response.duplicate) {
          console.log('[Image Capture] 🔁 Duplicate image, skip saving');
          showNotification('这张图片已经在个人空间里啦', 'info');
          logEvent('save_skipped_duplicate', {
            url: imageUrl,
          });
          return;
        }
        
        if (response && response.success) {
          console.log('[Image Capture] ✅ Image saved successfully');
          showSuccessNotification(imageUrl);
          
          // ✅ 新增：记录保存历史（用于撤销）
          saveHistory.push({
            url: imageUrl,
            ogData: ogData,
            timestamp: Date.now(),
          });
        } else {
          console.error('[Image Capture] ❌ Failed to save image:', response);
          showErrorNotification('保存失败');
          logEvent('save_failed', {
            url: imageUrl,
            reason: 'backend_response',
            response,
          });
        }
      }).catch(err => {
        console.error('[Image Capture] ❌ Error saving image:', err);
        showErrorNotification('保存失败: ' + err.message);
        logEvent('save_failed', {
          url: imageUrl,
          reason: 'exception',
          error: err && err.message,
        });
      });
    }
  }
  
  /**
   * 日志上报工具：前台 + 发给 background.js
   */
  function logEvent(type, payload) {
    try {
      console.log('[Image Capture Log]', type, payload || {});
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'image-capture-log',
          type,
          payload: payload || {},
          timestamp: Date.now(),
        }).catch(() => {});
      }
    } catch (e) {
      // 忽略日志内部错误，避免影响主流程
    }
  }

  /**
   * ✅ V3 统一通知系统：成功/错误/信息
   */
  function showNotification(message, type = 'success') {
    const colors = {
      success: { bg: '#4CAF50', icon: '✅' },
      error: { bg: '#f44336', icon: '❌' },
      info: { bg: '#2196F3', icon: 'ℹ️' },
    };
    
    const config = colors[type] || colors.success;
    
    const notification = document.createElement('div');
    notification.className = 'tc-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${config.bg};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      animation: slideInRight 0.3s ease-out;
      max-width: 300px;
      word-wrap: break-word;
    `;
    notification.textContent = `${config.icon} ${message}`;
    
    // 添加动画样式（如果还没有）
    if (!document.getElementById('tc-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'tc-notification-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // 3秒后自动消失
    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
  }
  
  /**
   * 显示成功提示 - V3: 使用统一通知系统
   */
  function showSuccessNotification(imageUrl) {
    showNotification('图片已保存到 Tab Cleaner', 'success');
  }
  
  /**
   * 显示错误提示 - V3: 使用统一通知系统
   */
  function showErrorNotification(message) {
    showNotification(message, 'error');
  }

  // ==================== UX 提示功能 ====================
  /**
   * ✅ 新增：确保 UX 相关样式已注入到当前页面
   * 注意：content script 运行在任意网站里，不能依赖 React 应用自己的 index.css，
   * 所以需要在这里主动注入关键帧和类选择器。
   */
  function ensureUxStylesInjected() {
    const STYLE_ID = 'tc-image-capture-ux-styles';
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* 图片蓝色呼吸光环 */
      @keyframes tc-blue-breathing-glow {
        0% {
          box-shadow: 0 0 4px 1px rgba(64, 158, 255, 0.2);
          filter: brightness(1);
        }
        50% {
          box-shadow: 0 0 12px 4px rgba(64, 158, 255, 0.7),
                      0 0 24px 8px rgba(64, 158, 255, 0.3);
          filter: brightness(1.05);
        }
        100% {
          box-shadow: 0 0 4px 1px rgba(64, 158, 255, 0.2);
          filter: brightness(1);
        }
      }

      .tc-collectible-hint {
        position: relative;
        z-index: 999;
        animation: tc-blue-breathing-glow 2s ease-in-out infinite;
        transition: box-shadow 0.5s ease-out, filter 0.5s ease-out;
        border-radius: 4px;
      }

      /* 桌宠磁吸反馈：容器 ID 或类名匹配时生效 */
      #tab-cleaner-pet-container.is-dragging-active,
      .tc-pet-container.is-dragging-active {
        /* 不在容器上加 box-shadow，避免矩形发光，只做轻微整体放大和层级提升 */
        transform: scale(1.02) !important;
        transition: transform 0.2s ease-out !important;
        z-index: 9998;
      }

      #tab-cleaner-pet-container,
      .tc-pet-container {
        transition: box-shadow 0.3s ease-out, transform 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * ✅ 新增：页面加载时高亮提示可采集的图片
   * 持续 7 秒后自动消失
   */
  function showCollectibleHints() {
    // 确保样式已注入
    ensureUxStylesInjected();

    const HINT_CLASS = 'tc-collectible-hint';
    const HINT_DURATION = 7000; // 7秒

    const candidates = new Set();
    const items = findAllImages();
    items.forEach(item => {
      if (item && item.element) {
        candidates.add(item.element);
      }
    });

    if (candidates.size === 0) {
      console.log('[Image Capture] 💡 No collectible images found for hints');
      return;
    }

    console.log(`[Image Capture] 💡 Showing collectible hints for ${candidates.size} elements`);

    // 3. 添加呼吸动画类
    candidates.forEach(el => {
      el.classList.add(HINT_CLASS);
    });

    // 4. 设置定时器，7秒后移除类
    setTimeout(() => {
      candidates.forEach(el => {
        // 移除类，CSS 中的 transition 会让光晕平滑消失
        el.classList.remove(HINT_CLASS);
      });
      console.log('[Image Capture] 💡 Collectible hints removed');
    }, HINT_DURATION);
  }

  // ==================== 初始化 ====================
  
  async function init() {
    console.log('[Image Capture] 🚀 Starting V3 initialization...');
    
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    try {
      // ✅ 新增：首先加载桌宠位置（从 storage）
      await loadPetPositionFromStorage();
      
      // ✅ 新增：监听 storage 变化，实时更新桌宠位置
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local') {
            if (changes.petVisible || changes.petPosition) {
              console.log('[Image Capture] 🔄 Pet state changed in storage, refreshing...');
              loadPetPositionFromStorage();
            }
          }
        });
      }
      
      // 1. 拖拽功能 - V3 增强
      initDragAndDrop();
      console.log('[Image Capture] ✅ Drag & drop initialized (V3 enhanced)');
      
      // 2. 图片标记 - V3 增强
      initImageMarkers();
      console.log('[Image Capture] ✅ Image markers initialized (V3 enhanced)');
      
      // 3. 右键菜单 - V3 增强
      initContextMenu();
      console.log('[Image Capture] ✅ Context menu initialized (V3 enhanced)');
      
      // 4. ✅ V3 新增：快捷键支持
      initKeyboardShortcuts();
      console.log('[Image Capture] ✅ Keyboard shortcuts initialized');
      
      // 5. ✅ 新增：首屏可采集提示（延迟1秒执行，确保页面布局稳定）
      // ⚠️ 临时禁用：会影响网页图片加载性能
      // setTimeout(() => {
      //   showCollectibleHints();
      // }, 1000);
      // console.log('[Image Capture] ✅ Collectible hints scheduled');
      
      console.log('[Image Capture] ✅ V3 All features initialized successfully');
      console.log(`[Image Capture] 📊 Config: minSize=${CONFIG.minImageWidth}x${CONFIG.minImageHeight}, hoverDelay=${CONFIG.hoverDelay}ms, iconSize=${CONFIG.imageMarker.iconSize}px`);
      console.log(`[Image Capture] 📦 Pet state: visible=${petVisibleCache}, position=${JSON.stringify(petPositionCache)}`);
    } catch (error) {
      console.error('[Image Capture] ❌ Initialization error:', error);
    }
  }
  
  // 启动
  init();
  
  // ✅ V3: 暴露 API (供外部调用和调试)
  window.__TAB_CLEANER_IMAGE_CAPTURE = {
    captureImage,
    isValidImage,
    getImageUrl,
    findPetElement,
    showNotification, // V3: 新增通知系统
    undoLastSave, // ✅ 新增：撤销功能
    config: CONFIG, // V3: 暴露配置，便于调试
    state: { // V3: 暴露状态，便于调试
      get petElement() { return findPetElement(); },
      get activeMarkers() { return currentMarker ? new Set([currentMarker]) : new Set(); },
      get isDragging() { return !!draggedImage; },
      get currentImage() { return currentImage; },
      get savedCount() { return savedCount; },
    },
  };

})();

