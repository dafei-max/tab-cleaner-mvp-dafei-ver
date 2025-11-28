/**
 * API 配置模块
 * 支持本地开发和生产环境切换
 * 
 * Railway 生产环境: https://tab-cleaner-mvp-production.up.railway.app
 * 本地开发环境: http://localhost:8000
 */

// Railway 生产环境地址
const RAILWAY_API_URL = 'https://tab-cleaner-mvp-production.up.railway.app';
const LOCAL_API_URL = 'http://localhost:8000';

// 获取 API 基础 URL
// 优先从 chrome.storage 读取配置，否则使用默认值
async function getApiUrl() {
  try {
    // 尝试从 chrome.storage 读取配置
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['api_url', 'use_local_api']);
      if (result.api_url) {
        return result.api_url;
      }
      // 如果设置了 use_local_api，使用本地地址
      if (result.use_local_api === true) {
        return LOCAL_API_URL;
      }
    }
  } catch (e) {
    console.warn('[API Config] Failed to read from chrome.storage:', e);
  }
  
  // 默认使用 Railway 生产环境
  return RAILWAY_API_URL;
}

// 同步获取 API URL（用于立即使用，不等待异步）
function getApiUrlSync() {
  // 默认使用 Railway 生产环境
  // 如果需要本地开发，可以通过 chrome.storage 设置 use_local_api: true
  return RAILWAY_API_URL;
}

// API 端点生成函数
function getApiEndpoints(baseUrl) {
  return {
    base: baseUrl,
    opengraph: `${baseUrl}/api/v1/tabs/opengraph`,
    embedding: `${baseUrl}/api/v1/search/embedding`,
    search: `${baseUrl}/api/v1/search/query`,
    aiInsight: `${baseUrl}/api/v1/ai/insight`,
  };
}

// 导出配置对象（用于 background.js 等）
const API_CONFIG = {
  getBaseUrl: getApiUrl,
  getBaseUrlSync: getApiUrlSync,
  getEndpoints: getApiEndpoints,
  RAILWAY_URL: RAILWAY_API_URL,
  LOCAL_URL: LOCAL_API_URL,
};

// 如果是在浏览器环境中，将配置存储到全局变量
if (typeof window !== 'undefined') {
  window.__TAB_CLEANER_API_CONFIG = API_CONFIG;
}

// 导出（用于模块化环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_CONFIG;
}

