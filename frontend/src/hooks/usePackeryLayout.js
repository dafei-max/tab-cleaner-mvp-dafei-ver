import { useEffect, useRef, useCallback } from "react";
import Masonry from "masonry-layout";
import Draggabilly from "draggabilly";
import { MASONRY_CONFIG } from "../config/masonryConfig";

/**
 * 防抖函数
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Hook for managing Masonry layout with Packery drag functionality
 * @param {string} viewMode - Current view mode ('masonry' or 'radial')
 * @param {Array} opengraphData - Array of OpenGraph items
 * @returns {Object} - { masonryRef, masonryInstanceRef }
 */
export const usePackeryLayout = (viewMode, opengraphData) => {
  const masonryRef = useRef(null);
  const masonryInstanceRef = useRef(null);
  const draggabillyInstancesRef = useRef(new Map()); // 存储每个卡片的拖拽实例
  const imageLoadHandlersRef = useRef(new Map()); // 存储图片加载事件处理器
  const resizeHandlerRef = useRef(null);
  const draggableFailedRef = useRef(false); // ✅ 修复：标记拖拽功能是否失败
  const isUserScrollingRef = useRef(false); // ✅ 标记用户是否正在滚动
  const scrollRestoreTimerRef = useRef(null); // ✅ 滚动恢复定时器
  const scrollHandlersRef = useRef([]); // ✅ 存储滚动事件处理器，用于清理

  // 更新布局（带防抖，并保存/恢复滚动位置）
  const updateLayout = useCallback(() => {
    if (masonryInstanceRef.current) {
      // ✅ 如果用户正在滚动，不恢复滚动位置（避免跳回）
      if (isUserScrollingRef.current) {
        masonryInstanceRef.current?.layout();
        return;
      }
      
      // ✅ 保存当前滚动位置（支持 window 和容器滚动）
      let savedScrollY = 0;
      let savedScrollTop = 0;
      let scrollContainer = null;
      
      if (typeof window !== 'undefined') {
        savedScrollY = window.scrollY || window.pageYOffset || 0;
      }
      
      // 查找最近的滚动容器
      if (masonryRef.current) {
        let parent = masonryRef.current.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
              style.overflow === 'auto' || style.overflow === 'scroll') {
            scrollContainer = parent;
            savedScrollTop = parent.scrollTop || 0;
            break;
          }
          parent = parent.parentElement;
        }
      }
      
      setTimeout(() => {
        masonryInstanceRef.current?.layout();
        
        // ✅ 恢复滚动位置（仅在用户未滚动时恢复，使用 requestAnimationFrame 确保在布局完成后恢复）
        requestAnimationFrame(() => {
          // 再次检查用户是否正在滚动
          if (isUserScrollingRef.current) {
            return;
          }
          
          if (typeof window !== 'undefined' && savedScrollY > 0) {
            window.scrollTo(0, savedScrollY);
          }
          if (scrollContainer && savedScrollTop > 0) {
            scrollContainer.scrollTop = savedScrollTop;
          }
        });
      }, MASONRY_CONFIG.layout.imageLoadDelay);
    } else {
      // console.warn(`[DEBUG-MASONRY] ❌ 尝试更新布局，但实例不存在`); // ✅ 已注释：用于定位搜索问题
    }
  }, []);

  const debouncedUpdateLayout = useCallback(
    debounce(updateLayout, MASONRY_CONFIG.layout.debounceDelay),
    [updateLayout]
  );

  // 处理图片加载
  const handleImageLoad = useCallback((img, totalImages, loadedImagesRef) => {
    return () => {
      // ✅ 修复：添加空值检查
      if (!loadedImagesRef || !loadedImagesRef.current) return;
      loadedImagesRef.current++;
      if (loadedImagesRef.current >= totalImages && totalImages > 0) {
        updateLayout();
      }
    };
  }, [updateLayout]);

  // 处理图片加载错误
  const handleImageError = useCallback((img, totalImages, loadedImagesRef) => {
    return () => {
      // ✅ 修复：添加空值检查
      if (!loadedImagesRef || !loadedImagesRef.current) return;
      // 图片加载失败，使用占位图
      if (img && MASONRY_CONFIG.imageLoading && MASONRY_CONFIG.imageLoading.onError) {
        try {
          MASONRY_CONFIG.imageLoading.onError(img);
        } catch (error) {
          console.error('[usePackeryLayout] Error in onError handler:', error);
        }
      }
      loadedImagesRef.current++;
      if (loadedImagesRef.current >= totalImages && totalImages > 0) {
        updateLayout();
      }
    };
  }, [updateLayout]);

  // 初始化拖拽功能
  const initDraggable = useCallback((itemElement) => {
    // ✅ 修复：如果之前失败过，不再尝试初始化
    if (draggableFailedRef.current) {
      return;
    }

    // ✅ 修复：添加更严格的空值检查
    if (!itemElement || !MASONRY_CONFIG.draggable || !MASONRY_CONFIG.draggable.enabled) {
      return;
    }

    // 如果已经初始化过，跳过
    if (draggabillyInstancesRef.current.has(itemElement)) {
      return;
    }

    try {
      // ✅ 修复：先验证配置项并设置默认值
      const draggableConfig = {
        handle: MASONRY_CONFIG.draggable.handle || null,
        axis: MASONRY_CONFIG.draggable.axis || null,
        containment: MASONRY_CONFIG.draggable.containment !== undefined ? MASONRY_CONFIG.draggable.containment : false,
        cursor: MASONRY_CONFIG.draggable.cursor || 'move',
        opacity: MASONRY_CONFIG.draggable.opacity !== undefined ? MASONRY_CONFIG.draggable.opacity : 1,
      };

      // ✅ 修复：只添加有效的配置项（null 值不传入）
      const finalConfig = {};
      if (draggableConfig.handle !== null && draggableConfig.handle !== undefined) {
        finalConfig.handle = draggableConfig.handle;
      }
      if (draggableConfig.axis !== null && draggableConfig.axis !== undefined) {
        finalConfig.axis = draggableConfig.axis;
      }
      if (draggableConfig.containment !== false) {
        finalConfig.containment = draggableConfig.containment;
      }
      finalConfig.cursor = draggableConfig.cursor;
      finalConfig.opacity = draggableConfig.opacity;

      // ✅ 修复：添加调试日志
      console.log('[usePackeryLayout] Initializing Draggabilly with config:', finalConfig);

      const draggie = new Draggabilly(itemElement, finalConfig);

    // 绑定 Masonry 拖拽（使用 Packery 的 bindDraggabillyEvents 方法）
    // 注意：Masonry 本身不支持拖拽，但可以通过 Draggabilly 实现
    // 当拖拽时，需要手动更新 Masonry 布局
    draggie.on('dragMove', () => {
      // 拖拽过程中实时更新布局
      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.layout();
      }
    });

    // 拖拽开始
    draggie.on('dragStart', () => {
      if (itemElement) {
        itemElement.style.zIndex = MASONRY_CONFIG.draggable.zIndex;
      }
    });

    // 拖拽结束
    draggie.on('dragEnd', () => {
      if (itemElement) {
        itemElement.style.zIndex = '';
      }
      // 拖拽结束后重新布局
      updateLayout();
    });

      // 存储拖拽实例
      draggabillyInstancesRef.current.set(itemElement, draggie);
    } catch (error) {
      console.error('[usePackeryLayout] Error initializing Draggabilly:', error);
      console.error('[usePackeryLayout] Element:', itemElement);
      console.error('[usePackeryLayout] Config:', MASONRY_CONFIG.draggable);
      
      // ✅ 修复：设置失败标记，防止后续继续尝试
      draggableFailedRef.current = true;
      console.warn('[usePackeryLayout] Draggable functionality disabled due to initialization error');
      
      // ✅ 修复：不抛出错误，让页面继续渲染（只是没有拖拽功能）
    }
  }, [updateLayout]);

  useEffect(() => {
    // ✅ 修复：添加更严格的空值检查
    if (viewMode === 'masonry' && opengraphData && Array.isArray(opengraphData) && opengraphData.length > 0) {
      // 等待 DOM 更新，确保 masonryRef.current 已绑定
      const initMasonry = () => {
        if (!masonryRef.current) {
          console.warn('[usePackeryLayout] masonryRef.current is null, retrying...');
          setTimeout(initMasonry, 100);
          return;
        }

        // ✅ 修复：确保 opengraphData 存在且是数组
        const safeDataLength = (opengraphData && Array.isArray(opengraphData)) ? opengraphData.length : 0;
        // console.log('[usePackeryLayout] Initializing Masonry with Packery drag with', safeDataLength, 'items'); // ✅ 已注释：用于定位搜索问题
        
        // 销毁旧的实例
        if (masonryInstanceRef.current) {
          // 销毁所有拖拽实例
          draggabillyInstancesRef.current.forEach((draggie) => {
            try {
              if (draggie && typeof draggie.destroy === 'function') {
                draggie.destroy();
              }
            } catch (error) {
              console.error('[usePackeryLayout] Error destroying Draggabilly instance:', error);
            }
          });
          draggabillyInstancesRef.current.clear();

          try {
            if (masonryInstanceRef.current && typeof masonryInstanceRef.current.destroy === 'function') {
              masonryInstanceRef.current.destroy();
            }
          } catch (error) {
            console.error('[usePackeryLayout] Error destroying Masonry instance:', error);
          }
          masonryInstanceRef.current = null;
        }

        // 清理旧的图片事件监听器
        imageLoadHandlersRef.current.forEach((handlerData, img) => {
          if (img && handlerData) {
            try {
              if (handlerData.loadHandler) {
                img.removeEventListener('load', handlerData.loadHandler);
              }
              if (handlerData.errorHandler) {
                img.removeEventListener('error', handlerData.errorHandler);
              }
            } catch (error) {
              console.error('[usePackeryLayout] Error removing image event listeners:', error);
            }
          }
        });
        imageLoadHandlersRef.current.clear();

        // 使用配置计算列宽和间距（必须是固定像素值，不能是百分比）
        const columnWidth = MASONRY_CONFIG.columns.getColumnWidth();
        const gutter = MASONRY_CONFIG.columns.gutter;

        // 确保 columnWidth 是数字类型（固定像素值）
        if (typeof columnWidth !== 'number' || columnWidth <= 0) {
          console.error('[usePackeryLayout] Invalid columnWidth:', columnWidth);
          return;
        }

        // console.log('[usePackeryLayout] Initializing with columnWidth:', columnWidth, 'gutter:', gutter); // ✅ 已注释：用于定位搜索问题

        // 创建隐藏的列宽元素用于 Masonry
        let columnWidthElement = masonryRef.current.querySelector('.masonry-column-width');
        if (!columnWidthElement) {
          columnWidthElement = document.createElement('div');
          columnWidthElement.className = 'masonry-column-width';
          columnWidthElement.style.visibility = 'hidden';
          columnWidthElement.style.position = 'absolute';
          masonryRef.current.appendChild(columnWidthElement);
        }
        columnWidthElement.style.width = `${columnWidth}px`;

        // 初始化 Masonry 实例（基础布局）
        masonryInstanceRef.current = new Masonry(masonryRef.current, {
          itemSelector: MASONRY_CONFIG.masonry.itemSelector,
          columnWidth: '.masonry-column-width',
          percentPosition: MASONRY_CONFIG.masonry.percentPosition,
          gutter: gutter,
          fitWidth: MASONRY_CONFIG.masonry.fitWidth,  // 启用 fitWidth 需要固定像素值
          transitionDuration: MASONRY_CONFIG.masonry.transitionDuration,
          stagger: MASONRY_CONFIG.masonry.stagger,
        });

        // 处理图片加载
        const images = masonryRef.current ? masonryRef.current.querySelectorAll('.masonry-item img') : [];
        const totalImages = images ? images.length : 0;
        const loadedImagesRef = { current: 0 };

        if (totalImages === 0) {
          // 如果没有图片，立即布局并初始化拖拽
          updateLayout();
          setTimeout(() => {
            if (masonryRef.current) {
              const items = masonryRef.current.querySelectorAll('.masonry-item');
              if (items && items.length > 0) {
                items.forEach((item) => {
                  if (item) {
                    initDraggable(item);
                  }
                });
              }
            }
          }, 100);
        } else {
          // 重置计数器
          loadedImagesRef.current = 0;

          if (images && images.length > 0) {
            images.forEach((img) => {
            // 创建事件处理器
            const loadHandler = handleImageLoad(img, totalImages, loadedImagesRef);
            const errorHandler = handleImageError(img, totalImages, loadedImagesRef);

            // 存储处理器以便后续清理
            imageLoadHandlersRef.current.set(img, { loadHandler, errorHandler });

            // 添加事件监听
            if (img.complete && img.naturalHeight !== 0) {
              // 图片已加载完成
              loadedImagesRef.current++;
                if (loadedImagesRef.current >= totalImages) {
                updateLayout();
                // 所有图片加载完成后初始化拖拽
                setTimeout(() => {
                  if (masonryRef.current) {
                    const items = masonryRef.current.querySelectorAll('.masonry-item');
                    if (items && items.length > 0) {
                      items.forEach((item) => {
                        if (item) {
                          initDraggable(item);
                        }
                      });
                    }
                  }
                }, 100);
              }
            } else {
              // 图片未加载，添加监听器
              img.addEventListener('load', loadHandler, { once: true });
              img.addEventListener('error', errorHandler, { once: true });

              // 设置超时处理
              setTimeout(() => {
                if (img && (!img.complete || img.naturalHeight === 0)) {
                  try {
                    errorHandler();
                  } catch (error) {
                    console.error('[usePackeryLayout] Error in image error handler:', error);
                  }
                }
              }, MASONRY_CONFIG.imageLoading.timeout || 5000);
            }
          });
          }
        }

        // 监听窗口大小变化（响应式）
        const handleResize = debounce(() => {
          if (masonryInstanceRef.current && masonryRef.current) {
            const newColumnWidth = MASONRY_CONFIG.columns.getColumnWidth();
            const newGutter = MASONRY_CONFIG.columns.gutter;
            
            // 更新列宽元素
            const columnWidthElement = masonryRef.current.querySelector('.masonry-column-width');
            if (columnWidthElement) {
              columnWidthElement.style.width = `${newColumnWidth}px`;
            }
            
            // 更新 Masonry 配置
            masonryInstanceRef.current.gutter = newGutter;
            
            // 重新布局
            masonryInstanceRef.current.layout();
          }
        }, MASONRY_CONFIG.layout.resizeDebounceDelay);

        window.addEventListener('resize', handleResize);
        resizeHandlerRef.current = handleResize;

        // ✅ 修复：监听新元素添加，并通知 Masonry 重新布局
        const observer = new MutationObserver((mutations) => {
          try {
            if (!masonryRef.current) return;
            
            // ✅ 调试：记录 MutationObserver 触发
            let totalAddedNodes = 0;
            mutations.forEach(mutation => {
              totalAddedNodes += mutation.addedNodes.length;
            });
            
            if (totalAddedNodes > 0) {
              // console.log(`[DEBUG-MASONRY] 🔄 MutationObserver 检测到 ${totalAddedNodes} 个新节点`); // ✅ 已注释：用于定位搜索问题
            }
            
            // 1. 检查是否有真正的节点添加
            let hasNewItems = false;
            mutations.forEach(mutation => {
              if (mutation.addedNodes.length > 0) {
                hasNewItems = true;
              }
            });

            // 2. 初始化新元素的拖拽，并收集新元素
            const items = masonryRef.current.querySelectorAll('.masonry-item');
            const newItems = [];
            
            if (items && items.length > 0) {
              items.forEach((item) => {
                if (item && !draggabillyInstancesRef.current.has(item)) {
                  initDraggable(item);
                  // ✅ 检查是否是 Masonry 的新元素
                  if (masonryInstanceRef.current) {
                    try {
                      // 尝试获取 Masonry 已知的元素列表
                      const knownItems = masonryInstanceRef.current.getItemElements 
                        ? masonryInstanceRef.current.getItemElements() 
                        : [];
                      // 如果 Masonry 不知道这个元素，标记为新元素
                      if (!knownItems.includes(item)) {
                        newItems.push(item);
                      }
                    } catch (error) {
                      // 如果获取失败，假设是新元素（更安全）
                      newItems.push(item);
                    }
                  }
                }
              });
            }

            // 3. ✅ 关键修复：通知 Masonry 有新元素加入并重新布局
            if (masonryInstanceRef.current && (hasNewItems || newItems.length > 0)) {
              // console.log(`[DEBUG-MASONRY] 🔧 准备更新 Masonry:
              //   - 检测到新节点: ${hasNewItems}
              //   - 新元素数量: ${newItems.length}
              //   - 当前所有元素数量: ${items.length}`); // ✅ 已注释：用于定位搜索问题
              
              // 延迟执行，确保 DOM 完全更新
              setTimeout(() => {
                if (masonryInstanceRef.current) {
                  try {
                    // 如果有新元素，使用 appended 方法添加
                    if (newItems.length > 0 && masonryInstanceRef.current.appended) {
                      // console.log(`[DEBUG-MASONRY] ➕ 使用 appended 添加 ${newItems.length} 个新元素`); // ✅ 已注释：用于定位搜索问题
                      masonryInstanceRef.current.appended(newItems);
                    } else {
                      // 如果没有 appended 方法或没有新元素，直接重新布局
                      // console.log(`[DEBUG-MASONRY] 🔄 直接调用 layout() 重新布局`); // ✅ 已注释：用于定位搜索问题
                      masonryInstanceRef.current.layout();
                    }
                    
                    // 布局后再次检查容器高度
                    if (masonryRef.current) {
                      // console.log(`[DEBUG-MASONRY] ✅ 布局更新后:
                      //   - offsetHeight: ${masonryRef.current.offsetHeight}px
                      //   - scrollHeight: ${masonryRef.current.scrollHeight}px`); // ✅ 已注释：用于定位搜索问题
                    }
                  } catch (error) {
                    // 如果 appended 失败，直接重新布局
                    // console.warn('[DEBUG-MASONRY] ⚠️ Masonry update failed, using layout instead:', error); // ✅ 已注释：用于定位搜索问题
                    if (masonryInstanceRef.current) {
                      masonryInstanceRef.current.layout();
                    }
                  }
                }
              }, 50); // 延迟 50ms，确保 DOM 更新完成
            }
          } catch (error) {
            console.error('[usePackeryLayout] Error in MutationObserver:', error);
          }
        });

        if (masonryRef.current) {
          try {
            observer.observe(masonryRef.current, {
              childList: true,
              subtree: true,
            });
          } catch (error) {
            console.error('[usePackeryLayout] Error observing mutations:', error);
          }
        }
      };
      
      // 清理函数
      const cleanup = () => {
        // 清理图片事件监听器
        imageLoadHandlersRef.current.forEach((handlerData, img) => {
          if (img && handlerData) {
            try {
              if (handlerData.loadHandler) {
                img.removeEventListener('load', handlerData.loadHandler);
              }
              if (handlerData.errorHandler) {
                img.removeEventListener('error', handlerData.errorHandler);
              }
            } catch (error) {
              console.error('[usePackeryLayout] Error removing event listeners in cleanup:', error);
            }
          }
        });
        imageLoadHandlersRef.current.clear();

        // 销毁所有拖拽实例
        draggabillyInstancesRef.current.forEach((draggie) => {
          draggie.destroy();
        });
        draggabillyInstancesRef.current.clear();

        // 清理窗口大小监听
        if (resizeHandlerRef.current) {
          window.removeEventListener('resize', resizeHandlerRef.current);
          resizeHandlerRef.current = null;
        }

        // 清理滚动监听
        scrollHandlersRef.current.forEach(({ element, handler }) => {
          try {
            element.removeEventListener('scroll', handler);
          } catch (e) {
            console.warn('[usePackeryLayout] Failed to remove scroll listener:', e);
          }
        });
        scrollHandlersRef.current = [];
        
        if (scrollRestoreTimerRef.current) {
          clearTimeout(scrollRestoreTimerRef.current);
          scrollRestoreTimerRef.current = null;
        }
        isUserScrollingRef.current = false;

        // 销毁 Masonry 实例
        if (masonryInstanceRef.current) {
          masonryInstanceRef.current.destroy();
          masonryInstanceRef.current = null;
        }
      };
      
      // ✅ 添加滚动事件监听器，检测用户滚动
      const handleScroll = () => {
        isUserScrollingRef.current = true;
        
        // 清除之前的定时器
        if (scrollRestoreTimerRef.current) {
          clearTimeout(scrollRestoreTimerRef.current);
        }
        
        // 滚动停止后 150ms 才允许恢复滚动位置
        scrollRestoreTimerRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      };
      
      // 监听 window 和滚动容器的滚动事件
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', handleScroll, { passive: true });
        scrollHandlersRef.current.push({ element: window, handler: handleScroll });
      }
      
      // 查找滚动容器并监听
      if (masonryRef.current) {
        let parent = masonryRef.current.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
              style.overflow === 'auto' || style.overflow === 'scroll') {
            parent.addEventListener('scroll', handleScroll, { passive: true });
            scrollHandlersRef.current.push({ element: parent, handler: handleScroll });
            break;
          }
          parent = parent.parentElement;
        }
      }
      
      initMasonry();
      
      return cleanup;
    } else {
      console.log('[usePackeryLayout] Skipping initialization:', {
        viewMode,
        hasRef: !!masonryRef.current,
        dataLength: opengraphData?.length || 0,
      });
    }
  }, [viewMode, opengraphData, handleImageLoad, handleImageError, updateLayout, initDraggable]);

  // 当视图模式切换时，更新 Masonry 布局
  useEffect(() => {
    if (viewMode === 'masonry' && masonryInstanceRef.current) {
      updateLayout();
    }
  }, [viewMode, updateLayout]);

  return { masonryRef, masonryInstanceRef };
};

