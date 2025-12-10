import { useState, useRef, useEffect, useMemo } from "react";
import { searchContent } from "../shared/api";
import Fuse from "fuse.js";

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

  // 🆕 Fuse.js 配置（高级模糊搜索）
  const fuseOptions = useMemo(() => ({
    keys: [
      { name: 'title', weight: 2 },
      { name: 'tab_title', weight: 1.5 },
      { name: 'description', weight: 1 },
      { name: 'image_caption', weight: 1.8 },  // AI 生成的图片描述
      { name: 'style_tags', weight: 1.2 },     // 风格标签
      { name: 'object_tags', weight: 1.2 },    // 物体标签
      { name: 'dominant_colors', weight: 0.8 }, // 颜色
      { name: 'site_name', weight: 0.5 },
      { name: 'url', weight: 0.3 },
    ],
    threshold: 0.4,        // 模糊匹配阈值（0=精确，1=全匹配）
    includeScore: true,    // 返回匹配分数
    ignoreLocation: true,  // 不考虑位置
    minMatchCharLength: 2, // 最小匹配字符数
    shouldSort: true,      // 自动排序
  }), []);

  // 🆕 从查询中提取颜色关键词（中英文）
  const extractQueryColors = (queryText) => {
    const queryLower = queryText.toLowerCase();
    const queryColors = [];
    
    // 中文颜色映射
    const colorMap = {
      '红色': ['red', 'crimson', 'firebrick', 'tomato', 'lightsalmon', 'scarlet', 'burgundy'],
      '绿色': ['green', 'emerald', 'olive', 'lime', 'forestgreen', 'limegreen', 'lightgreen', 'palegreen'],
      '蓝色': ['blue', 'azure', 'navy', 'cobalt', 'dodgerblue', 'steelblue', 'lightskyblue', 'lightblue'],
      '黄色': ['yellow', 'gold', 'amber', 'lemon'],
      '橙色': ['orange', 'darkorange', 'tangerine', 'coral', 'peachpuff'],
      '紫色': ['purple', 'violet', 'lavender', 'plum', 'blueviolet', 'mediumpurple', 'mediumorchid'],
      '粉色': ['pink', 'deeppink', 'hotpink', 'lightpink', 'rose', 'blush', 'magenta'],
      '黑色': ['black', 'dark', 'ebony'],
      '白色': ['white', 'ivory', 'snow', 'whitesmoke'],
      '灰色': ['gray', 'grey', 'silver', 'charcoal', 'darkgray', 'lightgray'],
      '棕色': ['brown', 'saddlebrown', 'sienna', 'tan'],
    };
    
    // 检查中文颜色
    for (const [cnColor, enColors] of Object.entries(colorMap)) {
      if (queryText.includes(cnColor)) {
        queryColors.push(...enColors);
      }
    }
    
    // 检查英文颜色（直接匹配）
    const allEnColors = Object.values(colorMap).flat();
    for (const enColor of allEnColors) {
      if (queryLower.includes(enColor)) {
        queryColors.push(enColor);
      }
    }
    
    return [...new Set(queryColors)]; // 去重
  };

  // 🆕 按颜色和相似度排序结果
  const sortResultsByColorAndSimilarity = (results, queryColors) => {
    const hasMatchingColor = (item) => {
      if (queryColors.length === 0) return true; // 查询没有颜色，不筛选
      const itemColors = (item.dominant_colors || []).map(c => c.toLowerCase());
      return queryColors.some(qc => itemColors.includes(qc.toLowerCase()));
    };
    
    return [...results].sort((a, b) => {
      const simA = a.similarity ?? 0;
      const simB = b.similarity ?? 0;
      const simDiff = simB - simA;
      
      // 如果查询有颜色，优先显示匹配颜色的结果
      if (queryColors.length > 0) {
        const aMatches = hasMatchingColor(a);
        const bMatches = hasMatchingColor(b);
        
        // 匹配颜色的优先
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        
        // 都匹配或都不匹配时，按相似度排序
        if (Math.abs(simDiff) < 0.05) {
          if (aMatches && !bMatches) return -1;
          if (!aMatches && bMatches) return 1;
        }
      }
      
      return simDiff; // 按相似度排序
    });
  };

  // 🆕 计算布局并格式化结果
  const calculateLayoutForResults = (results, calculateRadialLayout) => {
    const searchResultItems = (results || []).map((item, index) => ({
      ...item,
      id: item.tab_id ? `og-search-${item.tab_id}` : `og-search-${index}-${Date.now()}`,
    }));
    
    let positionedResults = searchResultItems;
    if (calculateRadialLayout && typeof calculateRadialLayout === 'function') {
      positionedResults = calculateRadialLayout(searchResultItems) || searchResultItems;
    }
    
    return positionedResults.map((item, idx) => ({
      ...item,
      id: item.id || `og-search-${idx}-${Date.now()}`,
      x: item.x ?? 720,
      y: item.y ?? 512,
      width: item.width ?? 120,
      height: item.height ?? 120,
    }));
  };

  // 🆕 增强版本地模糊搜索（使用 Fuse.js）
  const fuzzyRankLocally = (query, items) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return [];
    }
    
    const q = query.trim();
    if (!q) return items;
    
    // 预处理数据：将数组字段转为字符串便于 Fuse.js 搜索
    const processedItems = items.map((it, idx) => ({
      ...it,
      _idx: idx,
      style_tags: (it.style_tags || []).join(' '),
      object_tags: (it.object_tags || []).join(' '),
      dominant_colors: (it.dominant_colors || []).join(' '),
    }));
    
    const fuse = new Fuse(processedItems, fuseOptions);
    const results = fuse.search(q);
    
    // 转换结果格式
    return results.map(result => ({
      ...result.item,
      // 恢复原始数组字段
      style_tags: items[result.item._idx]?.style_tags || [],
      object_tags: items[result.item._idx]?.object_tags || [],
      dominant_colors: items[result.item._idx]?.dominant_colors || [],
      // Fuse.js score 越低越好，转换为 similarity（越高越好）
      similarity: 1 - (result.score || 0),
      idx: result.item._idx,
    }));
  };

  // ✅ 已移除：generateEmbeddingsForData - 不再需要本地生成 embedding
  // 后端现在负责从数据库读取和生成 embedding
  // const generateEmbeddingsForData = async (data) => {
  //   // ... 已移除的代码
  // };

  // 执行搜索
  const performSearch = async (query, calculateRadialLayout, filterUrls = null, filterTabIds = null) => {
    if (!query.trim()) {
      setSearchResults(null);
      return [];
    }

    // 使用 ref 获取最新的 opengraphData（用于本地模糊搜索兜底）
    const currentOGData = opengraphDataRef.current || [];

    try {
      setIsSearching(true);
      console.log('[useSearch] Searching for:', query);
      
      // 🆕 步骤1：先立即执行本地搜索，快速显示结果
      const localResults = fuzzyRankLocally(query, currentOGData || []);
      console.log('[useSearch] 🔍 Local search found', localResults.length, 'results');
      
      // 立即显示本地搜索结果
      let localDisplayed = false;
      if (localResults.length > 0) {
        const queryColors = extractQueryColors(query);
        const sortedLocalResults = sortResultsByColorAndSimilarity(localResults, queryColors);
        const positionedLocal = calculateLayoutForResults(sortedLocalResults, calculateRadialLayout);
        setSearchResults(positionedLocal);
        localDisplayed = true;
        console.log('[useSearch] ✅ Local results displayed immediately');
      }
      
      // 🆕 步骤2：异步执行 AI 搜索，完成后更新结果（不阻塞 UI）
      // 注意：不 await，让函数立即返回，但保持 isSearching = true
      searchContent(query, 20, filterUrls, filterTabIds).then(result => {
        let aiResults = [];
        if (result && result.ok && Array.isArray(result.results) && result.results.length > 0) {
          aiResults = result.results;
          console.log('[useSearch] 🤖 AI search found', aiResults.length, 'results from database');
        } else {
          console.log('[useSearch] 🤖 AI search returned empty, keeping local results');
          setIsSearching(false);
          return; // AI 搜索无结果，保持本地搜索结果
        }
        
        // 如果有 AI 结果，使用 AI 结果（通常更准确）
        const queryColors = extractQueryColors(query);
        const sortedResults = sortResultsByColorAndSimilarity(aiResults, queryColors);
        const positioned = calculateLayoutForResults(sortedResults, calculateRadialLayout);
        setSearchResults(positioned);
        setIsSearching(false);
        console.log('[useSearch] ✅ AI results displayed and updated');
      }).catch(error => {
        console.error('[useSearch] AI search failed:', error);
        setIsSearching(false);
        // AI 搜索失败，保持本地搜索结果
      });
      
      // 返回本地搜索结果（立即返回，不等待 AI）
      // 注意：isSearching 保持为 true，直到 AI 搜索完成
      if (localDisplayed) {
        const queryColors = extractQueryColors(query);
        const sortedLocalResults = sortResultsByColorAndSimilarity(localResults, queryColors);
        const finalResults = calculateLayoutForResults(sortedLocalResults, calculateRadialLayout);
        return finalResults;
      }
      
      // 如果没有本地结果，等待 AI 搜索完成
      const result = await searchContent(query, 20, filterUrls, filterTabIds);
      let finalList = [];
      if (result && result.ok && Array.isArray(result.results) && result.results.length > 0) {
        finalList = result.results;
        console.log('[useSearch] 🤖 AI search found', finalList.length, 'results');
      } else {
        console.log('[useSearch] No results found');
        setIsSearching(false);
        return [];
      }
      
      const queryColors = extractQueryColors(query);
      const sortedResults = sortResultsByColorAndSimilarity(finalList, queryColors);
      const finalResults = calculateLayoutForResults(sortedResults, calculateRadialLayout);
      setSearchResults(finalResults);
      setIsSearching(false);
      return finalResults;
    } catch (error) {
      console.error('[useSearch] Error searching:', error);
      setIsSearching(false);
      // ✅ 出错时使用本地模糊搜索兜底
      console.warn('[useSearch] Falling back to local fuzzy search');
      const fallback = fuzzyRankLocally(query, currentOGData || []);
      const queryColors = extractQueryColors(query);
      const sortedFallback = sortResultsByColorAndSimilarity(fallback, queryColors);
      const finalFallback = calculateLayoutForResults(sortedFallback, calculateRadialLayout);
      setSearchResults(finalFallback);
      return finalFallback;
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

