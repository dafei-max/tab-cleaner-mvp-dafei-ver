import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Component } from "../../components/Component";
import { SearchBar } from "../../components/SearchBar";
import { ToolSets } from "../../components/ToolSets";
import { getImageUrl } from "../../shared/utils";
import { initialImages } from "./imageData";
import { OpenGraphCard } from "./OpenGraphCard";
import { SelectionPanel } from "./SelectionPanel";
import { ViewButtons } from "./ViewButtons";
import { AIClusteringPanel } from "./AIClusteringPanel";
import { useSessionManager } from "../../hooks/useSessionManager";
import { useHistory } from "../../hooks/useHistory";
import { useSearch } from "../../hooks/useSearch";
import { calculateRadialLayout } from "../../utils/radialLayout";
import { handleLassoSelect as handleLassoSelectUtil } from "../../utils/selection";
import { createManualCluster } from "../../shared/api";
import { useClusterSpringAnimation } from "../../hooks/useClusterSpringAnimation";
import FlowingSkyBackground from "../../components/FlowingSkyBackground";
import { GradualBlur } from "../../components/GradualBlur";
import FluidGlassCursor from "../../components/FluidGlassCursor/FluidGlassCursor";
import { UI_CONFIG } from "./uiConfig";
import { PetSetting } from "./PetSetting";
import { PetDisplay } from "../../components/PetDisplay/PetDisplay";
// 新的 hooks 和组件
import { useCanvasInteractions } from "./hooks/useCanvasInteractions";
import { useHistoryHandlers } from "./hooks/useHistoryHandlers";
import { useClustering } from "./hooks/useClustering";
import { PersonalSpaceHeader } from "./components/PersonalSpaceHeader";
import { SearchOverlay } from "./components/SearchOverlay";
import { ViewContainer } from "./components/ViewContainer";
import { 
  calculateDeltaE, 
  hexToLab, 
  COLOR_MATCH_THRESHOLD, 
  extractColorsFromBase64,
  hexToHsv,
  calculateHueDifference,
  areComplementaryColors
} from "../../utils/colorUtils";
import "./style.css";

export const PersonalSpace = () => {
  // OpenGraph 数据
  const [opengraphData, setOpengraphData] = useState([]);
  const [selectedOG, setSelectedOG] = useState(null); // 选中的 OpenGraph 卡片（用于显示详情）
  const lastOGClickRef = useRef({ time: 0, id: null }); // 用于双击检测
  
  // 搜索输入处理相关 refs
  const previousQueryRef = useRef(""); // 跟踪之前的搜索查询（用于退格检测）
  
  // 管理图片位置和选中状态
  // 如果有 OpenGraph 数据，隐藏原有图片；否则显示原有图片
  const [showOriginalImages, setShowOriginalImages] = useState(true);
  const [images, setImages] = useState(() =>
    initialImages.map(img => ({
      ...img,
      src: getImageUrl(img.imageName),
    }))
  );
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // 页面切换状态：'home' | 'petSetting'
  // ✅ 检查 URL hash，如果包含 #pet-setting，默认打开宠物设置页面
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#pet-setting') {
      return 'petSetting';
    }
    return 'home';
  });
  
  // ✅ 监听 hash 变化，支持从外部打开宠物设置页面
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#pet-setting') {
        setCurrentPage('petSetting');
      } else if (window.location.hash === '' || window.location.hash === '#') {
        setCurrentPage('home');
      }
    };
    
    // 初始检查
    handleHashChange();
    
    // 监听 hash 变化
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);
  const [activeTool, setActiveTool] = useState(null); // 'draw' | 'lasso' | 'text' | null
  const containerRef = useRef(null);
  
  // 使用画布交互 hook
  const {
    canvasRef,
    zoom,
    pan,
    isPanning,
    isSpacePressed,
    getCanvasCursor,
    isBlankCanvasTarget,
  } = useCanvasInteractions(activeTool, containerRef, UI_CONFIG.radialCamera);

  // 画布工具状态（由父组件管理，支持撤销/重做）
  const [drawPaths, setDrawPaths] = useState([]);
  const [textElements, setTextElements] = useState([]);
  
  // 撤销/重做历史记录（使用 hook）
  const { history, historyIndex, addToHistory, canUndo, canRedo, setHistoryIndex } = useHistory(50);
  
  // 使用历史记录处理 hook
  const { handleUndo, handleRedo } = useHistoryHandlers({
    history,
    historyIndex,
    setHistoryIndex,
    setDrawPaths,
    setTextElements,
    setSelectedIds,
    setImages,
    setOpengraphData,
  });

  // AI 聚类面板显示状态
  const [showAIClusteringPanel, setShowAIClusteringPanel] = useState(false);

  // 🆕 颜色筛选状态
  const [selectedColorFilter, setSelectedColorFilter] = useState(null);
  const colorEnrichRunningRef = useRef(false); // 前端渲染后兜底补色，避免并发
  const colorFetchRunningRef = useRef(false); // 远程 fetch 补色并发控制

  // 选中分组名称
  const [selectedGroupName, setSelectedGroupName] = useState("未命名分组");

  // 使用聚类 hook
  const {
    clusters,
    setClusters,
    isClustering,
    aiLabels,
    clusterDragStartRef,
    handleClusterRename,
    handleClusterDrag,
    handleAddLabel,
    handleLabelRename,
    handleLabelDelete,
    handleClassify,
    handleDiscover,
  } = useClustering({
    showOriginalImages,
    images,
    opengraphData,
    setImages,
    setOpengraphData,
  });

  // 视图模式：'radial' 或 'masonry'
  const [viewMode, setViewMode] = useState('masonry'); // 默认使用 masonry 视图

  // Session 管理（使用 hook）
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading: isSessionsLoading,
    createSession,
    updateSession,
    deleteSession,
    getCurrentSession,
    renameSession,
  } = useSessionManager();

  // 🆕 渲染后兜底补色（针对一键清理/跨域图）：有 base64 但无 dominant_colors 时，前端再提色
  useEffect(() => {
    if (colorEnrichRunningRef.current) return;
    if (isSessionsLoading || !sessions || sessions.length === 0) return;

    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const candidates = [];
    safeSessions.forEach((session, sIdx) => {
      (session?.opengraphData || []).forEach((item, iIdx) => {
        if (!item || (item.dominant_colors && item.dominant_colors.length > 0)) return;
        // 🆕 优先从 IndexedDB 加载（无 CORS 限制）
        candidates.push({ sIdx, iIdx, item });
      });
    });

    if (candidates.length === 0) return;

    const toProcess = candidates.slice(0, 10); // 每次最多 10 条，避免阻塞
    colorEnrichRunningRef.current = true;
    console.log(`[ColorEnrich] 🖼️ 渲染后补色：待处理 ${candidates.length}，本轮 ${toProcess.length}（优先从 IndexedDB）`);

    (async () => {
      try {
        const sessionUpdates = new Map(); // sIdx -> updated og list
        for (const c of toProcess) {
          try {
            // 🆕 优先从 IndexedDB 加载图片（无 CORS 限制）
            let imageDataUrl = null;
            
            // 1. 尝试从 IndexedDB 加载（通过 original_image_url 或 image）
            if (c.item.original_image_url) {
              try {
                if (window.__TAB_CLEANER_EAGLE_STORAGE && window.__TAB_CLEANER_EAGLE_STORAGE.loadImage) {
                  const indexedDbData = await window.__TAB_CLEANER_EAGLE_STORAGE.loadImage(c.item.original_image_url);
                  if (indexedDbData && indexedDbData.dataUrl) {
                    imageDataUrl = indexedDbData.dataUrl;
                    console.log('[ColorEnrich] ✅ Loaded from IndexedDB for color extraction');
                  }
                }
              } catch (error) {
                console.warn('[ColorEnrich] ⚠️ Failed to load from IndexedDB:', error);
              }
            }
            
            // 2. 如果没有从 IndexedDB 加载到，尝试使用已有的 base64
            if (!imageDataUrl) {
              imageDataUrl =
                c.item.thumbnail ||
                c.item.screenshot_image ||
                (c.item.image && c.item.image.startsWith('data:image') ? c.item.image : null);
            }
            
            if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
              const colors = await extractColorsFromBase64(imageDataUrl);
              if (colors && colors.length > 0) {
                const session = safeSessions[c.sIdx];
                if (!sessionUpdates.has(c.sIdx)) {
                  sessionUpdates.set(c.sIdx, [...(session?.opengraphData || [])]);
                }
                const ogList = sessionUpdates.get(c.sIdx);
                ogList[c.iIdx] = { ...ogList[c.iIdx], dominant_colors: colors };
              }
            }
          } catch (e) {
            console.warn('[ColorEnrich] ⚠️ Color extraction failed:', e);
          }
        }

        // 批量写回
        sessionUpdates.forEach((ogList, sIdx) => {
          const session = safeSessions[sIdx];
          if (session && Array.isArray(ogList)) {
            updateSession(session.id, { opengraphData: ogList });
          }
        });

        if (sessionUpdates.size > 0) {
          console.log(`[ColorEnrich] ✅ 本轮补色完成，更新 ${sessionUpdates.size} 个 session`);
        }
      } finally {
        colorEnrichRunningRef.current = false;
      }
    })();
  }, [sessions, isSessionsLoading, updateSession]);

  // ❌ 已禁用：远程 HTTP 图片颜色提取（避免 CORS 错误）
  // 改为使用 ps_color_analyzer.js 在 PersonalSpace 中批量提取颜色
  // useEffect(() => {
  //   // ColorEnrichFetch 逻辑已禁用
  // }, [sessions, isSessionsLoading, updateSession]);

  // 🆕 使用 ps_color_analyzer.js 批量提取颜色（延迟执行，避免阻塞首次渲染）
  useEffect(() => {
    // 延迟 2 秒，避免阻塞首次渲染
    const timer = setTimeout(() => {
      analyzeColorsInBackground();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading, updateSession]);

  // 🦅 Eagle Storage: 自动迁移远程图片到本地存储（延迟执行）
  useEffect(() => {
    // 延迟 3 秒，在颜色分析之后执行
    const timer = setTimeout(() => {
      migrateToEagleStorage();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading, updateSession]);

  // 🆕 如果存在 data:URL 兜底数据，自动迁移到 IndexedDB
  useEffect(() => {
    const timer = setTimeout(() => {
      const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
      if (eagleStorage && eagleStorage.migrateDataUrlSessions) {
        eagleStorage.migrateDataUrlSessions({
          onProgress: (current, total, migrated, failed) => {
            if (current % 5 === 0 || current === total) {
              console.log(`[Eagle Storage] 🔄 DataURL migration progress: ${current}/${total} (migrated: ${migrated}, failed: ${failed})`);
            }
          },
          batchSize: 2,
        });
      }
    }, 2000); // 稍微提前，尽快把 data:URL 迁回 IndexedDB

    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading]);

  // 🆕 为 session 中的图片补充 caption 和 tags（延迟执行）
  useEffect(() => {
    // 延迟 5 秒，在迁移之后执行
    const timer = setTimeout(() => {
      enrichSessionImages();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading]);

  // ✅ 主动补齐现有卡片的 caption（方便本地查询）
  const syncExistingCardsCaptions = useCallback(async () => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    console.log('[PersonalSpace] 🔍 Checking existing cards for missing captions...');
    
    // ✅ URL 规范化函数（与后端保持一致）
    const normalizeUrl = (url) => {
      if (!url) return url;
      try {
        const urlObj = new URL(url);
        // 移除查询参数、锚点、尾随斜杠
        urlObj.search = '';
        urlObj.hash = '';
        let path = urlObj.pathname;
        // 移除尾随斜杠（但保留根路径的斜杠）
        if (path.length > 1 && path.endsWith('/')) {
          path = path.slice(0, -1);
        }
        urlObj.pathname = path;
        return urlObj.toString();
      } catch (e) {
        // 如果 URL 解析失败，尝试简单处理
        let normalized = url.split('?')[0].split('#')[0];
        if (normalized.length > 1 && normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }
        return normalized;
      }
    };
    
    // 1. 收集所有缺少 caption 的卡片 URL
    const cardsNeedingCaption = [];
    const dedupUrlSet = new Set(); // 避免重复发送
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    
    for (const session of safeSessions) {
      if (!session?.opengraphData) continue;
      
      session.opengraphData.forEach((item, itemIndex) => {
        // ✅ 修复：优先使用 original_image_url（图片 URL），而不是 url（可能是页面 URL）
        // 因为数据库中存储的 url 字段是图片 URL，需要匹配
        const url = item.original_image_url || item.url || item.image || '';
        if (!url || url.startsWith('eagle://') || url.startsWith('data:')) return;
        // 过滤 view-source: 噪声 URL
        if (url.startsWith('view-source:')) return;
        
        // 检查是否缺少 caption 或 tags
        const hasCaption = item.image_caption && 
                          item.image_caption.trim() && 
                          !item.image_caption.includes('主要颜色:') &&
                          item.image_caption.length > 20;
        const hasTags = (item.style_tags && Array.isArray(item.style_tags) && item.style_tags.length > 0) ||
                       (item.object_tags && Array.isArray(item.object_tags) && item.object_tags.length > 0);
        
        // ✅ 如果缺少 caption 或 tags，都需要补齐（使用 || 逻辑）
        if (!hasCaption || !hasTags) {
          cardsNeedingCaption.push({
            url,
            sessionId: session.id,
            itemIndex, // ✅ 使用 forEach 的 index 参数，更可靠
            hasCaption: !!hasCaption,
            hasTags: !!hasTags,
            // ✅ 添加调试信息
            displayUrl: item.url?.substring(0, 60),
            originalImageUrl: item.original_image_url?.substring(0, 60),
          });
        }
      });
    }
    
    if (cardsNeedingCaption.length === 0) {
      console.log('[PersonalSpace] ✅ All existing cards have captions');
      return;
    }
    
    console.log(`[PersonalSpace] 📋 Found ${cardsNeedingCaption.length} cards needing captions`);
    
    // 2. 批量拉取 caption（分批处理，避免一次性请求过多）
    const batchSize = 20;
    const apiUrl = window.__TAB_CLEANER_API_CONFIG?.getBaseUrlSync?.() || 'https://tab-cleaner-mvp-app-production.up.railway.app';
    const userId = await chrome.storage.local.get(['user_id']).then(r => r.user_id || 'anonymous');
    
    let totalUpdated = 0;
    const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
    
    for (let i = 0; i < cardsNeedingCaption.length; i += batchSize) {
      const batch = cardsNeedingCaption.slice(i, i + batchSize);
      // ✅ 规范化 URL（与后端保持一致），并附带页面 URL + 图片 URL 去重发送
      const urls = [];
      batch.forEach(c => {
        const rawUrl = c.url;
        const normPage = normalizeUrl(rawUrl);
        if (normPage && !normPage.startsWith('view-source:')) {
          const key = normPage.toLowerCase();
          if (!dedupUrlSet.has(key)) {
            dedupUrlSet.add(key);
            urls.push(normPage);
          }
        }
        // 如果有 original_image_url 单独再带一次
        if (c.originalImageUrl && c.originalImageUrl !== rawUrl) {
          const normImg = normalizeUrl(c.originalImageUrl);
          if (normImg) {
            const key2 = normImg.toLowerCase();
            if (!dedupUrlSet.has(key2)) {
              dedupUrlSet.add(key2);
              urls.push(normImg);
            }
          }
        }
      });
      
      try {
        console.log(`[PersonalSpace] 📦 Fetching captions for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cardsNeedingCaption.length / batchSize)} (${urls.length} URLs)`);
        console.log(`[PersonalSpace] 🔍 Sample URLs being sent:`, urls.slice(0, 3).map(u => u.substring(0, 80)));
        console.log(`[PersonalSpace] 🔍 Full batch URLs:`, urls.map(u => u.substring(0, 100)));
        console.log(`[PersonalSpace] 🔍 Batch card info:`, batch.map(c => ({
          url: c.url?.substring(0, 60),
          displayUrl: c.displayUrl,
          originalImageUrl: c.originalImageUrl,
          hasCaption: c.hasCaption,
          hasTags: c.hasTags
        })));
        
        const response = await fetch(`${apiUrl}/api/v1/search/batch-captions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
          },
          body: JSON.stringify({ urls }),
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`[PersonalSpace] 📥 Batch response:`, {
            success: result?.success,
            resultsCount: result?.results?.length || 0,
            requestedCount: urls.length,
            sampleResults: result?.results?.slice(0, 2).map(r => ({
              url: r.url?.substring(0, 60),
              hasCaption: !!r.image_caption,
              hasTags: !!(r.style_tags?.length || r.object_tags?.length)
            }))
          });
          
          // ✅ 如果返回的结果数量少于请求的数量，说明有些 URL 在数据库中不存在或没有 caption
          if (result?.results?.length < urls.length) {
            const missingUrls = urls.filter(u => {
              const normalizedU = normalizeUrl(u).toLowerCase();
              return !result.results.some(r => {
                const resultUrl = normalizeUrl(r.url || '').toLowerCase();
                return resultUrl === normalizedU;
              });
            });
            console.warn(`[PersonalSpace] ⚠️ ${missingUrls.length} URLs not found in database or have no caption:`, missingUrls.slice(0, 3).map(u => u.substring(0, 60)));
            console.warn(`[PersonalSpace] 💡 These cards may:`);
            console.warn(`   1. Not have been saved to database yet (will be saved when page is opened)`);
            console.warn(`   2. Be in database but caption generation hasn't completed yet`);
            console.warn(`   3. Need to trigger caption generation manually`);
            
            // ✅ 对于在数据库中但没有 caption 的图片，可以尝试触发 caption 生成
            // 注意：这需要后端支持，目前只是记录日志
            if (missingUrls.length > 0) {
              console.log(`[PersonalSpace] 💡 Tip: Open these pages to trigger caption generation:`, missingUrls.slice(0, 3));
            }
          }
          
          if (result?.success !== false && result?.results) {
            const sessionUpdates = new Map(); // sessionId -> updated og list
            
            // 3. 更新 sessions 数据
            for (const captionResult of result.results) {
              const { url: resultUrl, image_caption: resultImageCaption, quickCaption, style_tags, object_tags, dominant_colors } = captionResult;
              const image_caption = resultImageCaption || quickCaption || '';
              
              if (!image_caption) {
                console.log(`[PersonalSpace] ⚠️ Skipping result with no caption:`, resultUrl?.substring(0, 60));
                continue;
              }
              
              // ✅ 直接从 sessions 中查找匹配的卡片（更可靠）
              // 因为后端可能返回网页 URL 或图片 URL，需要同时匹配
              let matched = false;
              
              for (const session of safeSessions) {
                if (!session?.opengraphData) continue;
                
                const itemIndex = session.opengraphData.findIndex(item => {
                  // ✅ 规范化所有 URL 后再比较（与后端保持一致）
                  const itemUrl = normalizeUrl(item.url || '').toLowerCase();
                  const itemImageUrl = normalizeUrl(item.original_image_url || '').toLowerCase();
                  const resultUrlLower = normalizeUrl(resultUrl || '').toLowerCase();
                  return itemUrl === resultUrlLower || itemImageUrl === resultUrlLower;
                });
                
                if (itemIndex >= 0) {
                  // 找到匹配的卡片
                  if (!sessionUpdates.has(session.id)) {
                    sessionUpdates.set(session.id, [...session.opengraphData]);
                  }
                  
                  const ogList = sessionUpdates.get(session.id);
                  ogList[itemIndex] = {
                    ...ogList[itemIndex],
                    image_caption: image_caption || ogList[itemIndex].image_caption,
                    dominant_colors: dominant_colors || ogList[itemIndex].dominant_colors || [],
                    style_tags: style_tags || ogList[itemIndex].style_tags || [],
                    object_tags: object_tags || ogList[itemIndex].object_tags || [],
                  };
                  
                  matched = true;
                  console.log(`[PersonalSpace] ✅ Matched and updated card:`, {
                    sessionId: session.id,
                    itemIndex,
                    resultUrl: resultUrl?.substring(0, 60),
                    itemUrl: session.opengraphData[itemIndex].url?.substring(0, 60),
                    itemImageUrl: session.opengraphData[itemIndex].original_image_url?.substring(0, 60)
                  });
                  
                  // 同时更新 IndexedDB（如果图片已保存）
                  if (eagleStorage && eagleStorage.loadImage && eagleStorage.updateImageCaption) {
                    try {
                      const matchedItem = session.opengraphData[itemIndex];
                      const imageUrl = matchedItem.original_image_url || matchedItem.url || matchedItem.image;
                      if (imageUrl && !imageUrl.startsWith('eagle://') && !imageUrl.startsWith('data:')) {
                        const imageData = await eagleStorage.loadImage(imageUrl);
                        if (imageData && imageData.hash) {
                          await eagleStorage.updateImageCaption(
                            imageData.hash,
                            image_caption,
                            style_tags || [],
                            object_tags || [],
                            dominant_colors || []
                          );
                          console.log(`[PersonalSpace] ✅ Updated IndexedDB for:`, imageUrl.substring(0, 60));
                        }
                      }
                    } catch (e) {
                      console.warn(`[PersonalSpace] ⚠️ Failed to update IndexedDB:`, e);
                    }
                  }
                  
                  break; // 找到匹配后退出循环
                }
              }
              
              if (!matched) {
                console.log(`[PersonalSpace] ⚠️ No matching card found for result:`, {
                  resultUrl: resultUrl?.substring(0, 60),
                  searchedIn: safeSessions.length + ' sessions'
                });
              }
            }
            
            // 批量更新 sessions
            sessionUpdates.forEach((ogList, sessionId) => {
              updateSession(sessionId, { opengraphData: ogList });
            });
            
            totalUpdated += sessionUpdates.size;
            console.log(`[PersonalSpace] ✅ Batch ${Math.floor(i / batchSize) + 1} complete: ${sessionUpdates.size} sessions updated`);
            if (sessionUpdates.size === 0 && result?.results?.length > 0) {
              console.warn(`[PersonalSpace] ⚠️ Got ${result.results.length} results but matched 0 cards - check URL matching logic`);
            }
          } else {
            console.warn(`[PersonalSpace] ⚠️ Batch response has no results:`, result);
          }
        } else {
          console.warn(`[PersonalSpace] ⚠️ Batch fetch failed:`, response.status, await response.text().catch(() => ''));
        }
      } catch (error) {
        console.error(`[PersonalSpace] ❌ Batch fetch error:`, error);
      }
      
      // 避免请求过快，添加小延迟
      if (i + batchSize < cardsNeedingCaption.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`[PersonalSpace] ✅ Caption sync complete: ${totalUpdated} sessions updated`);
    
    // ✅ 如果有些卡片没有补齐，记录详细信息
    if (totalUpdated === 0 && cardsNeedingCaption.length > 0) {
      console.warn(`[PersonalSpace] ⚠️ No cards were updated. Possible reasons:`);
      console.warn(`  1. Cards not saved to database yet (will be saved when page is opened)`);
      console.warn(`  2. URL mismatch (check console logs above for details)`);
      console.warn(`  3. Backend hasn't generated captions yet`);
      console.warn(`  4. User ID mismatch`);
    }
  }, [sessions, isSessionsLoading, updateSession]);

  // 🆕 便于控制台手动触发：将补齐函数挂到 window（刷新时自动清理）
  useEffect(() => {
    window.__TC_SYNC_CAPTIONS = syncExistingCardsCaptions;
    return () => {
      delete window.__TC_SYNC_CAPTIONS;
    };
  }, [syncExistingCardsCaptions]);

  // ✅ 页面刷新 / 重新进入时立即触发一次补齐（不等延迟），并在页面重新可见时再补一次
  useEffect(() => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    let didImmediateSync = false;

    const runImmediateSync = () => {
      if (didImmediateSync) return;
      didImmediateSync = true;
      console.log('[PersonalSpace] 🔁 Immediate caption sync on refresh/visibility');
      syncExistingCardsCaptions();
    };

    // 首次进入立即跑
    runImmediateSync();

    // 页面再次可见时再跑一次，防止后台长时间错过 WS 推送
    const handleVisibility = () => {
      if (!document.hidden) {
        console.log('[PersonalSpace] 👀 Page visible, re-sync captions');
        syncExistingCardsCaptions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessions, isSessionsLoading, syncExistingCardsCaptions]);

  // ✅ 在页面加载时主动补齐现有卡片的 caption（带短延迟，避免刚加载时的抖动）
  useEffect(() => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    // ✅ 延迟 3 秒执行（缩短延迟，更快补齐）
    const timer = setTimeout(() => {
      console.log('[PersonalSpace] ⏰ Triggering caption sync for existing cards...');
      syncExistingCardsCaptions();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading, syncExistingCardsCaptions]);

  // ✅ 添加轮询机制：定期检查并拉取缺失的 Caption（每 60 秒检查一次）
  // 这样即使 WebSocket 未连接或推送失败，也能自动拉取数据库中的更新
  useEffect(() => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    let pollInterval = null;
    
    // 首次延迟 30 秒（避免与 syncExistingCardsCaptions 的初始 3 秒延迟重复）
    const initialDelay = setTimeout(() => {
      console.log('[PersonalSpace] 🔄 Polling: Starting periodic caption check (every 60s)');
      
      // 立即执行一次
      syncExistingCardsCaptions();
      
      // 然后每 60 秒轮询一次
      pollInterval = setInterval(() => {
        console.log('[PersonalSpace] 🔄 Polling: Checking for missing captions...');
        syncExistingCardsCaptions();
      }, 60000); // 每 60 秒检查一次
    }, 30000);
    
    // 清理函数
    return () => {
      clearTimeout(initialDelay);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [sessions, isSessionsLoading, syncExistingCardsCaptions]);

  // 🆕 补充 session 图片的 caption 和 tags
  const enrichSessionImages = useCallback(async () => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
    if (!eagleStorage || !eagleStorage.enrichSessionImages) {
      console.warn('[Eagle Storage] ⚠️ enrichSessionImages not available');
      return;
    }

    console.log('[Eagle Storage] 🔍 Starting session images caption/tags enrichment...');
    
    try {
      const result = await eagleStorage.enrichSessionImages({
        onProgress: (current, total, enriched, failed, skipped) => {
          if (current % 10 === 0 || current === total) {
            console.log(`[Eagle Storage] 📊 Enrichment progress: ${current}/${total} (${enriched} enriched, ${failed} failed, ${skipped} skipped)`);
          }
        },
        batchSize: 5,
        maxItems: 50, // 最多处理 50 个
      });
      
      if (result && !result.error) {
        console.log('[Eagle Storage] ✅ Enrichment complete:', result);
      } else if (result && result.error) {
        console.warn('[Eagle Storage] ⚠️ Enrichment error:', result.error);
      }
    } catch (error) {
      console.error('[Eagle Storage] ❌ Enrichment failed:', error);
    }
  }, [sessions, isSessionsLoading]);

  // 🆕 从 vectordb 补充 session 中卡片的 caption 和 tags（延迟执行）
  useEffect(() => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    // 延迟 8 秒执行，避免与 enrichSessionImages 冲突
    const timer = setTimeout(() => {
      const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
      if (!eagleStorage || !eagleStorage.enrichSessionImagesFromVectordb) {
        console.warn('[PersonalSpace] ⚠️ enrichSessionImagesFromVectordb not available');
        return;
      }

      (async () => {
        try {
          console.log('[PersonalSpace] 🚀 Starting vectordb enrichment...');
          const result = await eagleStorage.enrichSessionImagesFromVectordb({
            maxItems: 50,
            onProgress: (processed, total, updated, skipped) => {
              if (processed % 10 === 0 || processed === total) {
                console.log(`[PersonalSpace] 📊 [VECTORDB ENRICH] Progress: ${processed}/${total} (${updated} updated, ${skipped} skipped)`);
              }
            },
          });
          console.log('[PersonalSpace] ✅ Vectordb enrichment complete:', result);
        } catch (error) {
          console.error('[PersonalSpace] ❌ Vectordb enrichment failed:', error);
        }
      })();
    }, 8000);
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading]);

  // 🆕 监听新卡片收录，批量更新老卡片
  useEffect(() => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
    if (!eagleStorage || !eagleStorage.batchUpdateOldCardsFromVectordb) {
      return;
    }

    // 延迟 10 秒执行，确保新卡片已经保存完成
    const timer = setTimeout(() => {
      (async () => {
        try {
          // 收集所有当前卡片的 URL（作为排除列表，避免重复查询新卡片）
          const allCurrentUrls = [];
          sessions.forEach(session => {
            if (session && Array.isArray(session.opengraphData)) {
              session.opengraphData.forEach(item => {
                // ✅ 修复：优先使用 original_image_url（图片 URL），而不是 url（可能是页面 URL）
                const url = item.original_image_url || item.url || item.image || '';
                if (url && !url.startsWith('eagle://') && !url.startsWith('data:')) {
                  allCurrentUrls.push(url);
                }
              });
            }
          });

          console.log('[PersonalSpace] 🚀 Starting batch update for old cards...');
          console.log('[PersonalSpace] 📋 Current cards count:', allCurrentUrls.length);
          
          // 🆕 输出所有卡片的当前 caption 状态
          console.log('[PersonalSpace] 📝 Current cards caption status:');
          sessions.forEach((session, sIdx) => {
            if (session && Array.isArray(session.opengraphData)) {
              session.opengraphData.forEach((item, iIdx) => {
                // ✅ 对齐：日志显示使用 url（页面 URL）更清晰，但查询时使用 original_image_url
                const displayUrl = item.url || item.original_image_url || item.image || '';
                const queryUrl = item.original_image_url || item.url || item.image || '';
                const isPinterest = displayUrl.includes('pinterest.com') || displayUrl.includes('pinimg.com');
                const hasCaption = item.image_caption && item.image_caption.trim() && 
                                 !item.image_caption.includes('主要颜色:') &&
                                 item.image_caption.length > 20;
                const hasTags = item.style_tags && Array.isArray(item.style_tags) && item.style_tags.length > 0;
                
                console.log(`[PersonalSpace]   Card [${sIdx}-${iIdx}]:`, {
                  url: displayUrl.substring(0, 60),
                  queryUrl: queryUrl.substring(0, 60),
                  isPinterest,
                  hasCaption,
                  caption: hasCaption ? item.image_caption.substring(0, 50) : 'NO CAPTION',
                  hasTags,
                  tags: hasTags ? item.style_tags.slice(0, 3) : [],
                });
              });
            }
          });
          
          const result = await eagleStorage.batchUpdateOldCardsFromVectordb({
            excludeUrls: allCurrentUrls, // 排除所有当前卡片（只更新真正缺少 caption/tags 的老卡片）
            batchSize: 20,
            onProgress: (processed, total, updated) => {
              if (processed % 20 === 0 || processed === total) {
                console.log(`[PersonalSpace] 📊 [BATCH UPDATE] Progress: ${processed}/${total} (${updated} updated)`);
              }
            },
          });
          console.log('[PersonalSpace] ✅ Batch update complete:', result);
          
          // 🆕 更新后再次输出所有卡片的 caption 状态
          console.log('[PersonalSpace] 📝 After batch update, cards caption status:');
          const updatedSessions = await chrome.storage.local.get(['sessions']);
          const updatedSessionsData = updatedSessions.sessions || [];
          updatedSessionsData.forEach((session, sIdx) => {
            if (session && Array.isArray(session.opengraphData)) {
              session.opengraphData.forEach((item, iIdx) => {
                // ✅ 对齐：日志显示使用 url（页面 URL）更清晰，但查询时使用 original_image_url
                const displayUrl = item.url || item.original_image_url || item.image || '';
                const queryUrl = item.original_image_url || item.url || item.image || '';
                const isPinterest = displayUrl.includes('pinterest.com') || displayUrl.includes('pinimg.com');
                const hasCaption = item.image_caption && item.image_caption.trim() && 
                                 !item.image_caption.includes('主要颜色:') &&
                                 item.image_caption.length > 20;
                const hasTags = item.style_tags && Array.isArray(item.style_tags) && item.style_tags.length > 0;
                
                console.log(`[PersonalSpace]   Card [${sIdx}-${iIdx}]:`, {
                  url: displayUrl.substring(0, 60),
                  queryUrl: queryUrl.substring(0, 60),
                  isPinterest,
                  hasCaption,
                  caption: hasCaption ? item.image_caption.substring(0, 50) : 'NO CAPTION',
                  hasTags,
                  tags: hasTags ? item.style_tags.slice(0, 3) : [],
                });
              });
            }
          });
        } catch (error) {
          console.error('[PersonalSpace] ❌ Batch update failed:', error);
        }
      })();
    }, 10000); // 延迟 10 秒执行
    
    return () => clearTimeout(timer);
  }, [sessions, isSessionsLoading]);

  // 🆕 监听 Pinterest 卡片标题更新事件（实时更新 UI）
  useEffect(() => {
    const handlePinterestTitleUpdate = async (event) => {
      const { imageUrl, caption } = event.detail || {};
      if (!imageUrl || !caption) return;
      
      console.log('[PersonalSpace] 🎨 Received Pinterest title update:', { imageUrl: imageUrl.substring(0, 50), caption: caption.substring(0, 50) });
      
      // 重新加载 sessions 以获取最新数据（chrome.storage.local 已更新）
      try {
        const storageResult = await chrome.storage.local.get(['sessions']);
        const updatedSessions = storageResult.sessions || [];
        
        if (Array.isArray(updatedSessions) && updatedSessions.length > 0) {
          // 找到更新的卡片并触发 UI 更新
          const safeSessions = Array.isArray(sessions) ? sessions : [];
          updatedSessions.forEach((updatedSession, idx) => {
            const currentSession = safeSessions[idx];
            if (!currentSession || currentSession.id !== updatedSession.id) return;
            
            // 检查是否有卡片被更新
            const hasUpdate = updatedSession.opengraphData?.some((item, itemIdx) => {
              const currentItem = currentSession.opengraphData?.[itemIdx];
              return currentItem && item.title !== currentItem.title;
            });
            
            if (hasUpdate) {
              // 更新 session（这会触发 UI 重新渲染）
              updateSession(updatedSession.id, { opengraphData: updatedSession.opengraphData });
              console.log('[PersonalSpace] ✅ Pinterest card title updated in UI');
            }
          });
        }
      } catch (error) {
        console.warn('[PersonalSpace] ⚠️ Failed to update Pinterest card title in UI:', error);
      }
    };
    
    window.addEventListener('pinterest-card-title-updated', handlePinterestTitleUpdate);
    
    return () => {
      window.removeEventListener('pinterest-card-title-updated', handlePinterestTitleUpdate);
    };
  }, [sessions, updateSession]);

  // 🆕 监听 Caption 更新（方案 C：混合方案 - WebSocket 推送完整数据 + 批量拉取兜底）
  useEffect(() => {
    // ✅ URL 规范化函数（与后端保持一致）
    const normalizeUrl = (url) => {
      if (!url) return url;
      try {
        const urlObj = new URL(url);
        // 移除查询参数、锚点、尾随斜杠
        urlObj.search = '';
        urlObj.hash = '';
        let path = urlObj.pathname;
        // 移除尾随斜杠（但保留根路径的斜杠）
        if (path.length > 1 && path.endsWith('/')) {
          path = path.slice(0, -1);
        }
        urlObj.pathname = path;
        return urlObj.toString();
      } catch (e) {
        // 如果 URL 解析失败，尝试简单处理
        let normalized = url.split('?')[0].split('#')[0];
        if (normalized.length > 1 && normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }
        return normalized;
      }
    };
    
    const pendingUrls = new Set();
    let fetchTimer = null;

    const handleCaptionReady = async (message) => {
      if (message.action === 'caption-ready') {
        const payload = message.payload || {};
        const { url, image_caption, dominant_colors, style_tags, object_tags } = payload;
        
        if (!url) {
          console.warn('[PersonalSpace] ⚠️ Caption ready message missing URL');
          return;
        }
        
        console.log('[PersonalSpace] 📨 Received caption-ready notification:', {
          url: url.substring(0, 50),
          hasCaption: !!image_caption,
          hasTags: !!(style_tags?.length || object_tags?.length),
          hasColors: !!(dominant_colors?.length)
        });
        
        // ✅ 方案 C 步骤 1：如果 WebSocket 消息包含完整数据，直接更新（优先）
        if (image_caption || style_tags?.length > 0 || object_tags?.length > 0 || dominant_colors?.length > 0) {
          const safeSessions = Array.isArray(sessions) ? sessions : [];
          let updated = false;
          
          // ✅ 规范化 WebSocket 传来的 URL
          const normalizedUrl = normalizeUrl(url).toLowerCase();
          
          for (const session of safeSessions) {
            if (!session?.opengraphData) continue;
            
            // ✅ 修复：同时匹配 url 和 original_image_url，并规范化比较
            const idx = session.opengraphData.findIndex(item => {
              const itemUrl = normalizeUrl(item?.url || '').toLowerCase();
              const itemImageUrl = normalizeUrl(item?.original_image_url || '').toLowerCase();
              return itemUrl === normalizedUrl || itemImageUrl === normalizedUrl;
            });
            
            if (idx >= 0) {
              const updatedData = [...session.opengraphData];
              updatedData[idx] = {
                ...updatedData[idx],
                image_caption: image_caption || updatedData[idx].image_caption,
                dominant_colors: dominant_colors || updatedData[idx].dominant_colors || [],
                style_tags: style_tags || updatedData[idx].style_tags || [],
                object_tags: object_tags || updatedData[idx].object_tags || [],
              };
              updateSession(session.id, { opengraphData: updatedData });
              updated = true;
              
              // ✅ 同时更新 IndexedDB
              const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
              if (eagleStorage && eagleStorage.loadImage && eagleStorage.updateImageCaption) {
                try {
                  const matchedItem = session.opengraphData[idx];
                  const imageUrl = matchedItem.original_image_url || matchedItem.url || matchedItem.image;
                  if (imageUrl && !imageUrl.startsWith('eagle://') && !imageUrl.startsWith('data:')) {
                    const imageData = await eagleStorage.loadImage(imageUrl);
                    if (imageData && imageData.hash) {
                      await eagleStorage.updateImageCaption(
                        imageData.hash,
                        image_caption,
                        style_tags || [],
                        object_tags || [],
                        dominant_colors || []
                      );
                      console.log('[PersonalSpace] ✅ Updated IndexedDB via WebSocket:', imageUrl.substring(0, 50));
                    }
                  }
                } catch (e) {
                  console.warn('[PersonalSpace] ⚠️ Failed to update IndexedDB via WebSocket:', e);
                }
              }
              
              console.log('[PersonalSpace] ✅ Caption updated via WebSocket (real-time):', url.substring(0, 50));
              break;
            }
          }
          
          // 如果成功更新，不需要批量拉取
          if (updated) return;
        }
        
        // ✅ 方案 C 步骤 2：如果 WebSocket 数据不完整或更新失败，累积到待拉取列表（兜底）
        pendingUrls.add(url);
        
        // 防抖：500ms 内的多个通知合并成一次批量请求
        clearTimeout(fetchTimer);
        fetchTimer = setTimeout(async () => {
          if (pendingUrls.size > 0) {
            // ✅ 规范化 URL（与后端保持一致）
            const urls = Array.from(pendingUrls).map(u => normalizeUrl(u)).filter(Boolean);
            pendingUrls.clear();
            
            console.log('[PersonalSpace] 📦 Batch fetching captions (fallback) for', urls.length, 'URLs');
            
            // 批量获取 caption（兜底机制）
            try {
              const apiUrl = window.__TAB_CLEANER_API_CONFIG?.getBaseUrlSync?.() || 'https://tab-cleaner-mvp-app-production.up.railway.app';
              const userId = await chrome.storage.local.get(['user_id']).then(r => r.user_id || 'anonymous');
              
              const response = await fetch(`${apiUrl}/api/v1/search/batch-captions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-User-ID': userId,
                },
                body: JSON.stringify({ urls }),
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result?.success !== false && result?.results) {
                  // 更新 sessions 数据
                  const safeSessions = Array.isArray(sessions) ? sessions : [];
                  const sessionUpdates = new Map(); // sessionId -> updated og list
                  
                  for (const captionResult of result.results) {
                    // ✅ 统一使用 image_caption（与数据库字段名一致）
                    // 兼容处理：如果 API 返回 quickCaption，也支持（向后兼容）
                    const { url: resultUrl, image_caption: resultImageCaption, quickCaption, style_tags, object_tags, dominant_colors } = captionResult;
                    const image_caption = resultImageCaption || quickCaption || ''; // 优先使用 image_caption
                    
                    for (const session of safeSessions) {
                      if (!session?.opengraphData) continue;
                      
                      // ✅ 修复：同时匹配 url 和 original_image_url，并规范化比较
                      const idx = session.opengraphData.findIndex(item => {
                        const itemUrl = normalizeUrl(item?.url || '').toLowerCase();
                        const itemImageUrl = normalizeUrl(item?.original_image_url || '').toLowerCase();
                        const resultUrlLower = normalizeUrl(resultUrl || '').toLowerCase();
                        return itemUrl === resultUrlLower || itemImageUrl === resultUrlLower;
                      });
                      if (idx >= 0) {
                        if (!sessionUpdates.has(session.id)) {
                          sessionUpdates.set(session.id, [...session.opengraphData]);
                        }
                        const ogList = sessionUpdates.get(session.id);
                        ogList[idx] = {
                          ...ogList[idx],
                          image_caption: image_caption || ogList[idx].image_caption,
                          dominant_colors: dominant_colors || ogList[idx].dominant_colors || [],
                          style_tags: style_tags || ogList[idx].style_tags || [],
                          object_tags: object_tags || ogList[idx].object_tags || [],
                        };
                      }
                    }
                  }
                  
                  // ✅ 同时更新 IndexedDB（批量拉取兜底机制）
                  const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
                  if (eagleStorage && eagleStorage.loadImage && eagleStorage.updateImageCaption) {
                    for (const captionResult of result.results) {
                      const { url: resultUrl, image_caption: resultImageCaption, quickCaption, style_tags, object_tags, dominant_colors } = captionResult;
                      const image_caption = resultImageCaption || quickCaption || '';
                      if (!image_caption) continue;
                      
                      try {
                        // 找到匹配的 session item 获取 imageUrl
                        for (const session of safeSessions) {
                          if (!session?.opengraphData) continue;
                          const matchedItem = session.opengraphData.find(item => {
                            const itemUrl = normalizeUrl(item?.url || '').toLowerCase();
                            const itemImageUrl = normalizeUrl(item?.original_image_url || '').toLowerCase();
                            const resultUrlLower = normalizeUrl(resultUrl || '').toLowerCase();
                            return itemUrl === resultUrlLower || itemImageUrl === resultUrlLower;
                          });
                          
                          if (matchedItem) {
                            const imageUrl = matchedItem.original_image_url || matchedItem.url || matchedItem.image;
                            if (imageUrl && !imageUrl.startsWith('eagle://') && !imageUrl.startsWith('data:')) {
                              const imageData = await eagleStorage.loadImage(imageUrl);
                              if (imageData && imageData.hash) {
                                await eagleStorage.updateImageCaption(
                                  imageData.hash,
                                  image_caption,
                                  style_tags || [],
                                  object_tags || [],
                                  dominant_colors || []
                                );
                                break; // 找到匹配后退出
                              }
                            }
                          }
                        }
                      } catch (e) {
                        console.warn('[PersonalSpace] ⚠️ Failed to update IndexedDB (fallback):', e);
                      }
                    }
                  }
                  
                  // 批量更新 sessions
                  sessionUpdates.forEach((ogList, sessionId) => {
                    updateSession(sessionId, { opengraphData: ogList });
                  });
                  
                  if (sessionUpdates.size > 0) {
                    console.log('[PersonalSpace] ✅ Batch caption update complete (fallback):', sessionUpdates.size, 'sessions updated');
                  }
                }
              } else {
                console.warn('[PersonalSpace] ⚠️ Batch caption fetch failed:', response.status);
              }
            } catch (error) {
              console.error('[PersonalSpace] ❌ Batch caption fetch error:', error);
            }
          }
        }, 500); // 防抖延迟 500ms
      }
    };

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener(handleCaptionReady);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleCaptionReady);
      clearTimeout(fetchTimer);
    };
  }, [sessions, updateSession]);

  // Eagle Storage 迁移函数
  const migrateToEagleStorage = useCallback(async () => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    const eagleStorage = window.__TAB_CLEANER_EAGLE_STORAGE;
    if (!eagleStorage) {
      console.warn('[Eagle Storage] ⚠️ Eagle Storage not loaded, skipping migration');
      return;
    }

    console.log('[Eagle Storage] 🦅 Starting automatic migration...');
    
    try {
      // 收集所有需要迁移的卡片
      const allCards = [];
      const safeSessions = Array.isArray(sessions) ? sessions : [];
      
      safeSessions.forEach(session => {
        if (session?.opengraphData) {
          session.opengraphData.forEach(item => {
            // 只迁移远程 URL（不是 data: URL）
            if (item.image && 
                item.image.startsWith('http') && 
                !item.image.startsWith('data:')) {
              allCards.push({
                ...item,
                sessionId: session.id,
              });
            }
          });
        }
      });

      if (allCards.length === 0) {
        console.log('[Eagle Storage] ✅ No images to migrate');
        return;
      }

      console.log(`[Eagle Storage] 📊 Found ${allCards.length} images to migrate`);

      // 🆕 优化：不再批量迁移和 fetch
      // 新图片已经在 opengraph_local_v2.js 中保存到 IndexedDB 了
      // 旧图片如果还在用 URL，会在渲染时由 SessionCard 自动从 IndexedDB 加载
      console.log('[Eagle Storage] ℹ️ Migration skipped - new images are already in IndexedDB');
      console.log('[Eagle Storage] ℹ️ Old images will be loaded from IndexedDB on-demand during rendering');
      
      // 检查是否有需要从 IndexedDB 加载的图片（只检查，不 fetch）
      let foundInIndexedDB = 0;
      for (const card of allCards) {
        if (card.image && card.image.startsWith('http') && !card.image.startsWith('data:')) {
          const indexedDbData = await eagleStorage.loadImage(card.image);
          if (indexedDbData && indexedDbData.dataUrl) {
            foundInIndexedDB++;
            // 更新卡片数据（使用 IndexedDB 中的数据）
            card.image = indexedDbData.dataUrl;
            if (indexedDbData.colors && indexedDbData.colors.length > 0) {
              card.colors = indexedDbData.colors.map(c => typeof c === 'string' ? c : c.hex);
            }
          }
        }
      }
      
      console.log(`[Eagle Storage] ✅ Found ${foundInIndexedDB} images in IndexedDB (no fetch needed)`);

      // 更新 sessions（使用 IndexedDB 中的数据）
      if (foundInIndexedDB > 0) {
        safeSessions.forEach(session => {
          const updated = session.opengraphData.map(item => {
            const migratedCard = allCards.find(c => 
              (c.id === item.id || c.url === item.url) && 
              c.sessionId === session.id &&
              c.image !== item.image // 图片已更新
            );
            if (migratedCard && migratedCard.image && migratedCard.image.startsWith('data:')) {
              return {
                ...item,
                image: migratedCard.image, // 使用 IndexedDB 中的 dataUrl
                dominant_colors: migratedCard.colors || item.dominant_colors,
              };
            }
            return item;
          });
          
          updateSession(session.id, { opengraphData: updated });
        });
      }
    } catch (error) {
      console.error('[Eagle Storage] ❌ Migration failed:', error);
    }
  }, [sessions, isSessionsLoading, updateSession]);

  // 后台颜色分析函数
  const analyzeColorsInBackground = useCallback(async () => {
    if (isSessionsLoading || !sessions || sessions.length === 0) return;
    
    const analyzer = window.__TAB_CLEANER_PS_COLOR_ANALYZER;
    if (!analyzer) {
      console.warn('[PS Color Analyzer] ⚠️ Color analyzer not loaded, skipping background analysis');
      return;
    }

    console.log('[PS Color Analyzer] 🎨 Starting background color analysis...');
    
    try {
      const result = await analyzer.analyzeSessions(sessions, {
        onProgress: (current, total) => {
          if (current % 10 === 0 || current === total) {
            console.log(`[PS Color Analyzer] 🎨 Progress: ${current}/${total}`);
          }
        },
        onCardComplete: (card, analyzed, total) => {
          // 可选：显示进度
        },
        onUpdateSession: (sessionId, updates) => {
          // 更新 session 数据
          updateSession(sessionId, updates);
        },
        forceReanalyze: false, // 不强制重新分析已有颜色的卡片
      });
      
      console.log('[PS Color Analyzer] ✅ Color analysis complete:', result);
    } catch (error) {
      console.error('[PS Color Analyzer] ❌ Color analysis failed:', error);
    }
  }, [sessions, isSessionsLoading, updateSession]);

  // 搜索相关状态（使用 hook）
  // 注意：对于 masonry 视图，搜索应该基于所有 sessions 的数据
  // 对于 radial 视图，搜索基于当前 session 的数据
  // ✅ 修复：添加安全检查，防止 sessions 为 null/undefined
  // ✅ 关键修复：使用 useMemo 确保计算只在 sessions 变化时执行，避免在初始化时访问 null
  const allOpengraphData = useMemo(() => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    return safeSessions.flatMap(s => {
      if (!s || typeof s !== 'object') return [];
      const ogData = s.opengraphData;
      return Array.isArray(ogData) ? ogData : [];
    });
  }, [sessions]);
  const currentSession = getCurrentSession();
  const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
  
  // ✅ 修复问题1：根据视图模式选择搜索数据源，确保两个视图使用相同的数据源
  // 对于masonry视图，使用所有sessions的数据
  // 对于radial视图，也使用所有sessions的数据（但显示时只显示当前session）
  // 这样确保搜索范围一致
  // 🆕 增强：为每个 item 添加可搜索文本字段（包含 caption 和 tags）
  const searchDataSource = useMemo(() => {
    const allData = Array.isArray(allOpengraphData) ? allOpengraphData : [];
    
    // ✅ 确保每个 item 都有搜索所需的字段
    return allData.map(item => ({
      ...item,
      // 搜索字段：合并 title, description, caption, tags 为可搜索文本
      searchableText: [
        item.title || '',
        item.description || '',
        item.image_caption || '',
        ...(Array.isArray(item.style_tags) ? item.style_tags : []),
        ...(Array.isArray(item.object_tags) ? item.object_tags : []),
      ].filter(Boolean).join(' ').toLowerCase(),
    }));
  }, [allOpengraphData]);
  
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    // ✅ 已移除：opengraphWithEmbeddings - 不再需要
    // opengraphWithEmbeddings,
    searchResults,
    performSearch,
    clearSearch,
  } = useSearch(searchDataSource);

  // 🆕 图片加载时本地提色回调（由 SessionCard 触发）
  const handleColorsExtracted = useCallback((cardId, colors) => {
    if (!cardId || !Array.isArray(colors) || colors.length === 0) return;
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    for (const session of safeSessions) {
      if (!session?.opengraphData) continue;
      const idx = session.opengraphData.findIndex(item => {
        const itemId = item?.id || item?.tab_id || item?.url;
        return itemId === cardId;
      });
      if (idx >= 0) {
        const updated = [...session.opengraphData];
        updated[idx] = { ...updated[idx], dominant_colors: colors };
        updateSession(session.id, { opengraphData: updated });
        break;
      }
    }
  }, [sessions, updateSession]);
  
  // 🆕 图片加载时本地缩略图回调（由 SessionCard 触发）
  // 🆕 优化：生成缩略图后自动发送给后端生成 caption
  const handleThumbnailGenerated = useCallback((cardId, thumbnail) => {
    if (!cardId || !thumbnail) return;
    if (process.env.NODE_ENV === 'development') {
      console.log('[PersonalSpace] 收到缩略图', cardId, `${(thumbnail.length / 1024).toFixed(1)} KB`);
    }
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    for (const session of safeSessions) {
      if (!session?.opengraphData) continue;
      const idx = session.opengraphData.findIndex(item => {
        const itemId = item?.id || item?.tab_id || item?.url;
        return itemId === cardId;
      });
      if (idx >= 0) {
        const updated = [...session.opengraphData];
        updated[idx] = { ...updated[idx], thumbnail };
        updateSession(session.id, { opengraphData: updated });
        
        // 🆕 异步发送缩略图到后端生成 caption（不阻塞）
        const item = updated[idx];
        if (item && item.url && thumbnail) {
          (async () => {
            try {
              // 使用 embedding API，它会自动触发 caption 生成
              const apiUrl = window.__TAB_CLEANER_API_CONFIG?.getBaseUrlSync?.() || 'https://tab-cleaner-mvp-app-production.up.railway.app';
              const userId = await chrome.storage.local.get(['user_id']).then(r => r.user_id || 'anonymous');
              
              // 发送到后端 embedding API（会自动生成 caption）
              const embeddingUrl = `${apiUrl}/api/v1/search/embedding`;
              const response = await fetch(embeddingUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-User-ID': userId,
                },
                body: JSON.stringify({
                  opengraph_items: [{
                    url: item.url,
                    image: thumbnail, // 使用缩略图作为 image
                    title: item.title,
                    description: item.description,
                  }],
                }),
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result.data && result.data.length > 0) {
                  const enrichedItem = result.data[0];
                  // 更新 session 中的 caption 和其他字段
                  const storageResult = await chrome.storage.local.get(['sessions']);
                  const sessions = storageResult.sessions || [];
                  const sessionIndex = sessions.findIndex(s => s.id === session.id);
                  
                  if (sessionIndex !== -1) {
                    const session = sessions[sessionIndex];
                    const itemIndex = session.opengraphData.findIndex(og => 
                      (og.id === item.id || og.url === item.url)
                    );
                    
                    if (itemIndex >= 0) {
                      const updatedData = [...session.opengraphData];
                      updatedData[itemIndex] = {
                        ...updatedData[itemIndex],
                        image_caption: enrichedItem.image_caption || updatedData[itemIndex].image_caption,
                        caption_embedding: enrichedItem.caption_embedding || updatedData[itemIndex].caption_embedding,
                        style_tags: enrichedItem.style_tags || updatedData[itemIndex].style_tags,
                        object_tags: enrichedItem.object_tags || updatedData[itemIndex].object_tags,
                        text_embedding: enrichedItem.text_embedding || updatedData[itemIndex].text_embedding,
                        image_embedding: enrichedItem.image_embedding || updatedData[itemIndex].image_embedding,
                      };
                      
                      sessions[sessionIndex] = {
                        ...session,
                        opengraphData: updatedData,
                      };
                      
                      await chrome.storage.local.set({ sessions });
                      console.log('[PersonalSpace] ✅ Caption and embeddings generated and saved:', item.url.substring(0, 50));
                    }
                  }
                }
              } else {
                console.warn('[PersonalSpace] ⚠️ Caption/embedding generation failed:', response.status);
              }
            } catch (error) {
              console.warn('[PersonalSpace] ⚠️ Caption generation error:', error);
            }
          })();
        }
        
        break;
      }
    }
  }, [sessions, updateSession]);
  
  // Radial 视图使用的数据（当前 session）
  // 如果当前 session 有数据，使用 session 数据；否则使用旧的 opengraphData（向后兼容）
  // ✅ 修复：添加安全检查，确保 opengraphData 是数组
  // ✅ 关键修复：使用 useMemo 确保计算只在依赖变化时执行
  // ✅ 修复问题3：Radial 视图使用的数据（当前 session），确保与 Masonry 视图对齐
  const radialOpengraphData = useMemo(() => {
    if (viewMode === 'radial') {
      // ✅ 修复：确保 radial 视图使用与 masonry 视图相同的数据源（当前 session）
      if (Array.isArray(currentSessionOpengraphData) && currentSessionOpengraphData.length > 0) {
        return currentSessionOpengraphData;
      }
      // 如果没有当前 session 数据，返回空数组（不向后兼容，确保数据对齐）
      return [];
    }
    return Array.isArray(opengraphData) ? opengraphData : [];
  }, [viewMode, currentSessionOpengraphData, opengraphData]);

  // 当切换到 radial 视图或切换 session 时，同步更新 clusters 和 opengraphData
  useEffect(() => {
    // ✅ 修复：添加安全检查，确保 radialOpengraphData 是数组
    if (viewMode === 'radial' && Array.isArray(radialOpengraphData) && radialOpengraphData.length > 0) {
      // 计算放射状布局位置
      const positionedOG = calculateRadialLayout(radialOpengraphData, {
        centerX: 720,
        centerY: 512,
        baseRadius: UI_CONFIG.radial.baseRadius,
        radiusGap: UI_CONFIG.radial.radiusGap,
        minRadiusGap: UI_CONFIG.radial.minRadiusGap,
        maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
        autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
      }).map((og, index) => ({
        ...og,
        id: og.id || `og-${index}-${Date.now()}`,
      }));
      
      // 调试：检查计算出的位置
      console.log('[Radial View] Calculated positions:', positionedOG.slice(0, 3).map(og => ({
        id: og.id,
        x: og.x,
        y: og.y,
        title: og.title?.substring(0, 20)
      })));
      
      // 确保每个 item 都有 x, y 坐标
      const positionedOGWithCoords = positionedOG.map(og => {
        if (og.x === undefined || og.y === undefined) {
          console.warn('[Radial View] Missing coordinates for:', og.id, 'x:', og.x, 'y:', og.y);
        }
        return {
          ...og,
          x: og.x ?? 720,
          y: og.y ?? 512,
        };
      });
      
      // 调试：检查最终数据
      console.log('[Radial View] Final opengraphData:', positionedOGWithCoords.slice(0, 3).map(og => ({
        id: og.id,
        x: og.x,
        y: og.y,
      })));
      
      // 更新 opengraphData（用于 Radial 视图）
      setOpengraphData(positionedOGWithCoords);
      setShowOriginalImages(false);
      
      // 更新 clusters：如果有现有聚类，保留；否则创建默认聚类
      setClusters(prev => {
        // ✅ 修复：确保 prev 是数组
        const safePrev = Array.isArray(prev) ? prev : [];
        if (safePrev.length === 0) {
          // 创建默认聚类包含所有卡片（items 需要包含 x, y 坐标，供 Spring 动画使用）
          return [{
            id: 'default-cluster',
            name: '未分类',
            type: 'default',
          items: positionedOGWithCoords.map(og => ({
            ...og,
            // 确保 items 中包含 x, y 坐标
            x: og.x,
            y: og.y,
          })),
            center: { x: 720, y: 512 },
            radius: 200,
            item_count: positionedOG.length,
          }];
        } else {
          // 更新现有聚类中的 items，确保数据同步
          // 重要：需要从 positionedOG 中获取最新的 x, y 坐标
          // 同时，对于不在现有聚类中的新 items，需要添加到默认聚类或创建新聚类
          const existingItemIds = new Set(
            safePrev.flatMap(c => (Array.isArray(c.items) ? c.items : []).map(item => item && item.id ? item.id : null).filter(Boolean))
          );
          const newItems = positionedOGWithCoords.filter(og => !existingItemIds.has(og.id));
          
          return safePrev.map(cluster => {
            // ✅ 修复：添加安全检查，确保 cluster.items 是数组
            const clusterItems = Array.isArray(cluster.items) ? cluster.items : [];
            const updatedItems = clusterItems
              .filter(item => positionedOGWithCoords.some(og => og.id === item.id))
              .map(item => {
                // 从 positionedOGWithCoords 中获取最新的位置信息
                const latestOG = positionedOGWithCoords.find(og => og.id === item.id);
                if (latestOG) {
                  return {
                    ...item,
                    x: latestOG.x,
                    y: latestOG.y,
                    width: latestOG.width,
                    height: latestOG.height,
                  };
                }
                return item;
              });
            
            return {
              ...cluster,
              items: updatedItems,
              item_count: updatedItems.length,
            };
          })
          .filter(cluster => cluster.item_count > 0)
          .concat(newItems.length > 0 ? [{
            id: 'default-cluster',
            name: '未分类',
            type: 'default',
            items: newItems.map(og => ({
              ...og,
              x: og.x,
              y: og.y,
            })),
            center: { x: 720, y: 512 },
            radius: 200,
            item_count: newItems.length,
          }] : []);
        }
      });
    } else if (viewMode === 'radial' && (!Array.isArray(radialOpengraphData) || radialOpengraphData.length === 0)) {
      // 如果切换到 radial 视图但没有数据，清空 clusters
      setClusters([]);
      setOpengraphData([]);
    }
  }, [viewMode, currentSessionId, radialOpengraphData]);


  // 从 storage 加载数据（兼容旧数据，但优先使用 sessions）
  // 当 sessions 加载完成后，检查是否需要迁移旧数据
  useEffect(() => {
    // 等待 sessions 加载完成
    if (isSessionsLoading) {
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['opengraphData', 'currentSessionId', 'recent_opengraph'], (result) => {
        try {
          // ✅ 修复：添加安全检查，确保 sessions 是数组
          const safeSessions = Array.isArray(sessions) ? sessions : [];
          // 如果有 recent_opengraph 但没有 sessions，尝试使用它
          if (safeSessions.length === 0 && result.recent_opengraph && Array.isArray(result.recent_opengraph) && result.recent_opengraph.length > 0) {
            console.log('[PersonalSpace] Found recent_opengraph, creating session from it...', result.recent_opengraph.length, 'items');
            const validOG = result.recent_opengraph.filter(item => 
              item && 
              typeof item === 'object' && 
              (item.success || item.is_doc_card) &&  
              (item.image || (item.title && item.title !== item.url))
            );
            
            if (validOG.length > 0) {
              const newSession = createSession(validOG);
              console.log('[PersonalSpace] Created session from recent_opengraph:', newSession);
              
              const positionedOG = calculateRadialLayout(validOG, {
                centerX: 720,
                centerY: 512,
                baseRadius: UI_CONFIG.radial.baseRadius,
                radiusGap: UI_CONFIG.radial.radiusGap,
                minRadiusGap: UI_CONFIG.radial.minRadiusGap,
                maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
                autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
              }).map((og, index) => ({
                ...og,
                id: og.id || `og-${index}-${Date.now()}`,
              }));
              setOpengraphData(positionedOG);
              setShowOriginalImages(false);
              
              setTimeout(() => {
                setClusters(prev => {
                  // ✅ 修复：确保 prev 是数组
                  const safePrev = Array.isArray(prev) ? prev : [];
                  if (safePrev.length === 0) {
                    return [{
                      id: 'default-cluster',
                      name: '未分类',
                      type: 'default',
                      items: positionedOG,
                      center: { x: 720, y: 512 },
                      radius: 200,
                      item_count: positionedOG.length,
                    }];
                  }
                  return safePrev;
                });
              }, 100);
            }
          }
          
          // 如果有旧的 opengraphData 但没有 sessions，迁移到第一个 session
          if (safeSessions.length === 0 && result.opengraphData) {
            const ogData = Array.isArray(result.opengraphData) 
              ? result.opengraphData 
              : (result.opengraphData.data || []);
            
            if (Array.isArray(ogData) && ogData.length > 0) {
              console.log('[PersonalSpace] Migrating old opengraphData to session...', ogData.length, 'items');
              
              // 过滤掉失败的数据
              const validOG = ogData.filter(item => 
                item && 
                typeof item === 'object' && 
                (item.success || item.is_doc_card) &&  
                (item.image || (item.title && item.title !== item.url))
              );
              
              if (validOG.length > 0) {
                // 创建第一个 session 包含旧数据
                const newSession = createSession(validOG);
                console.log('[PersonalSpace] Created session from old data:', newSession);
                
                // 同时设置 opengraphData 用于 Radial 视图兼容
                const positionedOG = calculateRadialLayout(validOG, {
                  centerX: 720,
                  centerY: 512,
                  baseRadius: UI_CONFIG.radial.baseRadius,
                  radiusGap: UI_CONFIG.radial.radiusGap,
                  minRadiusGap: UI_CONFIG.radial.minRadiusGap,
                  maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
                  autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
                }).map((og, index) => ({
                  ...og,
                  id: og.id || `og-${index}-${Date.now()}`,
                }));
                setOpengraphData(positionedOG);
                setShowOriginalImages(false);
                
                // 创建默认聚类
                setTimeout(() => {
                  setClusters(prev => {
                    // ✅ 修复：确保 prev 是数组
                    const safePrev = Array.isArray(prev) ? prev : [];
                    if (safePrev.length === 0) {
                      return [{
                        id: 'default-cluster',
                        name: '未分类',
                        type: 'default',
                        items: positionedOG,
                        center: { x: 720, y: 512 },
                        radius: 200,
                        item_count: positionedOG.length,
                      }];
                    }
                    return safePrev;
                  });
                }, 100);
              }
            }
          }
          
          // 设置当前 session（如果有）
          if (result.currentSessionId && safeSessions.length > 0) {
            const sessionExists = safeSessions.some(s => s && s.id === result.currentSessionId);
            if (sessionExists) {
              setCurrentSessionId(result.currentSessionId);
            }
          }
        } catch (error) {
          console.error('[PersonalSpace] Error loading OpenGraph data:', error);
        }
      });
    }
  }, [isSessionsLoading, sessions, createSession, setCurrentSessionId]); // ✅ 修复：使用 sessions 而不是 sessions.length，避免 null.length 错误

  // Spring 动画：更新卡片位置
  const updateCardPosition = useCallback((cardId, x, y) => {
    // 只有在启用 Spring 动画时才更新位置
    // 如果只有默认聚类，不应该更新位置（直接使用计算好的位置）
    // ✅ 修复：添加安全检查
    const safeClusters = Array.isArray(clusters) ? clusters : [];
    const shouldUpdate = viewMode === 'radial' && safeClusters.length > 0 && 
      !(safeClusters.length === 1 && safeClusters[0] && safeClusters[0].id === 'default-cluster' && safeClusters[0].type === 'default');
    
    if (!shouldUpdate) {
      // 禁用 Spring 动画时，不更新位置
      return;
    }
    
    // 更新 opengraphData 或 images 中对应卡片的位置
    if (showOriginalImages) {
      setImages(prev => Array.isArray(prev) ? prev.map(item => {
        if (item.id === cardId) {
          return { ...item, x, y };
        }
        return item;
      }) : []);
    } else {
      setOpengraphData(prev => Array.isArray(prev) ? prev.map(item => {
        if (item.id === cardId) {
          return { ...item, x, y };
        }
        return item;
      }) : []);
    }
  }, [showOriginalImages, viewMode, clusters]);

  // Spring 动画：更新聚类中心位置
  const updateClusterCenter = useCallback((clusterId, x, y) => {
    // 更新聚类状态
    setClusters(prev => {
      // ✅ 修复：确保 prev 是数组
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map(c => {
        if (c && c.id === clusterId) {
          return { ...c, center: { x, y } };
        }
        return c;
      });
    });
  }, []);

  // 使用 Spring 动画系统（每帧更新聚类圆心和卡片位置）
  // 注意：只有在 radial 视图且有聚类时才启用 Spring 动画
  // 如果没有聚类（只有默认聚类），直接使用计算好的位置，不需要 Spring 动画
  // ✅ 修复：添加安全检查
  const safeClusters = Array.isArray(clusters) ? clusters : [];
  const shouldUseSpringAnimation = viewMode === 'radial' && safeClusters.length > 0 && 
    !(safeClusters.length === 1 && safeClusters[0] && safeClusters[0].id === 'default-cluster' && safeClusters[0].type === 'default');
  
  useClusterSpringAnimation(
    shouldUseSpringAnimation ? safeClusters : [],
    updateCardPosition,
    updateClusterCenter
  );


  // 处理搜索输入变化（退格检测：输入为空时清空搜索）
  const handleSearchChange = useCallback((nextValue) => {
    // 更新搜索查询
    setSearchQuery(nextValue);
    
    const trimmedLength = nextValue.trim().length;
    const previousLength = previousQueryRef.current.trim().length;
    
    // 判断是删除字符
    const isDeleting = trimmedLength < previousLength;
    
    if (isDeleting && trimmedLength === 0) {
      // 删除所有字符（输入为空）：清空搜索，恢复原始布局
      clearSearch();
      // 恢复原始数据（清除相似度标记）
      if (viewMode === 'radial') {
        // Radial 视图：恢复原始布局
        const currentSession = getCurrentSession();
        const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
        if (currentSessionOpengraphData.length > 0) {
          // 清除相似度标记
          const cleanedData = currentSessionOpengraphData.map(item => ({
            ...item,
            similarity: undefined,
          }));
          const originalData = calculateRadialLayout(cleanedData, {
            centerX: 720,
            centerY: 512,
            baseRadius: UI_CONFIG.radial.baseRadius,
            radiusGap: UI_CONFIG.radial.radiusGap,
            minRadiusGap: UI_CONFIG.radial.minRadiusGap,
            maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
            autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
          });
          setOpengraphData(originalData);
        } else if (Array.isArray(opengraphData) && opengraphData.length > 0) {
          // 如果没有 session 数据，使用旧的 opengraphData
          const cleanedData = opengraphData.map(item => ({
            ...item,
            similarity: undefined,
          }));
          const originalData = calculateRadialLayout(cleanedData, {
            centerX: 720,
            centerY: 512,
            baseRadius: UI_CONFIG.radial.baseRadius,
            radiusGap: UI_CONFIG.radial.radiusGap,
            minRadiusGap: UI_CONFIG.radial.minRadiusGap,
            maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
            autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
          });
          setOpengraphData(originalData);
        }
      } else {
        // ✅ 修复问题2：Masonry 视图：清除所有 session 的相似度标记，恢复原始顺序
        const safeSessions = Array.isArray(sessions) ? sessions : [];
        safeSessions.forEach(session => {
          if (session && Array.isArray(session.opengraphData)) {
            const cleanedData = session.opengraphData.map(item => {
              const { similarity: _, ...rest } = item;
              return rest;
            });
            updateSession(session.id, { opengraphData: cleanedData });
          }
        });
      }
      setShowOriginalImages(true);
      console.log('[PersonalSpace] Search cleared, restored original layout and order');
    }
    
    // 更新之前的查询引用
    previousQueryRef.current = nextValue;
  }, [viewMode, clearSearch, calculateRadialLayout, getCurrentSession, setOpengraphData, setShowOriginalImages, opengraphData, sessions, updateSession]);

  // ✅ 提取公共函数：收集所有 sessions 中的 URL 和 tab_id
  const collectSessionUrlsAndTabIds = useCallback(() => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const allSessionUrls = new Set();
    const allSessionTabIds = new Set();
    
    safeSessions.forEach(session => {
      if (session && Array.isArray(session.opengraphData)) {
        session.opengraphData.forEach(item => {
          if (item.url) {
            allSessionUrls.add(item.url);
            try {
              const urlObj = new URL(item.url);
              const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/$/, '')}`;
              allSessionUrls.add(normalizedUrl);
            } catch (e) {
              // URL 解析失败，跳过
            }
          }
          if (item.tab_id) {
            allSessionTabIds.add(item.tab_id);
          }
        });
      }
    });
    
    return { allSessionUrls, allSessionTabIds };
  }, [sessions]);
  
  // ✅ 提取公共函数：过滤搜索结果，只保留在 sessions 中的结果
  const filterResultsBySessions = useCallback((results) => {
    const { allSessionUrls, allSessionTabIds } = collectSessionUrlsAndTabIds();
    
    return results.filter(result => {
      // 优先使用 tab_id 匹配
      if (result.tab_id && allSessionTabIds.has(result.tab_id)) {
        return true;
      }
      // 使用 URL 匹配
      if (result.url) {
        if (allSessionUrls.has(result.url)) {
          return true;
        }
        // 尝试规范化 URL 匹配
        try {
          const urlObj = new URL(result.url);
          const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/$/, '')}`;
          if (allSessionUrls.has(normalizedUrl)) {
            return true;
          }
        } catch (e) {
          // URL 解析失败，跳过
        }
      }
      return false;
    });
  }, [collectSessionUrlsAndTabIds]);

  // 执行搜索（使用 hook）- 仅在用户按 Enter 时触发
  const handleSearch = async () => {
    // ✅ 修复问题2：第二次搜索前，先清除之前的高亮
    if (viewMode === 'masonry') {
      const safeSessions = Array.isArray(sessions) ? sessions : [];
      safeSessions.forEach(session => {
        if (session && Array.isArray(session.opengraphData)) {
          const cleanedData = session.opengraphData.map(item => {
            const { similarity: _, ...rest } = item;
            return rest;
          });
          updateSession(session.id, { opengraphData: cleanedData });
        }
      });
    } else if (viewMode === 'radial') {
      // Radial 视图：清除之前的相似度标记
      const currentSession = getCurrentSession();
      const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
      if (currentSessionOpengraphData.length > 0) {
        const cleanedData = currentSessionOpengraphData.map(item => {
          const { similarity: _, ...rest } = item;
          return rest;
        });
        const originalData = calculateRadialLayout(cleanedData, {
          centerX: 720,
          centerY: 512,
          baseRadius: UI_CONFIG.radial.baseRadius,
          radiusGap: UI_CONFIG.radial.radiusGap,
          minRadiusGap: UI_CONFIG.radial.minRadiusGap,
          maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
          autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
        });
        setOpengraphData(originalData);
      }
    }
    
    // ✅ 修复问题4：收集 Personal Space 中的 URL 和 tab_id，传递给后端进行过滤
    const { allSessionUrls, allSessionTabIds } = collectSessionUrlsAndTabIds();
    const filterUrls = Array.from(allSessionUrls);
    const filterTabIds = Array.from(allSessionTabIds).map(id => String(id)); // 转换为字符串
    
    const results = await performSearch(searchQuery, calculateRadialLayout, filterUrls, filterTabIds);
    if (results && results.length > 0) {
      // ✅ 双重保险：前端也进行过滤（虽然后端已经过滤了）
      const filteredResults = filterResultsBySessions(results);
      
      console.log('[PersonalSpace] Search results filtered:', {
        originalCount: results.length,
        filteredCount: filteredResults.length,
        removedCount: results.length - filteredResults.length
      });
      
      if (viewMode === 'radial') {
        // ✅ 修复问题4：Radial 视图：只显示过滤后的结果，确保只显示 personal space 中的内容
        if (filteredResults.length > 0) {
          // 计算布局位置
          const positionedResults = calculateRadialLayout(filteredResults, {
            centerX: 720,
            centerY: 512,
            baseRadius: UI_CONFIG.radial.baseRadius,
            radiusGap: UI_CONFIG.radial.radiusGap,
            minRadiusGap: UI_CONFIG.radial.minRadiusGap,
            maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
            autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
          });
          setOpengraphData(positionedResults);
        } else {
          // 如果没有过滤后的结果，清空显示
          setOpengraphData([]);
        }
        setShowOriginalImages(false);
        console.log('[PersonalSpace] Search completed (radial),', filteredResults.length, 'filtered results (only from personal space)');
      } else {
        // Masonry 视图：更新 sessions 中每个 item 的 similarity 字段
        // 使用过滤后的结果（只包含 sessions 中的项目）
        const safeSessions = Array.isArray(sessions) ? sessions : [];
        
        // ✅ 改进：创建多个匹配键的 map，支持多种匹配方式
        // 1. 使用 tab_id 作为主键
        // 2. 使用 URL（规范化后）作为备选键
        const normalizeUrl = (url) => {
          if (!url) return null;
          try {
            const urlObj = new URL(url);
            // 移除尾随斜杠和查询参数，只保留基础 URL
            return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/$/, '')}`;
          } catch {
            return url;
          }
        };
        
        const similarityMap = new Map();
        const urlSimilarityMap = new Map();
        
        // 使用过滤后的结果（只包含 sessions 中的项目）
        filteredResults.forEach(result => {
          // 优先使用 tab_id
          if (result.tab_id && result.similarity !== undefined) {
            similarityMap.set(result.tab_id, result.similarity);
          }
          // 也使用 URL 作为备选（规范化后）
          if (result.url && result.similarity !== undefined) {
            const normalizedUrl = normalizeUrl(result.url);
            if (normalizedUrl) {
              urlSimilarityMap.set(normalizedUrl, result.similarity);
            }
            // 也保存原始 URL
            urlSimilarityMap.set(result.url, result.similarity);
          }
        });
        
        console.log('[PersonalSpace] Search results mapping:', {
          totalResults: results.length,
          tabIdMatches: similarityMap.size,
          urlMatches: urlSimilarityMap.size,
          sampleResults: results.slice(0, 3).map(r => ({
            tab_id: r.tab_id,
            url: r.url?.substring(0, 50),
            similarity: r.similarity
          }))
        });
        
        let totalMatched = 0;
        let totalUpdated = 0;
        
        // 更新每个 session 的 opengraphData，添加 similarity 字段
        safeSessions.forEach(session => {
          if (!session || !Array.isArray(session.opengraphData)) return;
          
          const updatedData = session.opengraphData.map(item => {
            // 尝试多种匹配方式
            let similarity = undefined;
            
            // 1. 优先使用 tab_id 匹配
            if (item.tab_id && similarityMap.has(item.tab_id)) {
              similarity = similarityMap.get(item.tab_id);
            }
            // 2. 如果 tab_id 不匹配，尝试 URL 匹配
            else if (item.url) {
              const normalizedItemUrl = normalizeUrl(item.url);
              if (normalizedItemUrl && urlSimilarityMap.has(normalizedItemUrl)) {
                similarity = urlSimilarityMap.get(normalizedItemUrl);
              } else if (urlSimilarityMap.has(item.url)) {
                similarity = urlSimilarityMap.get(item.url);
              }
            }
            
            if (similarity !== undefined) {
              totalMatched++;
              return { ...item, similarity };
            } else {
              // 清除之前的 similarity（如果存在）
              const { similarity: _, ...rest } = item;
              return rest;
            }
          });
          
          // 只有当数据有变化时才更新
          const hasChanges = updatedData.some((item, index) => {
            const original = session.opengraphData[index];
            return (item.similarity !== undefined) !== (original.similarity !== undefined) ||
                   (item.similarity !== original.similarity);
          });
          
          if (hasChanges) {
            totalUpdated++;
            updateSession(session.id, { opengraphData: updatedData });
          }
        });
        
        console.log('[PersonalSpace] Search completed (masonry):', {
          totalResults: results.length,
          totalSessions: safeSessions.length,
          matchedItems: totalMatched,
          updatedSessions: totalUpdated
        });
      }
    }
  };

  // 清空搜索（使用 hook）
  const handleClearSearch = () => {
    clearSearch();
    // 恢复原始数据（清除相似度标记）
    if (viewMode === 'radial') {
      // Radial 视图：恢复原始布局
      const currentSession = getCurrentSession();
      const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
      if (currentSessionOpengraphData.length > 0) {
        // 清除相似度标记
        const cleanedData = currentSessionOpengraphData.map(item => ({
          ...item,
          similarity: undefined,
        }));
        const originalData = calculateRadialLayout(cleanedData, {
          centerX: 720,
          centerY: 512,
          baseRadius: UI_CONFIG.radial.baseRadius,
          radiusGap: UI_CONFIG.radial.radiusGap,
          minRadiusGap: UI_CONFIG.radial.minRadiusGap,
          maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
          autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
        });
        setOpengraphData(originalData);
      }
    } else {
      // ✅ 修复问题2：Masonry 视图：清除所有 session 的相似度标记，恢复原始顺序
      const safeSessions = Array.isArray(sessions) ? sessions : [];
      safeSessions.forEach(session => {
        if (session && Array.isArray(session.opengraphData)) {
          const cleanedData = session.opengraphData.map(item => {
            const { similarity: _, ...rest } = item;
            return rest;
          });
          updateSession(session.id, { opengraphData: cleanedData });
        }
      });
    }
    setShowOriginalImages(true);
    console.log('[PersonalSpace] Search cleared, restored original layout and order');
  };

  // 🆕 处理颜色筛选
  const handleColorFilter = useCallback((color) => {
    setSelectedColorFilter(color);
    
    if (!color) {
      // 清除颜色筛选：恢复所有卡片的可见性
      console.log('[PersonalSpace] Color filter cleared');
      return;
    }
    
    console.log('[PersonalSpace] Color filter applied:', color.name, color.hex);
    
    // 颜色筛选逻辑：
    // 1. 获取当前数据
    // 2. 为匹配颜色的卡片设置高相似度
    // 3. 不匹配的设置低相似度（或隐藏）
    
    // 🆕 使用 Delta E + 色相（Hue）双重检查，提高精确度
    // 🆕 优化：降低 Delta E 阈值，并添加色相检查，避免互补色误匹配
    const COLOR_THRESHOLD = 30; // Delta E 阈值（更严格，只匹配相似颜色）
    const HUE_THRESHOLD = 60; // 色相差阈值（度），允许 ±60 度的色相范围

    // Hex 规范化工具：确保带 # 且为大写
    const normalizeHex = (hex) => {
      if (!hex || typeof hex !== 'string') return null;
      const h = hex.trim();
      const match = h.match(/^#?([0-9a-fA-F]{6})$/);
      if (!match) return null;
      return `#${match[1].toUpperCase()}`;
    };

    const targetHex = normalizeHex(color.hex);
    if (!targetHex) {
      console.warn('[ColorFilter] Invalid target color:', color.hex);
      return;
    }
    
    const filterByColor = async (items) => {
      if (!Array.isArray(items)) return items;
      
      let matchCount = 0;
      let noColorCount = 0;
      let invalidColorCount = 0;
      let extractedCount = 0;
      
      // 将目标颜色转换为 Lab 颜色空间和 HSV（只需转换一次）
      const targetLab = hexToLab(targetHex);
      const targetHsv = hexToHsv(targetHex);
      
      // 🆕 第一步：为没有颜色的卡片从 IndexedDB 提取颜色
      const itemsToExtract = [];
      const itemsCopy = [...items]; // 创建副本，避免直接修改原数组
      
      for (let i = 0; i < itemsCopy.length; i++) {
        const item = itemsCopy[i];
        const rawColors = item.dominant_colors || [];
        const itemColors = rawColors
          .map(normalizeHex)
          .filter(Boolean);
        
        if (itemColors.length === 0) {
          // 没有颜色数据，尝试从 IndexedDB 提取
          itemsToExtract.push({ index: i, item });
        }
      }
      
      // 🆕 批量从 IndexedDB 提取颜色（最多同时处理 10 个，避免阻塞）
      if (itemsToExtract.length > 0) {
        console.log(`[ColorFilter] 🎨 发现 ${itemsToExtract.length} 个卡片没有颜色数据，尝试从 IndexedDB 提取...`);
        
        const extractPromises = itemsToExtract.slice(0, 10).map(async ({ index, item }) => {
          try {
            // 1. 优先从 IndexedDB 加载图片
            let imageDataUrl = null;
            
            if (item.original_image_url) {
              try {
                if (window.__TAB_CLEANER_EAGLE_STORAGE && window.__TAB_CLEANER_EAGLE_STORAGE.loadImage) {
                  const indexedDbData = await window.__TAB_CLEANER_EAGLE_STORAGE.loadImage(item.original_image_url);
                  if (indexedDbData && indexedDbData.dataUrl) {
                    imageDataUrl = indexedDbData.dataUrl;
                  }
                }
              } catch (error) {
                console.warn(`[ColorFilter] ⚠️ Failed to load from IndexedDB for ${item.url?.substring(0, 50)}:`, error);
              }
            }
            
            // 2. 如果没有从 IndexedDB 加载到，尝试使用已有的 base64
            if (!imageDataUrl) {
              imageDataUrl =
                item.thumbnail ||
                item.screenshot_image ||
                (item.image && item.image.startsWith('data:image') ? item.image : null);
            }
            
            // 3. 如果有图片数据，提取颜色
            if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
              const colors = await extractColorsFromBase64(imageDataUrl);
              if (colors && colors.length > 0) {
                extractedCount++;
                console.log(`[ColorFilter] ✅ 从 IndexedDB 提取颜色成功: ${item.url?.substring(0, 50)}`);
                return { index, colors, itemId: item.id, itemUrl: item.url };
              }
            }
          } catch (error) {
            console.warn(`[ColorFilter] ⚠️ 颜色提取失败: ${item.url?.substring(0, 50)}`, error);
          }
          return null;
        });
        
        // 等待所有提取完成（最多等待 5 秒）
        const extractResults = await Promise.race([
          Promise.all(extractPromises),
          new Promise(resolve => setTimeout(() => resolve([]), 5000))
        ]);
        
        if (extractedCount > 0 && extractResults && extractResults.length > 0) {
          console.log(`[ColorFilter] ✅ 成功从 IndexedDB 提取 ${extractedCount} 个卡片的颜色`);
          
          // 更新 itemsCopy，确保后续筛选使用最新数据
          extractResults.forEach(result => {
            if (result && result.colors && result.index !== undefined) {
              itemsCopy[result.index] = { ...itemsCopy[result.index], dominant_colors: result.colors };
            }
          });
          
          // 更新 session 数据（保存提取的颜色）
          const safeSessions = Array.isArray(sessions) ? sessions : [];
          for (const session of safeSessions) {
            if (session && Array.isArray(session.opengraphData)) {
              let updated = false;
              const updatedData = session.opengraphData.map(ogItem => {
                const extractedResult = extractResults.find(r => 
                  r && r.colors && (r.itemId === ogItem.id || r.itemUrl === ogItem.url)
                );
                if (extractedResult && extractedResult.colors) {
                  updated = true;
                  return { ...ogItem, dominant_colors: extractedResult.colors };
                }
                return ogItem;
              });
              
              if (updated) {
                updateSession(session.id, { opengraphData: updatedData });
              }
            }
          }
        }
      }
      
      // 第二步：基于颜色数据进行筛选（使用更新后的 itemsCopy）
      const result = itemsCopy.map(item => {
        const rawColors = item.dominant_colors || [];

        // 规范化并过滤无效颜色
        const itemColors = rawColors
          .map(normalizeHex)
          .filter(Boolean);
        if (rawColors.length !== itemColors.length) {
          invalidColorCount += (rawColors.length - itemColors.length);
        }
        
        if (itemColors.length === 0) {
          noColorCount++;
          return { ...item, similarity: 0.1, _colorMatched: false };
        }
        
        // 🆕 优化：计算与目标颜色的最小 Delta E 距离和色相差
        let minDeltaE = 999;
        let minHueDiff = 999;
        let bestMatchHex = null;
        
        for (const itemHex of itemColors) {
          try {
            const itemLab = hexToLab(itemHex);
            const deltaE = calculateDeltaE(targetLab, itemLab);
            
            // 🆕 计算色相差
            const itemHsv = hexToHsv(itemHex);
            const hueDiff = calculateHueDifference(targetHsv.h, itemHsv.h);
            
            // 如果这个颜色更接近目标，更新最小值
            if (deltaE < minDeltaE) {
              minDeltaE = deltaE;
              minHueDiff = hueDiff;
              bestMatchHex = itemHex;
            }
          } catch (e) {
            // 如果颜色转换失败，跳过这个颜色
            console.warn('[ColorFilter] Failed to convert color:', itemHex, e);
          }
        }
        
        // 🆕 优化：双重检查 - Delta E 和色相差
        // 1. Delta E 必须小于阈值（颜色相似）
        // 2. 色相差必须小于阈值（同一色系）
        // 3. 不能是互补色（如红色和蓝色）
        const deltaEMatch = minDeltaE < COLOR_THRESHOLD;
        const hueMatch = minHueDiff < HUE_THRESHOLD;
        const notComplementary = bestMatchHex ? !areComplementaryColors(targetHex, bestMatchHex) : true;
        
        // 🆕 对于低饱和度颜色（接近灰色），放宽色相要求
        const isLowSaturation = targetHsv.s < 0.3;
        const hueCheck = isLowSaturation ? true : hueMatch; // 灰色系不检查色相
        
        const isMatch = deltaEMatch && hueCheck && notComplementary;
        
        // 相似度计算：综合考虑 Delta E 和色相差
        const deltaESimilarity = Math.max(0, 1 - (minDeltaE / COLOR_THRESHOLD));
        const hueSimilarity = isLowSaturation ? 1 : Math.max(0, 1 - (minHueDiff / HUE_THRESHOLD));
        const similarity = isMatch ? (deltaESimilarity * 0.7 + hueSimilarity * 0.3) : 0.1;
        
        if (isMatch) matchCount++;
        
        return {
          ...item,
          similarity: similarity,
          _colorMatched: isMatch,
          _colorDistance: minDeltaE,
        };
      });
      
      // 🆕 详细调试信息
      const withThumbnail = items.filter(item => item.thumbnail && item.thumbnail.startsWith('data:image')).length;
      const withColors = items.filter(item => item.dominant_colors && Array.isArray(item.dominant_colors) && item.dominant_colors.length > 0).length;
      
      console.log(`[ColorFilter] 筛选结果: ${matchCount}/${items.length} 匹配 (阈值=${COLOR_THRESHOLD})`);
      console.log(`[ColorFilter] 数据统计: ${withColors} 有颜色, ${withThumbnail} 有缩略图, ${noColorCount} 无颜色数据, ${extractedCount} 从 IndexedDB 提取`);
      if (invalidColorCount > 0) {
        console.warn(`[ColorFilter] 检测到 ${invalidColorCount} 个无效颜色值，已忽略（需为 #RRGGBB）`);
      }
      
      // 🆕 输出匹配列表（最多 20 条）便于定位
      const matchedItems = result.filter(item => item._colorMatched);
      if (matchedItems.length > 0) {
        console.log(`[ColorFilter] 匹配卡片(${matchedItems.length})，前 20 个:`,
          matchedItems.slice(0, 20).map(item => ({
            title: item.title?.substring(0, 40) || '(no title)',
            url: item.url?.substring(0, 60) || '',
            distance: item._colorDistance?.toFixed(2),
            colors: item.dominant_colors?.slice(0, 3) || []
          }))
        );
      }
      
      // 🆕 如果匹配数为 0，打印前 3 个有颜色数据的项目的距离信息（用于调试）
      if (matchCount === 0 && withColors > 0) {
        const itemsWithColors = result.filter(item => item._colorDistance !== undefined && item._colorDistance < 999);
        if (itemsWithColors.length > 0) {
          console.log(`[ColorFilter] 🔍 调试：前 3 个有颜色数据的项目距离:`, 
            itemsWithColors.slice(0, 3).map(item => ({
              title: item.title?.substring(0, 30),
              colors: item.dominant_colors?.slice(0, 2),
              distance: item._colorDistance?.toFixed(2),
              matched: item._colorMatched
            }))
          );
        }
      }
      
      return result;
    };
    
    // 🆕 异步处理颜色筛选（需要从 IndexedDB 提取颜色）
    (async () => {
      if (viewMode === 'masonry') {
        // Masonry 视图：更新所有 session 的数据
        const safeSessions = Array.isArray(sessions) ? sessions : [];
        for (const session of safeSessions) {
          if (session && Array.isArray(session.opengraphData)) {
            const filteredData = await filterByColor(session.opengraphData);
            updateSession(session.id, { opengraphData: filteredData });
          }
        }
      } else if (viewMode === 'radial') {
        // Radial 视图：更新当前显示的数据
        const currentSession = getCurrentSession();
        if (currentSession && Array.isArray(currentSession.opengraphData)) {
          const filteredData = await filterByColor(currentSession.opengraphData);
          // 重新计算布局（匹配的靠前）
          const sortedData = [...filteredData].sort((a, b) => 
            (b.similarity || 0) - (a.similarity || 0)
          );
          const layoutData = calculateRadialLayout(sortedData, {
            centerX: 720,
            centerY: 512,
            baseRadius: UI_CONFIG.radial.baseRadius,
            radiusGap: UI_CONFIG.radial.radiusGap,
            minRadiusGap: UI_CONFIG.radial.minRadiusGap,
            maxRadiusGap: UI_CONFIG.radial.maxRadiusGap,
            autoAdjustRadius: UI_CONFIG.radial.autoAdjustRadius,
          });
          setOpengraphData(layoutData);
        }
      }
    })();
  }, [viewMode, sessions, updateSession, getCurrentSession, calculateRadialLayout, setOpengraphData]);

  // 处理宠物设定空间入口点击
  const handlePetSettingsClick = useCallback(() => {
    setCurrentPage('petSetting');
    // ✅ 修复：同步更新 URL hash，确保刷新后状态一致
    if (typeof window !== 'undefined') {
      window.location.hash = '#pet-setting';
    }
  }, []);
  
  // 处理返回主页（点击洗衣房图标）
  const handleBackToHome = useCallback(() => {
    setCurrentPage('home');
    // ✅ 修复：清除 URL hash，确保刷新后回到主页
    if (typeof window !== 'undefined') {
      // 使用 history.replaceState 避免触发 hashchange 事件（因为我们已经手动更新了状态）
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      // 或者直接设置为空 hash
      // window.location.hash = '';
    }
  }, []);

  // 处理选中
  const handleSelect = (id, isMultiSelect) => {
    setSelectedIds(prev => {
      const prevSelected = new Set(prev);
      const newSet = new Set(prev);
      if (isMultiSelect) {
        // Shift 键：切换选中状态
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        // 普通点击：单选
        newSet.clear();
        newSet.add(id);
      }
      // 记录选中状态到历史
      addToHistory({ type: 'selection', action: 'select', selectedIds: Array.from(newSet), prevSelectedIds: Array.from(prevSelected) });
      return newSet;
    });
  };

  // 处理拖拽结束
  const handleDragEnd = (id, x, y) => {
    // 如果是 OpenGraph 图片
    if (id.startsWith('og-')) {
      setOpengraphData(prev => {
        // ✅ 修复：确保 prev 是数组
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.map(og =>
          og && og.id === id ? { ...og, x, y } : og
        );
      });
      // 记录到历史
      const safeOpengraphData = Array.isArray(opengraphData) ? opengraphData : [];
      const prevOG = safeOpengraphData.find(og => og && og.id === id);
      if (prevOG) {
        addToHistory({ 
          type: 'opengraph-move', 
          action: 'move', 
          ogId: id, 
          x, 
          y, 
          prevX: prevOG.x, 
          prevY: prevOG.y 
        });
      }
    } else {
      // 原有图片
      setImages(prev => {
        // ✅ 修复：确保 prev 是数组
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.map(img =>
          img && img.id === id ? { ...img, x, y } : img
        );
      });
      // 记录到历史
      const safeImages = Array.isArray(images) ? images : [];
      const prevImg = safeImages.find(img => img && img.id === id);
      if (prevImg) {
        addToHistory({ 
          type: 'image-move', 
          action: 'move', 
          imageId: id, 
          x, 
          y, 
          prevImages: images 
        });
      }
    }
  };

  // 套索选择（使用工具函数）
  const handleLassoSelect = (lassoPath) => {
    const prevSelected = new Set(selectedIds);
    const selected = handleLassoSelectUtil(lassoPath, images, opengraphData);
    setSelectedIds(selected);
    // 记录选中状态到历史
    addToHistory({ 
      type: 'selection', 
      action: 'select', 
      selectedIds: Array.from(selected), 
      prevSelectedIds: Array.from(prevSelected) 
    });
  };

  // 处理画布工具的历史记录变化
  const handleHistoryChange = (action) => {
    addToHistory(action);
  };

  // 处理点击空白处取消选择
  const handleCanvasClick = (e) => {
    if (activeTool) {
      return;
    }
    
    // 检查是否点击在空白处（不是卡片、按钮、输入框等）
    const target = e.target;
    const isClickOnCard = target.closest('.radial-card') || 
                          target.closest('.masonry-item') ||
                          target.closest('img') ||
                          target.closest('.tool-button-wrapper') || 
                          target.closest('.canvas-text-element') ||
                          target.closest('input') ||
                          target.closest('button') ||
                          target.closest('a') ||
                          target.closest('svg') ||
                          target.closest('path') ||
                          target.closest('.card-action-button') ||
                          target.closest('.session-header') ||
                          target.closest('.search-bar') ||
                          target.closest('.view-button');
    
    // 如果点击在personal-space容器或canvas上，且不是点击在卡片等元素上，则取消选择
    if (!isClickOnCard && (
        target === containerRef.current ||
        target.classList?.contains('personal-space') ||
        target === canvasRef.current || 
        (target.classList && target.classList.contains('canvas')) ||
        (target.tagName === 'DIV' && target.classList.contains('canvas'))
    )) {
      setSelectedIds(new Set());
    }
  };

      // 处理卡片双击
      const handleCardDoubleClick = useCallback((og) => {
        const now = Date.now();
        if (lastOGClickRef.current.id === og.id && now - lastOGClickRef.current.time < 300) {
          setSelectedOG(og);
          lastOGClickRef.current = { time: 0, id: null };
        } else {
          lastOGClickRef.current = { time: now, id: og.id };
        }
      }, []);


      // Session 容器 ref（用于 ScrollSpy）
      const sessionContainerRef = useRef(null);
      const handleSessionFocus = useCallback((sessionId) => {
        if (!sessionId) return;
        setCurrentSessionId(sessionId);
      }, [setCurrentSessionId]);

      // 处理 Session 删除
      const handleSessionDelete = useCallback((sessionId, selectedCardIds = null) => {
        if (selectedCardIds && selectedCardIds.length > 0) {
          // 删除选中的卡片
          // ✅ 修复：添加安全检查
          const safeSessions = Array.isArray(sessions) ? sessions : [];
          const session = safeSessions.find(s => s && s.id === sessionId);
          if (session) {
            const updatedData = session.opengraphData.filter(item => !selectedCardIds.includes(item.id));
            updateSession(sessionId, { opengraphData: updatedData });
          }
        } else {
          // 删除整个 session
          deleteSession(sessionId);
        }
      }, [sessions, updateSession, deleteSession]);

      // 处理 Session 全部打开
      const handleSessionOpenAll = useCallback((sessionId, selectedCardIds = null) => {
        // ✅ 修复：添加安全检查
        const safeSessions = Array.isArray(sessions) ? sessions : [];
        const session = safeSessions.find(s => s && s.id === sessionId);
        if (!session) return;

        const urlsToOpen = selectedCardIds && selectedCardIds.length > 0
          ? session.opengraphData
              .filter(item => selectedCardIds.includes(item.id))
              .map(item => item.url)
              .filter(Boolean)
          : session.opengraphData
              .map(item => item.url)
              .filter(Boolean);

        // 去重：使用 Set 确保每个 URL 只打开一次
        const uniqueUrls = [...new Set(urlsToOpen)];
        
        uniqueUrls.forEach(url => {
          chrome.tabs.create({ url });
        });
      }, [sessions]);

      // 调试日志
      useEffect(() => {
        // ✅ 修复：添加安全检查
        const safeSessions = Array.isArray(sessions) ? sessions : [];
        console.log('[PersonalSpace] Sessions state:', {
          sessionsCount: safeSessions.length,
          isLoading: isSessionsLoading,
          currentSessionId,
          sessions: safeSessions.map(s => ({
            id: s.id,
            name: s.name,
            itemCount: s.opengraphData?.length || 0,
            hasOpengraphData: !!s.opengraphData,
          })),
        });
      }, [sessions, isSessionsLoading, currentSessionId]);

      // ✅ 修复问题4：检测是否处于搜索模式，并过滤掉不在 personal space 中的结果
      const filteredSearchResults = Array.isArray(searchResults) 
        ? filterResultsBySessions(searchResults) 
        : [];
      
      const hasActiveSearch = filteredSearchResults.length > 0;
      const searchOverlayConfig = UI_CONFIG.searchOverlay || {};
      // 获取前 N 个搜索结果用于水平显示（使用过滤后的结果）
      const topSearchResults = hasActiveSearch 
        ? filteredSearchResults.slice(0, searchOverlayConfig.maxResults ?? 5) 
        : [];

      return (
        <>
          {/* 静态天空背景 - 使用 background-space.png */}
          {/* <FluidGlassCursor /> */} {/* ⚠️ 临时禁用：移除自定义cursor样式 */}
          <FlowingSkyBackground />
          {/* 右下角宠物显示 */}
          <PetDisplay />
          {/* ✅ 修复问题2：模糊效果只在有搜索结果时显示，而不是在搜索中时显示 */}
          <div className={`personal-space ${hasActiveSearch ? 'searching-active' : ''}`} ref={containerRef} style={{ position: "relative" }}>
            <div 
              className={`search-blur-overlay ${hasActiveSearch ? 'active' : ''}`}
              style={{
                '--blur-amount': `${UI_CONFIG.searchBar.blurOverlay.blurAmount}px`,
                '--transition-duration': `${UI_CONFIG.searchBar.blurOverlay.transitionDuration}s`,
              }}
            />
            {/* 底部渐变模糊遮罩层 - 使用 reactbits.dev 风格的 GradualBlur */}
            <GradualBlur 
              position="bottom" 
              strength={2}
              height="12rem"
              divCount={12}
              exponential={true}
              curve="bezier"
              opacity={0.85}
              animated={false}
              target="page"
              zIndex={100}
            />
            
          {/* 头部组件 - 始终显示，位置不变 */}
          <PersonalSpaceHeader
            currentPage={currentPage}
            onBackToHome={handleBackToHome}
            onCreateSession={() => {
              const newSession = createSession([]);
              setCurrentSessionId(newSession.id);
            }}
            onViewModeChange={setViewMode}
          />

            {/* 根据当前页面显示不同内容 */}
            {currentPage === 'home' ? (
              <>
          {/* 视图容器 */}
          <ViewContainer
            viewMode={viewMode}
            sessions={sessions}
            currentSessionId={currentSessionId}
            searchQuery={searchQuery}
            hasActiveSearch={hasActiveSearch}
            onCardClick={handleCardDoubleClick}
            onSessionDelete={handleSessionDelete}
            onSessionOpenAll={handleSessionOpenAll}
            sessionContainerRef={sessionContainerRef}
            onSessionFocus={handleSessionFocus}
            selectedColorFilter={selectedColorFilter} // 🆕 颜色筛选
            onColorsExtracted={handleColorsExtracted}
            onThumbnailGenerated={handleThumbnailGenerated}
            canvasRef={canvasRef}
            containerRef={containerRef}
            showOriginalImages={showOriginalImages}
            images={images}
            opengraphData={opengraphData}
            selectedIds={selectedIds}
            clusters={clusters}
            clusterDragStartRef={clusterDragStartRef}
            zoom={zoom}
            pan={pan}
            isPanning={isPanning}
            isSpacePressed={isSpacePressed}
            activeTool={activeTool}
            drawPaths={drawPaths}
            setDrawPaths={setDrawPaths}
            textElements={textElements}
            setTextElements={setTextElements}
            onSelect={handleSelect}
            onDragEnd={handleDragEnd}
            onCanvasClick={handleCanvasClick}
            onCardDoubleClick={handleCardDoubleClick}
            onDelete={(ogId) => {
              setOpengraphData(prev => {
                // ✅ 修复：确保 prev 是数组
                const safePrev = Array.isArray(prev) ? prev : [];
                const prevOG = [...safePrev];
                const newOG = safePrev.filter(og => og && og.id !== ogId);
                addToHistory({ 
                  type: 'opengraph-delete', 
                  action: 'delete', 
                  deletedIds: [ogId],
                  prevOG: prevOG
                });
                return newOG;
              });
              if (selectedIds && selectedIds.has(ogId)) {
                const newSelectedIds = new Set(selectedIds);
                newSelectedIds.delete(ogId);
                setSelectedIds(newSelectedIds);
              }
            }}
            onOpenLink={(url) => {
              if (url) {
                window.open(url, '_blank');
              }
            }}
            onClusterRename={handleClusterRename}
            onClusterDrag={handleClusterDrag}
            onLassoSelect={handleLassoSelect}
            onHistoryChange={handleHistoryChange}
            getCanvasCursor={getCanvasCursor}
          />

          {/* 搜索遮罩层 */}
          <SearchOverlay
            searchResults={filteredSearchResults}
            onCardClick={handleCardDoubleClick}
            onClearSearch={clearSearch}
          />

                <SearchBar
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchChange}
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isSearching={isSearching}
        onPetSettingsClick={handlePetSettingsClick}
        onColorFilter={handleColorFilter}
        selectedColor={selectedColorFilter}
                />

                    <ViewButtons 
                  viewMode={viewMode} 
                  onViewModeChange={setViewMode} 
                />

                    <Component className="side-panel" property1="one" />
                    
                    <AIClusteringPanel
                      show={showAIClusteringPanel}
            aiLabels={aiLabels}
            onClose={() => setShowAIClusteringPanel(false)}
            onLabelRename={handleLabelRename}
            onLabelDelete={handleLabelDelete}
            onAddLabel={handleAddLabel}
            onClassify={handleClassify}
                      onDiscover={handleDiscover}
                      isClustering={isClustering}
                    />

                    <ToolSets
                      activeTool={activeTool}
        onToolChange={setActiveTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
                      canRedo={canRedo}
                      onAIClusteringClick={() => setShowAIClusteringPanel(!showAIClusteringPanel)}
                    />

                    {/* OpenGraph 卡片（点击图片后显示） */}
                    {selectedOG && (
            <OpenGraphCard
              data={selectedOG}
              onClose={() => setSelectedOG(null)}
            />
                    )}

                    {/* 选中面板（有图片被选中时显示） */}
                    {selectedIds && selectedIds.size > 0 && (
            <SelectionPanel
              selectedCount={selectedIds.size}
              groupName={selectedGroupName}
              onDelete={() => {
                console.log('[SelectionPanel] Delete clicked');
                const selectedArray = Array.from(selectedIds);
                
                // 从画布移除图片
                if (showOriginalImages) {
                  // 移除原有图片
                  setImages(prev => {
                    const prevImages = [...prev];
                    const newImages = prev.filter(img => !selectedIds.has(img.id));
                    addToHistory({ 
                      type: 'image-delete', 
                      action: 'delete', 
                      deletedIds: selectedArray,
                      prevImages: prevImages
                    });
                    return newImages;
                  });
                } else {
                  // 移除 OpenGraph 图片
                  setOpengraphData(prev => {
                    const prevOG = [...prev];
                    const newOG = prev.filter(og => !selectedIds.has(og.id));
                    addToHistory({ 
                      type: 'opengraph-delete', 
                      action: 'delete', 
                      deletedIds: selectedArray,
                      prevOG: prevOG
                    });
                    return newOG;
                  });
                }
                
                // 清空选中状态
                setSelectedIds(new Set());
              }}
              onRename={async (newName) => {
                console.log('[SelectionPanel] Rename to:', newName);
                setSelectedGroupName(newName);
                
                // 重命名后立即自动创建聚类
                if (selectedIds.size > 0 && newName.trim()) {
                  try {
                    const selectedArray = Array.from(selectedIds);
                    const allItems = showOriginalImages ? images : opengraphData;
                    
                    // 计算聚类中心位置（在选中卡片的中心）
                    let centerX = 720;
                    let centerY = 512;
                    if (selectedArray.length > 0) {
                      const selectedItems = allItems.filter(item => selectedIds.has(item.id));
                      if (selectedItems.length > 0) {
                        const sumX = selectedItems.reduce((sum, item) => sum + (item.x || 720), 0);
                        const sumY = selectedItems.reduce((sum, item) => sum + (item.y || 512), 0);
                        centerX = sumX / selectedItems.length;
                        centerY = sumY / selectedItems.length;
                      }
                    }
                    
                    const result = await createManualCluster(
                      selectedArray,
                      newName.trim(),
                      allItems,
                      centerX,
                      centerY
                    );
                    
                    if (result && result.ok && result.cluster) {
                      const cluster = result.cluster;
                      
                      // 获取所有卡片数据
                      const allItems = showOriginalImages ? images : opengraphData;
                      
                      // ✅ 修复：只计算新聚类中的卡片 ID（不包括旧聚类）
                      const newClusterItemIds = new Set(selectedArray);
                      
                      // ✅ 获取剩余未聚类的卡片（从所有卡片中移除新聚类的卡片）
                      const remainingItems = allItems.filter(item => !newClusterItemIds.has(item.id));
                      
                      // ✅ 获取已有聚类中的卡片（不包括新聚类和剩余卡片）
                      // 排除旧的默认聚类，避免重复
                      const existingClusters = clusters.filter(c => c.id !== 'default-cluster');
                      
                      // ✅ 构建最终的聚类列表
                      const updatedClusters = [...existingClusters, cluster];
                      
                      // ✅ 如果有剩余卡片，添加默认聚类
                      if (remainingItems.length > 0) {
                        const defaultCluster = {
                          id: 'default-cluster',
                          name: '未分类',
                          type: 'default',
                          // ✅ 深拷贝，确保每个字段都被复制，包括坐标
                          items: remainingItems.map(item => ({
                            ...item,
                            id: item.id,
                            x: item.x,
                            y: item.y,
                            width: item.width || (item.is_doc_card ? 200 : 120),
                            height: item.height || (item.is_doc_card ? 150 : 120),
                            image: item.image,
                            title: item.title,
                            url: item.url,
                            is_doc_card: item.is_doc_card,
                            // 保留其他必要字段
                            text_embedding: item.text_embedding,
                            image_embedding: item.image_embedding,
                          })),
                          center: { x: 720, y: 512 }, // 临时位置，会被重新计算
                          radius: 200,
                          item_count: remainingItems.length,
                        };
                        // 总是添加新的默认聚类（因为已经排除了旧的）
                        updatedClusters.push(defaultCluster);
                      }
                      
                      // 重新计算所有聚类的位置（避免重叠）- 这设置了聚类圆心的目标位置
                      // 当有2个聚类时，默认聚类会移动到左侧（水平对称布局）
                      const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
                        canvasWidth: 1440,
                        canvasHeight: 1024,
                        clusterSpacing: 500, // 增加间距以避免重叠
                        clusterCenterRadius: 250, // 增加半径以让聚类更分散
                      });
                      
                      // 更新聚类列表（Spring 系统会自动处理圆心和卡片位置的动画）
                      setClusters(repositionedClusters);
                      
                      // ✅ 调试日志
                      const isDev = process.env.NODE_ENV === 'development';
                      if (isDev) {
                        console.log('[Clustering] Manual cluster created:', {
                          newCluster: cluster.id,
                          newClusterItems: cluster.items?.length || 0,
                          remainingItems: remainingItems.length,
                          totalClusters: repositionedClusters.length,
                          clusterDetails: repositionedClusters.map(c => ({
                            id: c.id,
                            name: c.name,
                            type: c.type,
                            itemCount: c.items?.length || 0,
                            center: c.center,
                          })),
                        });
                      }
                      
                      // 重要：不移除已聚类的卡片，保留在 opengraphData/images 中
                      // Spring 系统需要这些卡片数据来计算和更新位置
                      
                      // 重要：剩余卡片应该由默认聚类的 Spring 系统处理
                      // 不需要手动重新计算位置，Spring 系统会根据默认聚类的中心位置自动排列
                      // 默认聚类的中心位置已经在 calculateMultipleClustersLayout 中重新计算了
                      
                      // 注意：不再直接设置卡片位置，Spring 系统会自动处理
                      // Spring 系统会：
                      // 1. 根据聚类圆心的目标位置（repositionedClusters[].center）更新圆心 Spring
                      // 2. 根据当前圆心位置计算卡片目标位置（同心圆排列）
                      // 3. 更新卡片 Spring，平滑移动到目标位置
                      
                      // 不自动取消选中（根据需求）
                      console.log('[Clustering] Manual cluster created, total clusters:', repositionedClusters.length);
                    }
                  } catch (error) {
                    console.error('[Clustering] Failed to create manual cluster:', error);
                    alert('创建聚类失败：' + (error.message || '未知错误'));
                  } finally {
                    setIsClustering(false);
                  }
                }
              }}
              onOpen={() => {
                console.log('[SelectionPanel] Open clicked');
                // TODO: 实现打开选中图片对应的 URL
                const selectedArray = Array.from(selectedIds);
                selectedArray.forEach(id => {
                  if (id.startsWith('og-')) {
                    const og = opengraphData.find(item => item.id === id);
                    if (og && og.url) {
                      window.open(og.url, '_blank');
                    }
                  }
                });
              }}
              onDownload={() => {
                console.log('[SelectionPanel] Download clicked');
                const selectedArray = Array.from(selectedIds);
                const urlList = [];
                
                // 收集选中图片的 URL
                selectedArray.forEach(id => {
                  if (id.startsWith('og-')) {
                    const og = opengraphData.find(item => item.id === id);
                    if (og) {
                      urlList.push({
                        id: og.id,
                        url: og.url || '',
                        title: og.title || og.tab_title || '',
                        description: og.description || '',
                        image: og.image || '',
                        site_name: og.site_name || '',
                      });
                    }
                  } else {
                    // 原有图片（如果有 URL 信息）
                    const img = images.find(item => item.id === id);
                    if (img) {
                      urlList.push({
                        id: img.id,
                        url: img.url || '',
                        title: img.alt || '',
                        image: img.src || '',
                      });
                    }
                  }
                });
                
                // 生成 JSON 并下载
                const jsonContent = JSON.stringify(urlList, null, 2);
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `selected_urls_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              onAIInsight={async () => {
                try {
                  console.log('[SelectionPanel] AI Insight clicked');
                  const selectedArray = Array.from(selectedIds);
                  const opengraphItems = [];
                  
                  // 收集选中图片的 OpenGraph 数据
                  selectedArray.forEach(id => {
                    if (id.startsWith('og-')) {
                      const og = opengraphData.find(item => item.id === id);
                      if (og) {
                        opengraphItems.push({
                          url: og.url || '',
                          title: og.title || og.tab_title || '',
                          description: og.description || '',
                          image: og.image || '',
                          site_name: og.site_name || '',
                        });
                      }
                    } else {
                      // 原有图片（如果有 URL 信息）
                      const img = images.find(item => item.id === id);
                      if (img && img.url) {
                        opengraphItems.push({
                          url: img.url || '',
                          title: img.alt || '',
                          description: '',
                          image: img.src || '',
                          site_name: '',
                        });
                      }
                    }
                  });
                  
                  if (opengraphItems.length === 0) {
                    alert('选中的图片没有可用的 URL 信息');
                    return;
                  }
                  
                  // 调用后端 AI 洞察 API
                  // 使用 Railway 生产环境地址
                  const apiUrl = 'https://tab-cleaner-mvp-app-production.up.railway.app';
                  const response = await fetch(`${apiUrl}/api/v1/ai/insight`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      opengraph_items: opengraphItems
                    })
                  });
                  
                  if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }
                  
                  const result = await response.json();
                  
                  if (result && result.ok && result.summary) {
                    // 显示 AI 洞察结果（使用 alert，后续可以改为更优雅的 UI）
                    const summaryText = result.summary || '无总结内容';
                    alert('AI 洞察总结：\n\n' + summaryText);
                  } else {
                    const errorMsg = (result && result.error) ? result.error : '未知错误';
                    alert('AI 洞察失败：' + errorMsg);
                  }
                } catch (error) {
                  console.error('[SelectionPanel] AI Insight error:', error);
                  const errorMessage = error && error.message ? error.message : '请求失败';
                  alert('AI 洞察请求失败：' + errorMessage);
                }
              }}
                    />
                  )}
              </>
            ) : (
              <PetSetting onBackToHome={handleBackToHome} />
            )}
          </div>
        </>
      );
    };

