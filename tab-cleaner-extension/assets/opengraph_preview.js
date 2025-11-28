/**
 * OpenGraph 本地预览卡片
 * 在页面上实时显示抓取到的 OpenGraph 数据
 */
(function() {
  'use strict';

  if (window.__TAB_CLEANER_PREVIEW_CARD) {
    return;
  }
  window.__TAB_CLEANER_PREVIEW_CARD = true;

  let previewCard = null;
  let isVisible = false;

  /**
   * 创建预览卡片
   */
  function createPreviewCard() {
    if (previewCard) return previewCard;

    previewCard = document.createElement('div');
    previewCard.id = 'tab-cleaner-opengraph-preview';
    previewCard.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 320px;
      max-height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 2147483647;
      overflow: hidden;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(previewCard);
    return previewCard;
  }

  /**
   * 渲染 OpenGraph 卡片内容
   */
  function renderCard(ogData) {
    if (!previewCard) {
      createPreviewCard();
    }

    const imageSrc = ogData.image || '';
    const title = ogData.title || ogData.url || '无标题';
    const description = ogData.description || '';
    const siteName = ogData.site_name || '';

    previewCard.innerHTML = `
      <div style="position: relative;">
        <!-- 关闭按钮 -->
        <button id="preview-close" style="
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border: none;
          background: rgba(0,0,0,0.5);
          color: white;
          border-radius: 50%;
          cursor: pointer;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
        ">×</button>

        <!-- 图片 -->
        ${imageSrc ? `
          <img src="${imageSrc}" alt="${title}" style="
            width: 100%;
            height: auto;
            max-height: 200px;
            object-fit: cover;
            display: block;
          " onerror="this.style.display='none'">
        ` : ''}

        <!-- 内容 -->
        <div style="padding: 16px;">
          ${siteName ? `
            <div style="
              font-size: 12px;
              color: #666;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 8px;
            ">${siteName}</div>
          ` : ''}
          
          <h3 style="
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: #333;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          ">${title}</h3>

          ${description ? `
            <p style="
              font-size: 14px;
              color: #666;
              margin: 0;
              line-height: 1.5;
              display: -webkit-box;
              -webkit-line-clamp: 3;
              -webkit-box-orient: vertical;
              overflow: hidden;
            ">${description}</p>
          ` : ''}

          <!-- 操作按钮 -->
          <div style="
            margin-top: 16px;
            display: flex;
            gap: 8px;
          ">
            <button id="preview-save" style="
              flex: 1;
              padding: 8px 16px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            ">保存</button>
            <button id="preview-dismiss" style="
              flex: 1;
              padding: 8px 16px;
              background: #f0f0f0;
              color: #333;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            ">忽略</button>
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    const closeBtn = previewCard.querySelector('#preview-close');
    const saveBtn = previewCard.querySelector('#preview-save');
    const dismissBtn = previewCard.querySelector('#preview-dismiss');

    if (closeBtn) {
      closeBtn.addEventListener('click', hidePreview);
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', hidePreview);
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        // 发送消息到 background script 保存
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            action: 'save-opengraph-preview',
            data: ogData
          }).then(() => {
            hidePreview();
          }).catch(err => {
            console.error('[Preview] Failed to save:', err);
          });
        }
      });
    }
  }

  /**
   * 显示预览卡片
   */
  function showPreview(ogData) {
    if (!ogData || !ogData.success) {
      console.warn('[Preview] Invalid OG data:', ogData);
      return;
    }

    renderCard(ogData);
    if (previewCard) {
      previewCard.style.display = 'block';
      previewCard.style.opacity = '0';
      setTimeout(() => {
        previewCard.style.opacity = '1';
      }, 10);
      isVisible = true;
    }
  }

  /**
   * 隐藏预览卡片
   */
  function hidePreview() {
    if (previewCard) {
      previewCard.style.opacity = '0';
      setTimeout(() => {
        previewCard.style.display = 'none';
      }, 300);
      isVisible = false;
    }
  }

  /**
   * 暴露全局函数
   */
  window.__TAB_CLEANER_SHOW_PREVIEW = function(ogData) {
    showPreview(ogData);
  };

  window.__TAB_CLEANER_HIDE_PREVIEW = function() {
    hidePreview();
  };

  console.log('[OpenGraph Preview] ✅ Loaded and ready');
})();




