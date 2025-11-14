import { useEffect, useRef } from "react";
import Masonry from "masonry-layout";

/**
 * Hook for managing Masonry layout
 * @param {string} viewMode - Current view mode ('masonry' or 'radial')
 * @param {Array} opengraphData - Array of OpenGraph items
 * @returns {Object} - { masonryRef, masonryInstanceRef }
 */
export const useMasonryLayout = (viewMode, opengraphData) => {
  const masonryRef = useRef(null);
  const masonryInstanceRef = useRef(null);

  useEffect(() => {
    if (viewMode === 'masonry' && masonryRef.current && opengraphData.length > 0) {
      // 销毁旧的实例
      if (masonryInstanceRef.current) {
        masonryInstanceRef.current.destroy();
      }

      // 计算每列的宽度（确保一行最多 5 个卡片）
      const containerWidth = 1440 - 40; // 减去左右 padding
      const gutter = 16;
      const maxColumns = 5;
      const columnWidth = (containerWidth - (gutter * (maxColumns - 1))) / maxColumns;

      // 创建一个隐藏的列宽元素用于 Masonry
      let columnWidthElement = masonryRef.current.querySelector('.masonry-column-width');
      if (!columnWidthElement) {
        columnWidthElement = document.createElement('div');
        columnWidthElement.className = 'masonry-column-width';
        columnWidthElement.style.width = `${columnWidth}px`;
        columnWidthElement.style.visibility = 'hidden';
        columnWidthElement.style.position = 'absolute';
        masonryRef.current.appendChild(columnWidthElement);
      } else {
        columnWidthElement.style.width = `${columnWidth}px`;
      }

      // 初始化新的 Masonry 实例
      masonryInstanceRef.current = new Masonry(masonryRef.current, {
        itemSelector: '.masonry-item',
        columnWidth: '.masonry-column-width',
        percentPosition: false,
        gutter: gutter,
        fitWidth: true, // 居中显示
      });

      // 当所有图片加载完成后重新布局
      const images = masonryRef.current.querySelectorAll('.masonry-item img');
      let loadedCount = 0;
      const totalImages = images.length;

      if (totalImages === 0) {
        // 如果没有图片，立即布局
        masonryInstanceRef.current.layout();
      } else {
        images.forEach((img) => {
          if (img.complete) {
            loadedCount++;
            if (loadedCount === totalImages) {
              masonryInstanceRef.current.layout();
            }
          } else {
            img.addEventListener('load', () => {
              loadedCount++;
              if (loadedCount === totalImages) {
                masonryInstanceRef.current.layout();
              }
            });
          }
        });
      }

      return () => {
        if (masonryInstanceRef.current) {
          masonryInstanceRef.current.destroy();
          masonryInstanceRef.current = null;
        }
      };
    }
  }, [viewMode, opengraphData]);

  // 当视图模式切换时，更新 Masonry 布局
  useEffect(() => {
    if (viewMode === 'masonry' && masonryInstanceRef.current) {
      masonryInstanceRef.current.layout();
    }
  }, [viewMode]);

  return { masonryRef, masonryInstanceRef };
};

