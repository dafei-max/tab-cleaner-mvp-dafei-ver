import { useState, useRef, useEffect } from "react";
import { searchContent } from "../shared/api";

/**
 * 搜索功能 Hook
 * 
 * @param {Array} opengraphData - OpenGraph 数据（通过 ref 访问最新值，用于本地模糊搜索兜底）
 * @returns {Object} 搜索相关的状态和方法
 */
export const useSearch = (opengraphData = []) => {
  // ✅ 修复：确保 opengraphData 是数组
  const safeOpengraphData = Array.isArray(opengraphData) ? opengraphData : [];
  // 使用 ref 保存最新的 opengraphData，避免闭包问题（用于本地模糊搜索兜底）
  const opengraphDataRef = useRef(safeOpengraphData);
  useEffect(() => {
    // ✅ 修复：确保存储的是数组
    opengraphDataRef.current = Array.isArray(opengraphData) ? opengraphData : [];
  }, [opengraphData]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  // ✅ 已移除：opengraphWithEmbeddings - 不再需要本地存储 embedding
  // const [opengraphWithEmbeddings, setOpengraphWithEmbeddings] = useState([]);
  const [searchResults, setSearchResults] = useState(null);

  // 本地模糊排序（兜底方案）
  const fuzzyRankLocally = (query, items) => {
    // ✅ 修复：添加安全检查，确保 items 是数组
    if (!items || !Array.isArray(items) || items.length === 0) {
      return [];
    }
    const q = query.toLowerCase().trim();
    const qTokens = q.split(/\s+/).filter(Boolean);
    const scored = items.map((it, idx) => {
      const text = ((it.title || it.tab_title || "") + " " + (it.description || "")).toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 3;
      for (const t of qTokens) {
        if (t && text.includes(t)) score += 1;
      }
      const titleText = (it.title || it.tab_title || "").toLowerCase();
      if (titleText.includes(q)) score += 1;
      const normalizedScore = Math.min(score / 10.0, 1.0);
      return { ...it, similarity: normalizedScore, idx };
    });
    scored.sort((a, b) => (b.similarity - a.similarity) || (a.idx - b.idx));
    return scored;
  };

  // ✅ 已移除：generateEmbeddingsForData - 不再需要本地生成 embedding
  // 后端现在负责从数据库读取和生成 embedding
  // const generateEmbeddingsForData = async (data) => {
  //   // ... 已移除的代码
  // };

  // 执行搜索
  const performSearch = async (query, calculateRadialLayout) => {
    if (!query.trim()) {
      setSearchResults(null);
      return [];
    }

    // 使用 ref 获取最新的 opengraphData（用于本地模糊搜索兜底）
    const currentOGData = opengraphDataRef.current || [];

    try {
      setIsSearching(true);
      console.log('[useSearch] Searching for:', query);
      
      // ✅ 简化：直接调用 searchContent(query)，后端从数据库读取
      const result = await searchContent(query);

      let finalList = [];
      if (result && result.ok && Array.isArray(result.results) && result.results.length > 0) {
        // ✅ 使用新的响应格式：result.results
        finalList = result.results;
        console.log('[useSearch] Found', finalList.length, 'results from database');
      } else {
        console.warn('[useSearch] Backend returned empty, using local fuzzy ranking');
        finalList = fuzzyRankLocally(query, currentOGData || []);
      }
      
      // 按相似度排序（数据库结果已经排序，但本地模糊搜索需要排序）
      finalList.sort((a, b) => {
        const simA = a.similarity ?? 0;
        const simB = b.similarity ?? 0;
        return simB - simA;
      });
      
      // 计算布局位置（如果提供了 calculateRadialLayout 回调）
      const searchResultItems = (finalList || []).map((item, index) => ({
        ...item,
        id: item.tab_id ? `og-search-${item.tab_id}` : `og-search-${index}-${Date.now()}`,
      }));
      
      let positionedResults = searchResultItems;
      if (calculateRadialLayout && typeof calculateRadialLayout === 'function') {
        positionedResults = calculateRadialLayout(searchResultItems) || searchResultItems;
        console.log('[useSearch] Applied radial layout to', positionedResults.length, 'results');
      }
      
      const finalResults = positionedResults.map((item, idx) => ({
        ...item,
        id: item.id || `og-search-${idx}-${Date.now()}`,
        x: item.x ?? 720,
        y: item.y ?? 512,
        width: item.width ?? 120,
        height: item.height ?? 120,
      }));
      
      setSearchResults(finalResults);
      console.log('[useSearch] Search completed,', finalResults.length, 'results');
      return finalResults;
    } catch (error) {
      console.error('[useSearch] Error searching:', error);
      // ✅ 出错时使用本地模糊搜索兜底
      console.warn('[useSearch] Falling back to local fuzzy search');
      const fallback = fuzzyRankLocally(query, currentOGData || []);
      fallback.sort((a, b) => {
        const simA = a.similarity ?? 0;
        const simB = b.similarity ?? 0;
        return simB - simA;
      });
      const fallbackItems = fallback.map((item, index) => ({
        ...item,
        id: item.tab_id ? `og-search-${item.tab_id}` : `og-search-${index}-${Date.now()}`,
      }));
      
      let positioned = fallbackItems;
      if (calculateRadialLayout && typeof calculateRadialLayout === 'function') {
        positioned = calculateRadialLayout(fallbackItems) || fallbackItems;
      }
      
      const finalFallback = positioned.map((item, idx) => ({
        ...item,
        id: item.id || `og-search-${idx}-${Date.now()}`,
        x: item.x ?? 720,
        y: item.y ?? 512,
        width: item.width ?? 120,
        height: item.height ?? 120,
      }));
      setSearchResults(finalFallback);
      return finalFallback;
    } finally {
      setIsSearching(false);
    }
  };

  // 清空搜索
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    console.log('[useSearch] Search cleared');
  };

  return {
    searchQuery,
    setSearchQuery,
    isSearching,
    // ✅ 已移除：opengraphWithEmbeddings - 不再需要
    // opengraphWithEmbeddings,
    searchResults,
    performSearch,
    clearSearch,
    // ✅ 已移除：generateEmbeddingsForData - 不再需要
    // generateEmbeddingsForData,
  };
};

