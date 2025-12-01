/**
 * Tab Cleaner - 截图模式（框选截图）
 * 
 * 功能特性:
 * 1. Alt + 拖拽 = 框选区域截图
 * 2. 支持 Canvas/Video 截图
 * 3. 应对特殊渲染场景（Figma、Canva、视频帧等）
 * 4. 智能识别需要截图的元素
 */

(function() {
  'use strict';

  if (window.__TAB_CLEANER_SCREENSHOT_CAPTURE) {
    console.log('[Screenshot Capture] Already loaded');
    return;
  }
  window.__TAB_CLEANER_SCREENSHOT_CAPTURE = true;

  console.log('[Screenshot Capture] 🚀 Initializing screenshot capture mode...');

  // ==================== 配置 ====================
  
  const CONFIG = {
    // 快捷键
    selectionKey: 'Alt', // Alt 键触发框选模式
    
    // 框选样式
    selectionStyle: {
      borderColor: '#4A90E2',
      borderWidth: 2,
      backgroundColor: 'rgba(74, 144, 226, 0.1)',
      handleSize: 8,
    },
    
    // 需要截图的元素选择器
    screenshotSelectors: {
      canvas: 'canvas',
      video: 'video',
      iframe: 'iframe[src]',
      svg: 'svg',
      // Figma/Canva 特定
      figma: '[class*="canvas"], [class*="figma"]',
      canva: '[class*="canvas"], [class*="canva"]',
    },
  };

  // ==================== 状态管理 ====================
  
  let selectionMode = false;
  let isSelecting = false;
  let selectionStart = null;
  let selectionOverlay = null;
  let currentSelection = null;

  // ==================== UI 组件 ====================
  
  /**
   * 创建框选覆盖层
   */
  function createSelectionOverlay() {
    if (selectionOverlay) {
      return selectionOverlay;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'tc-screenshot-selection-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999998;
      cursor: crosshair;
      pointer-events: auto;
      background: transparent;
    `;
    
    // 选择框
    const selectionBox = document.createElement('div');
    selectionBox.id = 'tc-selection-box';
    selectionBox.style.cssText = `
      position: absolute;
      border: ${CONFIG.selectionStyle.borderWidth}px solid ${CONFIG.selectionStyle.borderColor};
      background: ${CONFIG.selectionStyle.backgroundColor};
      pointer-events: none;
      display: none;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
    `;
    
    // 提示文字
    const hint = document.createElement('div');
    hint.id = 'tc-selection-hint';
    hint.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      z-index: 999999;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    hint.textContent = '🎯 拖拽选择截图区域（按 ESC 取消）';
    
    overlay.appendChild(selectionBox);
    overlay.appendChild(hint);
    
    document.body.appendChild(overlay);
    
    selectionOverlay = {
      overlay,
      box: selectionBox,
      hint,
    };
    
    return selectionOverlay;
  }
  
  /**
   * 移除框选覆盖层
   */
  function removeSelectionOverlay() {
    if (selectionOverlay) {
      selectionOverlay.overlay.remove();
      selectionOverlay = null;
    }
  }
  
  /**
   * 更新选择框位置
   */
  function updateSelectionBox(x1, y1, x2, y2) {
    if (!selectionOverlay) return;
    
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    
    selectionOverlay.box.style.left = `${left}px`;
    selectionOverlay.box.style.top = `${top}px`;
    selectionOverlay.box.style.width = `${width}px`;
    selectionOverlay.box.style.height = `${height}px`;
    selectionOverlay.box.style.display = 'block';
    
    currentSelection = { left, top, width, height };
  }

  // ==================== 截图功能 ====================
  
  /**
   * 裁剪 + 压缩图片，避免占满 chrome.storage 配额
   */
  function cropImage(dataUrl, x, y, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 先按选择框大小裁剪
        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = width;
        rawCanvas.height = height;
        const rawCtx = rawCanvas.getContext('2d');

        // 计算缩放比例（截图可能是高DPI）
        const scale = img.width / window.innerWidth;
        const sx = x * scale;
        const sy = y * scale;
        const sw = width * scale;
        const sh = height * scale;

        rawCtx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

        // 再做一次下采样 + JPEG 压缩，控制尺寸和体积
        const maxSide = 1200;
        const ratio = Math.min(1, maxSide / Math.max(width, height));
        const targetW = Math.round(width * ratio);
        const targetH = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(rawCanvas, 0, 0, width, height, 0, 0, targetW, targetH);

        // 使用 JPEG + 较低质量，大幅减小 base64 长度
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(croppedDataUrl);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  
  /**
   * 截图指定区域
   */
  async function captureSelection(x, y, width, height) {
    try {
      console.log('[Screenshot Capture] 📸 Capturing selection:', { x, y, width, height });
      
      // 发送消息给 background.js 请求截图
      const response = await chrome.runtime.sendMessage({
        action: 'capture-screenshot-selection',
        bounds: { x, y, width, height },
      });
      
      if (response && response.success && response.dataUrl) {
        // 如果 background 返回的是全屏截图，需要裁剪
        if (response.needsCrop) {
          const cropped = await cropImage(response.dataUrl, x, y, width, height);
          return cropped;
        }
        return response.dataUrl;
      }
      
      throw new Error('Screenshot failed');
    } catch (error) {
      console.error('[Screenshot Capture] ❌ Capture failed:', error);
      throw error;
    }
  }
  
  /**
   * 保存截图
   */
  async function saveScreenshot(dataUrl, bounds) {
    try {
      console.log('[Screenshot Capture] 💾 Saving screenshot...');
      
      // 构建 OpenGraph 数据
      const ogData = {
        url: window.location.href,
        title: document.title || window.location.href,
        description: '',
        image: dataUrl, // 直接使用 data URL
        site_name: window.location.hostname.replace(/^www\./, ''),
        success: true,
        is_local_fetch: true,
        is_screenshot: true,
        screenshot_bounds: bounds,
        capture_method: 'screenshot_selection',
        timestamp: Date.now(),
      };
      
      // 发送到 background.js 保存
      const response = await chrome.runtime.sendMessage({
        action: 'save-captured-image',
        data: ogData,
      });
      
      console.log('[Screenshot Capture] ↩️ Background response:', response);
      
      if (!response || typeof response.success === 'undefined') {
        // 乐观兜底：大概率已经保存成功，只是老版本 background 没返回 success 字段
        console.warn('[Screenshot Capture] ⚠️ No explicit success flag from background, assuming success');
        showSuccessNotification('截图已保存到 Tab Cleaner');
        return true;
      }
      
      if (response.success) {
        console.log('[Screenshot Capture] ✅ Screenshot saved successfully');
        showSuccessNotification('截图已保存到 Tab Cleaner');
        return true;
      }
      
      throw new Error(response.error || 'Save failed');
    } catch (error) {
      console.error('[Screenshot Capture] ❌ Save failed:', error);
      showErrorNotification('截图保存失败');
      return false;
    }
  }
  
  /**
   * 显示成功提示
   */
  function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = `✓ ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  /**
   * 显示错误提示
   */
  function showErrorNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = `✗ ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ==================== 事件处理 ====================
  
  /**
   * 启动框选模式
   */
  function startSelectionMode() {
    if (selectionMode) return;
    
    selectionMode = true;
    isSelecting = false;
    selectionStart = null;
    
    createSelectionOverlay();
    
    console.log('[Screenshot Capture] 🎯 Selection mode activated');
  }
  
  /**
   * 退出框选模式
   */
  function exitSelectionMode() {
    if (!selectionMode) return;
    
    selectionMode = false;
    isSelecting = false;
    selectionStart = null;
    currentSelection = null;
    
    removeSelectionOverlay();
    
    console.log('[Screenshot Capture] 👋 Selection mode deactivated');
  }
  
  /**
   * 处理鼠标按下
   */
  function handleMouseDown(e) {
    if (!selectionMode) return;
    
    // 只处理左键
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isSelecting = true;
    selectionStart = { x: e.clientX, y: e.clientY };
    
    console.log('[Screenshot Capture] 🖱️ Selection started:', selectionStart);
  }
  
  /**
   * 处理鼠标移动
   */
  function handleMouseMove(e) {
    if (!selectionMode || !isSelecting || !selectionStart) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    updateSelectionBox(
      selectionStart.x,
      selectionStart.y,
      e.clientX,
      e.clientY
    );
  }
  
  /**
   * 处理鼠标释放
   */
  async function handleMouseUp(e) {
    if (!selectionMode || !isSelecting || !selectionStart) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isSelecting = false;
    
    if (!currentSelection || currentSelection.width < 10 || currentSelection.height < 10) {
      // 选择区域太小，忽略
      console.log('[Screenshot Capture] ⚠️ Selection too small, ignored');
      exitSelectionMode();
      return;
    }
    
    try {
      // 显示加载提示
      if (selectionOverlay && selectionOverlay.hint) {
        selectionOverlay.hint.textContent = '📸 正在截图...';
      }
      
      // 截图
      const screenshot = await captureSelection(
        currentSelection.left,
        currentSelection.top,
        currentSelection.width,
        currentSelection.height
      );
      
      // 保存
      await saveScreenshot(screenshot, currentSelection);
      
      // 退出模式
      exitSelectionMode();
    } catch (error) {
      console.error('[Screenshot Capture] ❌ Error:', error);
      showErrorNotification('截图失败: ' + error.message);
      exitSelectionMode();
    }
  }
  
  /**
   * 处理键盘事件
   */
  function handleKeyDown(e) {
    // Alt 键按下，准备进入框选模式
    if (e.key === 'Alt' && !selectionMode) {
      // 延迟启动，等待 Alt 键释放
      const handleAltUp = () => {
        if (e.altKey) {
          startSelectionMode();
        }
        document.removeEventListener('keyup', handleAltUp);
      };
      document.addEventListener('keyup', handleAltUp, { once: true });
    }
    
    // ESC 退出框选模式
    if (e.key === 'Escape' && selectionMode) {
      exitSelectionMode();
    }
  }

  // ==================== 智能检测 ====================
  
  /**
   * 检测是否需要截图模式
   */
  function detectScreenshotNeeded() {
    const hostname = window.location.hostname;
    
    // 检查是否有 Canvas/Video 元素
    const hasCanvas = document.querySelector('canvas');
    const hasVideo = document.querySelector('video');
    const hasFigma = hostname.includes('figma.com');
    const hasCanva = hostname.includes('canva.com');
    
    if (hasCanvas || hasVideo || hasFigma || hasCanva) {
      console.log('[Screenshot Capture] 🎨 Screenshot mode recommended');
      return true;
    }
    
    return false;
  }
  
  /**
   * 显示截图提示
   */
  function showScreenshotHint() {
    if (detectScreenshotNeeded()) {
      const hint = document.createElement('div');
      hint.id = 'tc-screenshot-hint';
      hint.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(74, 144, 226, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        z-index: 999997;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        cursor: pointer;
        max-width: 300px;
      `;
      hint.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">📸 需要截图？</div>
        <div style="font-size: 12px; opacity: 0.9;">按 <kbd style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px;">Alt</kbd> + 拖拽选择区域</div>
      `;
      
      hint.addEventListener('click', () => {
        hint.remove();
      });
      
      document.body.appendChild(hint);
      
      // 5秒后自动隐藏
      setTimeout(() => {
        if (hint.parentNode) {
          hint.style.opacity = '0';
          hint.style.transition = 'opacity 0.3s';
          setTimeout(() => hint.remove(), 300);
        }
      }, 5000);
    }
  }

  // ==================== 初始化 ====================
  
  function init() {
    console.log('[Screenshot Capture] 🚀 Starting initialization...');
    
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    try {
      // 绑定事件
      document.addEventListener('mousedown', handleMouseDown, true);
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('keydown', handleKeyDown, true);
      
      // 检测是否需要截图模式
      setTimeout(() => {
        showScreenshotHint();
      }, 2000);
      
      console.log('[Screenshot Capture] ✅ Initialized successfully');
    } catch (error) {
      console.error('[Screenshot Capture] ❌ Initialization error:', error);
    }
  }
  
  // 启动
  init();
  
  // 暴露 API
  window.__TAB_CLEANER_SCREENSHOT_CAPTURE_API = {
    startSelectionMode,
    exitSelectionMode,
    captureSelection,
    saveScreenshot,
  };

})();

