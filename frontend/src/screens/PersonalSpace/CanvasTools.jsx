import React, { useState, useRef, useEffect } from "react";

/**
 * 画布工具组件
 * 包含绘画、套索、文字工具
 */
export const CanvasTools = ({ canvasRef, activeTool, onLassoSelect, selectedIds }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawPath, setCurrentDrawPath] = useState([]); // 当前正在绘制的路径
  const [drawPaths, setDrawPaths] = useState([]); // 所有已保存的绘画路径
  const [lassoPath, setLassoPath] = useState([]);
  const [isLassoActive, setIsLassoActive] = useState(false);
  const [textElements, setTextElements] = useState([]);
  const [currentText, setCurrentText] = useState(null);
  const canvas = canvasRef?.current;
  const svgRef = useRef(null);

  // 从 localStorage 加载数据
  // 注意：刷新页面时清空绘画历史，只保留文字元素
  useEffect(() => {
    try {
      // 清空绘画历史（刷新页面时）
      localStorage.removeItem('canvas_draw_paths');
      setDrawPaths([]);
      
      // 保留文字元素（如果需要也清空文字，可以取消注释下面两行）
      const savedTextElements = localStorage.getItem('canvas_text_elements');
      if (savedTextElements) {
        setTextElements(JSON.parse(savedTextElements));
      }
    } catch (e) {
      console.error('[CanvasTools] Failed to load from localStorage:', e);
    }
  }, []);

  // 保存绘画路径到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('canvas_draw_paths', JSON.stringify(drawPaths));
    } catch (e) {
      console.error('[CanvasTools] Failed to save draw paths:', e);
    }
  }, [drawPaths]);

  // 保存文字元素到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('canvas_text_elements', JSON.stringify(textElements));
    } catch (e) {
      console.error('[CanvasTools] Failed to save text elements:', e);
    }
  }, [textElements]);

  // 绘画工具
  const handleDrawStart = (e) => {
    if (activeTool !== 'draw') return;
    e.preventDefault();
    e.stopPropagation();
    setIsDrawing(true);
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentDrawPath([{ x, y }]);
    console.log('[Draw] Start drawing at:', x, y);
  };

  const handleDrawMove = (e) => {
    if (activeTool !== 'draw' || !isDrawing) return;
    e.preventDefault();
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentDrawPath(prev => {
      const newPath = [...prev, { x, y }];
      console.log('[Draw] Path length:', newPath.length);
      return newPath;
    });
  };

  const handleDrawEnd = () => {
    if (activeTool === 'draw') {
      setIsDrawing(false);
      // 保存绘画路径 - 使用函数式更新确保获取最新值
      setCurrentDrawPath(currentPath => {
        if (currentPath && currentPath.length > 1) {
          const pathToSave = [...currentPath];
          console.log('[Draw] Saving path with', pathToSave.length, 'points', pathToSave);
          setDrawPaths(prev => {
            const newPaths = [...prev, pathToSave];
            console.log('[Draw] Total paths after save:', newPaths.length);
            return newPaths;
          });
        }
        return []; // 清空当前路径
      });
    }
  };

  // 套索工具 - 开始自由绘制
  const handleLassoStart = (e) => {
    if (activeTool !== 'lasso') return;
    e.preventDefault();
    e.stopPropagation();
    setIsLassoActive(true);
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // 初始化路径，从第一个点开始
    setLassoPath([{ x, y }]);
    console.log('[Lasso] Start drawing at:', x, y);
  };

  const handleLassoMove = (e) => {
    if (activeTool !== 'lasso' || !isLassoActive) return;
    e.preventDefault();
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // 自由绘制：持续添加点形成路径
    setLassoPath(prev => {
      const newPath = [...prev, { x, y }];
      // 每 10 个点记录一次日志，避免日志过多
      if (newPath.length % 10 === 0) {
        console.log('[Lasso] Path length:', newPath.length);
      }
      return newPath;
    });
  };

  const handleLassoEnd = () => {
    if (activeTool === 'lasso' && isLassoActive) {
      // 使用函数式更新获取最新的 lassoPath
      setLassoPath(currentPath => {
        // 只在松开鼠标时检测并选中图片
        if (currentPath && currentPath.length > 2 && onLassoSelect) {
          // 闭合路径（连接起点和终点）
          const closedPath = [...currentPath, currentPath[0]];
          console.log('[Lasso] Selecting with path:', closedPath.length, 'points');
          // 立即调用选择回调
          onLassoSelect(closedPath);
        } else {
          console.log('[Lasso] Path too short or no callback:', currentPath?.length, !!onLassoSelect);
        }
        // 清空路径（延迟一下让用户看到最终结果）
        setTimeout(() => {
          setLassoPath([]);
        }, 100);
        return currentPath; // 先保留路径，让用户看到最终结果
      });
      setIsLassoActive(false);
    }
  };

  // 文字工具
  const handleTextClick = (e) => {
    if (activeTool !== 'text') return;
    
    // 如果已经有一个正在输入的文本框，不创建新的
    if (currentText) return;
    
    // 如果点击的是已有的文字元素，不创建新的
    if (e.target.closest('.canvas-text-element')) return;
    // 如果点击的是输入框，不创建新的
    if (e.target.closest('input')) return;
    // 如果点击的是工具按钮，不创建
    if (e.target.closest('.tool-button-wrapper')) return;
    
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 创建文字输入框
    const textId = `text-${Date.now()}`;
    console.log('[Text] Creating text input at:', x, y);
    setCurrentText({ id: textId, x, y, text: '' });
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
  };

  const handleTextConfirm = (text) => {
    if (currentText && text.trim()) {
      setTextElements(prev => [...prev, { ...currentText, text }]);
    }
    setCurrentText(null);
  };

  // 删除文字元素
  const handleDeleteText = (textId) => {
    setTextElements(prev => prev.filter(el => el.id !== textId));
  };

  // 事件监听
  useEffect(() => {
    if (!canvas || !activeTool) return;

    const handleMouseDown = (e) => {
      // 排除点击按钮的情况
      if (e.target.closest('.tool-button-wrapper')) return;
      // 排除点击文字输入框的情况
      if (e.target.closest('input')) return;
      if (activeTool === 'draw') handleDrawStart(e);
      if (activeTool === 'lasso') handleLassoStart(e);
      if (activeTool === 'text') handleTextClick(e);
    };

    const handleMouseMove = (e) => {
      if (activeTool === 'draw' && isDrawing) handleDrawMove(e);
      if (activeTool === 'lasso' && isLassoActive) handleLassoMove(e);
    };

    const handleMouseUp = (e) => {
      if (activeTool === 'draw' && isDrawing) {
        handleDrawEnd();
      }
      if (activeTool === 'lasso' && isLassoActive) {
        handleLassoEnd();
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    if (activeTool === 'draw' || activeTool === 'lasso') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeTool, isDrawing, isLassoActive, canvas]);

  // 绘制 SVG 路径
  const getPathString = (path) => {
    if (path.length < 2) return '';
    return path.map((point, i) => 
      i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    ).join(' ');
  };

  return (
    <>
      {/* SVG 层用于绘制路径 - 相对于 canvas 定位 */}
      {/* 注意：SVG 本身不接收事件，只用于显示。事件由 canvas 处理 */}
      <svg
        ref={svgRef}
        className="canvas-tools-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none', // SVG 不阻挡事件，让底层元素可以交互
          zIndex: 50,
          overflow: 'visible',
        }}
      >
        {/* 已保存的绘画路径 */}
        {drawPaths.length > 0 && drawPaths.map((path, index) => {
          const pathString = getPathString(path);
          console.log(`[Draw] Rendering saved path ${index}:`, pathString.substring(0, 50));
          return (
            <path
              key={`draw-${index}`}
              d={pathString}
              stroke="#61caff"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          );
        })}
        
        {/* 当前正在绘制的路径 */}
        {activeTool === 'draw' && currentDrawPath.length > 1 && (
          <path
            d={getPathString(currentDrawPath)}
            stroke="#61caff"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        
        {/* 套索路径 - 自由形状 */}
        {activeTool === 'lasso' && lassoPath.length > 1 && (
          <path
            d={`${getPathString(lassoPath)} ${lassoPath.length > 2 ? 'Z' : ''}`}
            stroke="#61caff"
            strokeWidth="2"
            fill="rgba(97, 202, 255, 0.15)"
            strokeDasharray="5,5"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* 文字元素（可拖拽） */}
      {textElements.map(textEl => (
        <DraggableText
          key={textEl.id}
          id={textEl.id}
          x={textEl.x}
          y={textEl.y}
          text={textEl.text}
          onUpdate={(newX, newY) => {
            setTextElements(prev => prev.map(el => 
              el.id === textEl.id ? { ...el, x: newX, y: newY } : el
            ));
          }}
          onDelete={() => handleDeleteText(textEl.id)}
        />
      ))}

      {/* 文字输入框 */}
      {currentText && activeTool === 'text' && (
        <TextInput
          x={currentText.x}
          y={currentText.y}
          onConfirm={handleTextConfirm}
          onCancel={() => setCurrentText(null)}
        />
      )}
    </>
  );
};

/**
 * 文字输入组件
 */
const TextInput = ({ x, y, onConfirm, onCancel }) => {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // 延迟聚焦，确保输入框已经渲染
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e) => {
    e.stopPropagation(); // 先阻止事件冒泡
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onConfirm(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡，避免触发画布点击
  };

  const handleChange = (e) => {
    e.stopPropagation();
    setText(e.target.value);
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 1000, // 提高 z-index，确保在最上层
        pointerEvents: 'auto', // 确保可以接收事件
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 延迟处理 blur，避免与点击事件冲突
          setTimeout(() => {
            if (text.trim()) {
              onConfirm(text);
            } else {
              onCancel();
            }
          }, 200);
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{
          fontFamily: /[\u4e00-\u9fa5]/.test(text)
            ? '"FZLanTingYuanS-R-GB-Regular", sans-serif'
            : '"SF Pro Display-Regular", sans-serif',
          fontSize: '16px',
          padding: '4px 8px',
          border: '2px solid #61caff',
          borderRadius: '4px',
          outline: 'none',
          minWidth: '150px',
          backgroundColor: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'auto',
        }}
        placeholder="输入文字..."
        autoFocus
      />
    </div>
  );
};

/**
 * 可拖拽的文字元素
 */
const DraggableText = ({ id, x, y, text, onUpdate, onDelete }) => {
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showDelete, setShowDelete] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // 只处理左键
    e.stopPropagation();
    
    const rect = textRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const canvas = textRef.current?.closest('.canvas');
      if (!canvas) return;
      
      const canvasRect = canvas.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - dragOffset.x;
      const newY = e.clientY - canvasRect.top - dragOffset.y;
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging && onUpdate) {
        onUpdate(position.x, position.y);
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, position, onUpdate]);

  return (
    <div
      ref={textRef}
      className="canvas-text-element"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        fontFamily: /[\u4e00-\u9fa5]/.test(text) 
          ? '"FZLanTingYuanS-R-GB-Regular", sans-serif'
          : '"SF Pro Display-Regular", sans-serif',
        fontSize: '16px',
        color: '#000',
        zIndex: 60,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        padding: '4px 8px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '4px',
        border: '1px solid #61caff',
        boxShadow: '0 2px 8px rgba(97, 202, 255, 0.2)',
        whiteSpace: 'nowrap',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <span>{text}</span>
      {showDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            marginLeft: '8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#ff6b6b',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default CanvasTools;

