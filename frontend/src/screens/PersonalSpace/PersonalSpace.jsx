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
  const searchDataSource = useMemo(() => {
    // 两个视图都使用所有sessions的数据进行搜索，确保搜索范围一致
    return Array.isArray(allOpengraphData) ? allOpengraphData : [];
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
          <div className={`personal-space ${hasActiveSearch ? 'searching-active' : ''}`} ref={containerRef} style={{ position: "relative", zIndex: 1 }}>
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

