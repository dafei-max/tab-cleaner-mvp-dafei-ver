import { useState } from "react";

/**
 * 撤销/重做历史记录 Hook
 * 
 * @returns {Object} { history, historyIndex, addToHistory, undo, redo, canUndo, canRedo }
 */
export const useHistory = (maxHistorySize = 50) => {
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const addToHistory = (action) => {
    setHistory(prev => {
      // 如果当前不在历史记录末尾，删除后面的记录
      const newHistory = prev.slice(0, historyIndex + 1);
      // 添加新操作
      newHistory.push(action);
      // 限制历史记录数量
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        setHistoryIndex(newHistory.length - 1);
      } else {
        setHistoryIndex(newHistory.length - 1);
      }
      return newHistory;
    });
  };

  const canUndo = history.length > 0 && historyIndex >= 0;
  const canRedo = history.length > 0 && historyIndex < history.length - 1;

  return {
    history,
    historyIndex,
    addToHistory,
    canUndo,
    canRedo,
    setHistoryIndex,
  };
};






