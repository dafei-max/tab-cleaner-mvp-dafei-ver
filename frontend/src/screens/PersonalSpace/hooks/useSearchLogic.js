import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearch } from '../../../hooks/useSearch';
import { calculateRadialLayout } from '../../../utils/radialLayout';
import { UI_CONFIG } from '../uiConfig';

/**
 * 搜索逻辑 Hook
 * 
 * 封装所有搜索相关的状态、处理函数和计算逻辑。
 * 保持现有的所有 bug 修复和行为。
 * 
 * @param {Object} params - 参数对象
 * @param {Array} params.sessions - 所有 session 数据
 * @param {string} params.viewMode - 当前视图模式 ('radial' | 'masonry')
 * @param {Function} params.getCurrentSession - 获取当前 session 的函数
 * @param {Function} params.updateSession - 更新 session 的函数
 * @param {Function} params.setOpengraphData - 设置 opengraphData 的函数（用于 radial 视图）
 * @param {Function} params.setShowOriginalImages - 设置 showOriginalImages 的函数
 * 
 * @returns {Object} 搜索相关的状态和处理函数
 */
export const useSearchLogic = ({
  sessions,
  viewMode,
  getCurrentSession,
  updateSession,
  setOpengraphData,
  setShowOriginalImages,
}) => {
  // ===== 数据准备 =====
  
  // 所有 sessions 的 opengraphData（用于搜索数据源）
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

  // 搜索数据源：两个视图都使用所有 sessions 的数据，确保搜索范围一致
  const searchDataSource = useMemo(() => {
    return Array.isArray(allOpengraphData) ? allOpengraphData : [];
  }, [allOpengraphData]);

  // ===== 搜索状态 =====
  
  // 使用 useSearch hook（封装了搜索 API 调用和结果管理）
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    performSearch,
    clearSearch,
    clearSearchResults, // 只清除结果，不清除查询
  } = useSearch(searchDataSource);

  // 跟踪搜索是否激活（用户正在查看搜索结果）
  const [isSearchActive, setIsSearchActive] = useState(false);
  
  // ✅ 新增：跟踪是否正在等待搜索结果（用于显示模糊效果但不显示旧结果）
  const [isWaitingResults, setIsWaitingResults] = useState(false);
  const [lastSearchResultCount, setLastSearchResultCount] = useState(null);

  // 跟踪之前的搜索查询（用于退格检测）
  const previousQueryRef = useRef("");

  // ===== 辅助函数 =====

  // 收集所有 sessions 中的 URL 和 tab_id
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

  // 过滤搜索结果，只保留在 sessions 中的结果
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

  // ===== 搜索处理函数 =====

  // 清除搜索状态，恢复原始布局
  const handleClearSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    setLastSearchResultCount(null);
    clearSearch();

    // 恢复原始数据（清除相似度标记）
    if (viewMode === 'radial') {
      // Radial 视图：恢复原始布局
      const currentSession = getCurrentSession();
      const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
      if (currentSessionOpengraphData.length > 0) {
        // 清除相似度标记
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
    } else {
      // Masonry 视图：清除所有 session 的相似度标记，恢复原始顺序
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
    console.log('[useSearchLogic] Search cleared, restored original layout and order');
  }, [viewMode, clearSearch, setSearchQuery, getCurrentSession, setOpengraphData, sessions, updateSession, setShowOriginalImages]);

  // 处理搜索输入变化（退格检测：输入为空时清空搜索）
  const handleSearchChange = useCallback((nextValue) => {
    // 输入时立即清除之前的搜索状态
    // 避免在输入时显示之前的搜索结果和卡片被选中的情况
    const hasPreviousResults = searchResults && Array.isArray(searchResults) && searchResults.length > 0;

    // 如果有之前的搜索结果，立即清除（无论是否是新输入）
    if (hasPreviousResults || isSearchActive) {
      // 输入时，立即清除之前的搜索状态
      setIsSearchActive(false);
      clearSearchResults();

      // 清除之前的高亮和相似度标记
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
    }

    // 最后更新搜索查询（在清除之后）
    setSearchQuery(nextValue);
    // 输入时重置上次结果计数，避免展示旧的空态
    setLastSearchResultCount(null);

    const trimmedLength = nextValue.trim().length;
    const previousLength = previousQueryRef.current.trim().length;

    // 判断是删除字符
    const isDeleting = trimmedLength < previousLength;

    if (isDeleting && trimmedLength === 0) {
      // 删除所有字符（输入为空）：清空搜索，恢复原始布局
      handleClearSearch();
    }

    // 更新之前的查询引用
    previousQueryRef.current = nextValue;
  }, [setSearchQuery, searchResults, isSearchActive, clearSearchResults, viewMode, sessions, updateSession, getCurrentSession, setOpengraphData, handleClearSearch]);

  // 处理搜索提交
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      // 空查询，清理状态
      setIsSearchActive(false);
      setIsWaitingResults(false);
      setLastSearchResultCount(null);
      clearSearch();
      return;
    }

    // ✅ 第一步：先清除之前的搜索状态，避免显示旧的高亮结果
    if (viewMode === 'masonry') {
      const safeSessions = Array.isArray(sessions) ? sessions : [];

      // 收集所有 updateSession 的 Promise，确保相似度字段先被清空
      const updatePromises = safeSessions.map(session => {
        if (session && Array.isArray(session.opengraphData)) {
          const cleanedData = session.opengraphData.map(item => {
            const { similarity: _, ...rest } = item;
            return rest;
          });
          return Promise.resolve(updateSession(session.id, { opengraphData: cleanedData }));
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
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

    // ✅ 第二步：等待 React 完成状态更新和重新渲染（增加到 300ms 确保 DOM 更新完成）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // ✅ 第三步：设置等待状态（此时显示模糊效果，但不显示搜索结果）
    setIsWaitingResults(true);
    setLastSearchResultCount(null);
    
    try {
      // ✅ 第四步：执行搜索请求
      const { allSessionUrls, allSessionTabIds } = collectSessionUrlsAndTabIds();
      const filterUrls = Array.from(allSessionUrls);
      const filterTabIds = Array.from(allSessionTabIds).map(id => String(id));

      const results = await performSearch(searchQuery, calculateRadialLayout, filterUrls, filterTabIds);
      
      // ✅ 第五步：收到结果后，取消等待状态，激活搜索状态
      setIsWaitingResults(false);
      setIsSearchActive(true);
      
      if (results && results.length > 0) {
        // 双重保险：前端也进行过滤
        const filteredResults = filterResultsBySessions(results);
        setLastSearchResultCount(filteredResults.length);

        console.log('[useSearchLogic] Search results filtered:', {
          originalCount: results.length,
          filteredCount: filteredResults.length,
          removedCount: results.length - filteredResults.length
        });

        if (viewMode === 'radial') {
          // Radial 视图：只显示过滤后的结果，确保只显示 personal space 中的内容
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
          console.log('[useSearchLogic] Search completed (radial),', filteredResults.length, 'filtered results (only from personal space)');
        } else {
          // Masonry 视图：更新 sessions 中每个 item 的 similarity 字段
          // 使用过滤后的结果（只包含 sessions 中的项目）
          const safeSessions = Array.isArray(sessions) ? sessions : [];

          // 创建多个匹配键的 map，支持多种匹配方式
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

          console.log('[useSearchLogic] Search results mapping:', {
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

          console.log('[useSearchLogic] Search completed (masonry):', {
            totalResults: results.length,
            totalSessions: safeSessions.length,
            matchedItems: totalMatched,
            updatedSessions: totalUpdated
          });
        }
      } else {
        // 没有任何结果，诚实记录空态并保持原始展示
        setLastSearchResultCount(0);
        setShowOriginalImages(true);
        console.log('[useSearchLogic] Search completed with no results');
      }
    } catch (error) {
      console.error('[useSearchLogic] Search error:', error);
      setIsSearchActive(false);
      setIsWaitingResults(false);
      setLastSearchResultCount(0);
    }
  }, [searchQuery, viewMode, sessions, getCurrentSession, updateSession, setOpengraphData, setShowOriginalImages, performSearch, collectSessionUrlsAndTabIds, filterResultsBySessions, clearSearch]);

  // ===== 计算值 =====

  // 过滤搜索结果，只保留在 sessions 中的结果
  const filteredSearchResults = useMemo(() => {
    if (isSearchActive && Array.isArray(searchResults) && searchResults.length > 0) {
      return filterResultsBySessions(searchResults);
    }
    return [];
  }, [isSearchActive, searchResults, filterResultsBySessions]);

  // 是否有激活的搜索
  const hasActiveSearch = isSearchActive && filteredSearchResults.length > 0;
  // 是否需要展示“无结果”空态
  const hasNoSearchResults = isSearchActive
    && !isWaitingResults
    && lastSearchResultCount === 0
    && !!searchQuery.trim();

  // ===== ESC 键监听 =====
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isSearchActive) {
        handleClearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchActive, handleClearSearch]);

  // ===== 返回值 =====

  return {
    // 搜索状态
    searchQuery,
    setSearchQuery,
    isSearching,
    isSearchActive,
    isWaitingResults, // ✅ 新增：导出等待状态
    searchResults,
    filteredSearchResults,
    hasActiveSearch,
    hasNoSearchResults,
    lastSearchResultCount,
    
    // 搜索处理函数
    handleSearchChange,
    handleSearch,
    handleClearSearch,
    
    // 辅助函数（如果外部需要）
    collectSessionUrlsAndTabIds,
    filterResultsBySessions,
  };
};

