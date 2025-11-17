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

  // 更新布局（带防抖）
  const updateLayout = useCallback(() => {
    if (masonryInstanceRef.current) {
      setTimeout(() => {
        masonryInstanceRef.current?.layout();
      }, MASONRY_CONFIG.layout.imageLoadDelay);
    }
  }, []);

  const debouncedUpdateLayout = useCallback(
    debounce(updateLayout, MASONRY_CONFIG.layout.debounceDelay),
    [updateLayout]
  );

  // 处理图片加载
  const handleImageLoad = useCallback((img, totalImages, loadedImagesRef) => {
    return () => {
      loadedImagesRef.current++;
      if (loadedImagesRef.current >= totalImages) {
        updateLayout();
      }
    };
  }, [updateLayout]);

  // 处理图片加载错误
  const handleImageError = useCallback((img, totalImages, loadedImagesRef) => {
    return () => {
      // 图片加载失败，使用占位图
      MASONRY_CONFIG.imageLoading.onError(img);
      loadedImagesRef.current++;
      if (loadedImagesRef.current >= totalImages) {
        updateLayout();
      }
    };
  }, []);

  // 初始化拖拽功能
  const initDraggable = useCallback((itemElement) => {
    if (!MASONRY_CONFIG.draggable.enabled) return;

    // 如果已经初始化过，跳过
    if (draggabillyInstancesRef.current.has(itemElement)) {
      return;
    }

    const draggie = new Draggabilly(itemElement, {
      handle: MASONRY_CONFIG.draggable.handle,
      axis: MASONRY_CONFIG.draggable.axis,
      containment: MASONRY_CONFIG.draggable.containment,
      cursor: MASONRY_CONFIG.draggable.cursor,
      opacity: MASONRY_CONFIG.draggable.opacity,
    });

    // 绑定 Masonry 拖拽（使用 Packery 的 bindDraggabillyEvents 方法）
    // 注意：Masonry 本身不支持拖拽，但可以通过 Draggabilly 实现
    // 当拖拽时，需要手动更新 Masonry 布局
    draggie.on('dragMove', () => {
      // 拖拽过程中实时更新布局
      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.layout();
      }
    });

    // 存储拖拽实例
    draggabillyInstancesRef.current.set(itemElement, draggie);

    // 拖拽开始
    draggie.on('dragStart', () => {
      itemElement.style.zIndex = MASONRY_CONFIG.draggable.zIndex;
    });

    // 拖拽结束
    draggie.on('dragEnd', () => {
      itemElement.style.zIndex = '';
      // 拖拽结束后重新布局
      updateLayout();
    });
  }, [updateLayout]);

  useEffect(() => {
    if (viewMode === 'masonry' && opengraphData && opengraphData.length > 0) {
      // 等待 DOM 更新，确保 masonryRef.current 已绑定
      const initMasonry = () => {
        if (!masonryRef.current) {
          console.warn('[usePackeryLayout] masonryRef.current is null, retrying...');
          setTimeout(initMasonry, 100);
          return;
        }

        console.log('[usePackeryLayout] Initializing Masonry with Packery drag with', opengraphData.length, 'items');
        
        // 销毁旧的实例
        if (masonryInstanceRef.current) {
          // 销毁所有拖拽实例
          draggabillyInstancesRef.current.forEach((draggie) => {
            draggie.destroy();
          });
          draggabillyInstancesRef.current.clear();

          masonryInstanceRef.current.destroy();
          masonryInstanceRef.current = null;
        }

        // 清理旧的图片事件监听器
        imageLoadHandlersRef.current.forEach(({ loadHandler, errorHandler }, img) => {
          img.removeEventListener('load', loadHandler);
          img.removeEventListener('error', errorHandler);
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

        console.log('[usePackeryLayout] Initializing with columnWidth:', columnWidth, 'gutter:', gutter);

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
        const images = masonryRef.current.querySelectorAll('.masonry-item img');
        const totalImages = images.length;
        const loadedImagesRef = { current: 0 };

        if (totalImages === 0) {
          // 如果没有图片，立即布局并初始化拖拽
          updateLayout();
          setTimeout(() => {
            const items = masonryRef.current.querySelectorAll('.masonry-item');
            items.forEach(initDraggable);
          }, 100);
        } else {
          // 重置计数器
          loadedImagesRef.current = 0;

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
                  const items = masonryRef.current.querySelectorAll('.masonry-item');
                  items.forEach(initDraggable);
                }, 100);
              }
            } else {
              // 图片未加载，添加监听器
              img.addEventListener('load', loadHandler, { once: true });
              img.addEventListener('error', errorHandler, { once: true });

              // 设置超时处理
              setTimeout(() => {
                if (!img.complete || img.naturalHeight === 0) {
                  errorHandler();
                }
              }, MASONRY_CONFIG.imageLoading.timeout);
            }
          });
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

        // 监听新元素添加（用于动态添加卡片）
        const observer = new MutationObserver(() => {
          const items = masonryRef.current.querySelectorAll('.masonry-item');
          items.forEach((item) => {
            if (!draggabillyInstancesRef.current.has(item)) {
              initDraggable(item);
            }
          });
        });

        observer.observe(masonryRef.current, {
          childList: true,
          subtree: true,
        });
      };
      
      // 清理函数
      const cleanup = () => {
        // 清理图片事件监听器
        imageLoadHandlersRef.current.forEach(({ loadHandler, errorHandler }, img) => {
          img.removeEventListener('load', loadHandler);
          img.removeEventListener('error', errorHandler);
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

        // 销毁 Masonry 实例
        if (masonryInstanceRef.current) {
          masonryInstanceRef.current.destroy();
          masonryInstanceRef.current = null;
        }
      };
      
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

