/**
 * OpenGraph 数据规范化工具（前端）
 * 确保发送到后端的数据格式完全一致
 */

/**
 * 规范化单个 OpenGraph 项
 * @param {Object} item - OpenGraph 数据项
 * @returns {Object} 规范化后的数据项
 */
function normalizeOpenGraphItem(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Item must be a non-empty object');
  }

  const normalized = {};

  // 1. url (required, string)
  if (!item.url) {
    throw new Error('url is required');
  }
  normalized.url = String(item.url).trim();

  // 2. title (string | null)
  normalized.title = item.title || item['og:title'] || item.tab_title || null;
  if (normalized.title) {
    normalized.title = String(normalized.title).trim() || null;
  }

  // 3. description (string | null)
  normalized.description = item.description || item['og:description'] || null;
  if (normalized.description) {
    normalized.description = String(normalized.description).trim() || null;
  }

  // 4. image (string | null) - 关键：不能是数组
  let image = item.image || item['og:image'] || item.thumbnail_url || null;
  if (image) {
    if (Array.isArray(image)) {
      // 如果是数组，取第一个元素
      image = image.length > 0 ? String(image[0]).trim() : null;
    } else if (typeof image === 'string') {
      image = image.trim() || null;
    } else {
      image = String(image).trim() || null;
    }
  }
  normalized.image = image;

  // 5. site_name (string | null)
  normalized.site_name = item.site_name || item['og:site_name'] || null;
  if (normalized.site_name) {
    normalized.site_name = String(normalized.site_name).trim() || null;
  }

  // 6. tab_id (number | null)
  if (item.tab_id !== undefined && item.tab_id !== null) {
    const tabId = Number(item.tab_id);
    normalized.tab_id = isNaN(tabId) ? null : tabId;
  } else {
    normalized.tab_id = null;
  }

  // 7. tab_title (string | null)
  normalized.tab_title = item.tab_title || null;
  if (normalized.tab_title) {
    normalized.tab_title = String(normalized.tab_title).trim() || null;
  }

  // 8. text_embedding (array | null)
  normalized.text_embedding = null;
  if (item.text_embedding && Array.isArray(item.text_embedding) && item.text_embedding.length > 0) {
    try {
      normalized.text_embedding = item.text_embedding.map(x => Number(x)).filter(x => !isNaN(x));
      if (normalized.text_embedding.length !== 1024) {
        console.warn('[Normalize] text_embedding has', normalized.text_embedding.length, 'dims, expected 1024');
      }
    } catch (e) {
      console.warn('[Normalize] Failed to normalize text_embedding:', e);
      normalized.text_embedding = null;
    }
  }

  // 9. image_embedding (array | null)
  normalized.image_embedding = null;
  if (item.image_embedding && Array.isArray(item.image_embedding) && item.image_embedding.length > 0) {
    try {
      normalized.image_embedding = item.image_embedding.map(x => Number(x)).filter(x => !isNaN(x));
      if (normalized.image_embedding.length !== 1024) {
        console.warn('[Normalize] image_embedding has', normalized.image_embedding.length, 'dims, expected 1024');
      }
    } catch (e) {
      console.warn('[Normalize] Failed to normalize image_embedding:', e);
      normalized.image_embedding = null;
    }
  }

  // 10. metadata (object | null)
  normalized.metadata = null;
  if (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) {
    normalized.metadata = item.metadata;
  }

  // 11. 布尔字段
  normalized.is_doc_card = Boolean(item.is_doc_card || false);
  normalized.is_screenshot = Boolean(item.is_screenshot || false);
  normalized.success = Boolean(item.success !== undefined ? item.success : true);

  // 12. 其他字段（保留）
  if (item.image_width !== undefined) {
    const width = Number(item.image_width);
    normalized.image_width = isNaN(width) ? null : width;
  }
  if (item.image_height !== undefined) {
    const height = Number(item.image_height);
    normalized.image_height = isNaN(height) ? null : height;
  }

  return normalized;
}

/**
 * 批量规范化 OpenGraph 项列表
 * @param {Array} items - OpenGraph 数据项列表
 * @returns {Array} 规范化后的数据项列表
 */
function normalizeOpenGraphItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized = [];
  for (const item of items) {
    try {
      normalized.push(normalizeOpenGraphItem(item));
    } catch (e) {
      console.warn('[Normalize] Failed to normalize item:', e, item);
      // 跳过无效项，继续处理其他项
    }
  }
  return normalized;
}

// 如果在浏览器环境中，导出到全局
if (typeof window !== 'undefined') {
  window.__TAB_CLEANER_NORMALIZE_OPENGRAPH = {
    normalizeItem: normalizeOpenGraphItem,
    normalizeItems: normalizeOpenGraphItems,
  };
}

// 如果在 Node.js 环境中（测试），使用 module.exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeOpenGraphItem,
    normalizeOpenGraphItems,
  };
}




