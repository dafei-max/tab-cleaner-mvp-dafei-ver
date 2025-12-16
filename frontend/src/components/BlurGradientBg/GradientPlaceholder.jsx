import React, { useEffect, useRef } from 'react';
import { getColorFromUrl, getPlaceholderText } from '../../utils/imagePlaceholder';
import { getAssetUrl } from '../../shared/utils';

// 动态导入 BlurGradientBg（UMD 格式）
let BlurGradientBg = null;
let isLoading = false;
let loadPromise = null;

const loadBlurGradientBg = async () => {
  if (BlurGradientBg) return BlurGradientBg;
  if (isLoading && loadPromise) return loadPromise;
  
  isLoading = true;
  loadPromise = new Promise((resolve) => {
    // 检查是否已经加载到全局
    if (window.Color4Bg?.BlurGradientBg) {
      BlurGradientBg = window.Color4Bg.BlurGradientBg;
      isLoading = false;
      resolve(BlurGradientBg);
      return;
    }
    
    // 使用 script 标签加载 UMD 模块
    // 使用 getAssetUrl 获取正确的资源路径（支持扩展环境和开发环境）
    const script = document.createElement('script');
    script.src = getAssetUrl('static/js/BlurGradientBg.min.js');
    script.onload = () => {
      BlurGradientBg = window.Color4Bg?.BlurGradientBg;
      isLoading = false;
      resolve(BlurGradientBg || null);
    };
    script.onerror = () => {
      console.warn('[GradientPlaceholder] Failed to load BlurGradientBg script');
      isLoading = false;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  
  return loadPromise;
};

/**
 * 渐变占位符组件
 * 使用 BlurGradientBg 替代纯色背景
 */
const GradientPlaceholder = ({ og, width = 200, height = 150, className, style }) => {
  const containerRef = useRef(null);
  const bgInstanceRef = useRef(null);
  const containerIdRef = useRef(`gradient-placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (!containerRef.current) return;

    // 给容器添加唯一 ID（BlurGradientBg 需要字符串 ID）
    const containerId = containerIdRef.current;
    containerRef.current.id = containerId;

    const initGradient = async () => {
      try {
        const BlurGradientBgClass = await loadBlurGradientBg();
        if (!BlurGradientBgClass) {
          console.warn('[GradientPlaceholder] BlurGradientBg not loaded, using solid color fallback');
          // 如果加载失败，使用纯色背景作为 fallback
          containerRef.current.style.backgroundColor = getColorFromUrl(og?.url || 'default');
          return;
        }

        // 从 URL 生成颜色，转换为蓝色系渐变
        const baseColor = getColorFromUrl(og?.url || 'default');
        
        // 将单个颜色转换为蓝色系渐变（4个颜色）
        const colors = generateBlueGradientColors(baseColor);
        
        console.log('[GradientPlaceholder] Initializing with colors:', colors, 'containerId:', containerId, 'baseColor:', baseColor);
        
        // 验证颜色数组
        if (!colors || colors.length < 4) {
          console.error('[GradientPlaceholder] Invalid colors array:', colors);
          containerRef.current.style.backgroundColor = baseColor;
          return;
        }
        
        // 确保容器有尺寸
        const containerRect = containerRef.current.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) {
          console.warn('[GradientPlaceholder] Container has zero size, waiting...');
          // 等待容器渲染完成
          setTimeout(() => {
            initGradient();
          }, 100);
          return;
        }
        
        // 创建 BlurGradientBg 实例
        // 注意：dom 参数需要是 DOM 元素的 ID（字符串）
        // colors_num 参数指定需要 4 个颜色
        // 注意：构造函数会自动调用 start()，但我们需要确保 loop 属性正确设置
        const bgInstance = new BlurGradientBgClass({
          dom: containerId, // 传入容器 ID 字符串
          colors: colors,
          loop: true, // 启用循环动画
          seed: hashString(og?.url || 'default'),
        }, 4); // 第二个参数：colors_num = 4
        
        // 确保 loop 属性正确设置（构造函数可能已经调用了 start，但我们需要确保 loop 正确）
        bgInstance.loop = true;
        
        bgInstanceRef.current = bgInstance;
        
        console.log('[GradientPlaceholder] Instance created, colors:', colors, 'loop:', bgInstance.loop, 'container size:', containerRect.width, 'x', containerRect.height);
        
        // 验证动画是否正在运行
        setTimeout(() => {
          if (bgInstanceRef.current) {
            console.log('[GradientPlaceholder] ✅ Animation status:', {
              frame: bgInstanceRef.current.frame,
              loop: bgInstanceRef.current.loop,
              hasUpdate: typeof bgInstanceRef.current._update === 'function',
              canvas: bgInstanceRef.current.gl?.canvas ? 'exists' : 'missing'
            });
            
            // 如果 frame 没有增加，说明动画没有运行，尝试手动启动
            const initialFrame = bgInstanceRef.current.frame;
            setTimeout(() => {
              if (bgInstanceRef.current && bgInstanceRef.current.frame === initialFrame) {
                console.warn('[GradientPlaceholder] Animation not running, attempting to restart...');
                try {
                  bgInstanceRef.current.start();
                } catch (e) {
                  console.error('[GradientPlaceholder] Failed to restart animation:', e);
                }
              }
            }, 500);
          }
        }, 1000);
      } catch (error) {
        console.error('[GradientPlaceholder] Error initializing gradient:', error);
        // 如果出错，使用纯色背景作为 fallback
        containerRef.current.style.backgroundColor = getColorFromUrl(og?.url || 'default');
      }
    };

    initGradient();

    return () => {
      // 清理
      if (bgInstanceRef.current) {
        try {
          bgInstanceRef.current.destroy();
        } catch (e) {
          console.warn('[GradientPlaceholder] Error destroying bg instance:', e);
        }
        bgInstanceRef.current = null;
      }
    };
  }, [og?.url, width, height]);

  const text = getPlaceholderText(og);
  const displayText = text.length > 25 ? text.substring(0, 25) + '...' : text;
  const baseColor = getColorFromUrl(og?.url || 'default');
  const lightColors = ['#E3F2FD', '#60D7FD'];
  const isLightColor = lightColors.includes(baseColor);
  const textColor = isLightColor ? '#424242' : '#FFFFFF';
  const textShadow = isLightColor 
    ? '0 1px 2px rgba(255,255,255,0.5)' 
    : '0 1px 2px rgba(0,0,0,0.3)';
  
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        overflow: 'hidden',
        borderRadius: '0 0 8px 8px',
        backgroundColor: baseColor, // 设置 fallback 背景色
        ...style,
      }}
    >
      {/* 文字层（在渐变背景上方） */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          textAlign: 'center',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize: displayText.length > 20 ? '12px' : '14px',
          fontWeight: '500',
          color: textColor,
          textShadow: textShadow,
          padding: '0 8px',
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}
      >
        {displayText}
      </div>
    </div>
  );
};

/**
 * 将单个颜色转换为蓝色系渐变（4个颜色）
 * 基于基础颜色生成和谐的蓝色系渐变
 */
function generateBlueGradientColors(baseColor) {
  // 解析基础颜色
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 227, g: 242, b: 253 }; // 默认浅蓝色
  };

  const rgbToHex = (r, g, b) => {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  };

  const rgb = hexToRgb(baseColor);
  
  // 生成更和谐的蓝色系渐变
  // 使用 HSL 思路：保持色相（蓝色），调整亮度和饱和度
  // 简化版：直接基于 RGB 生成渐变，但确保蓝色通道始终最高
  
  // 计算蓝色强度（蓝色通道相对于其他通道的强度）
  const blueIntensity = rgb.b / Math.max(rgb.r, rgb.g, 1);
  
  // 生成 4 个颜色，从浅到深
  // 策略：保持蓝色通道最高，调整整体亮度
  const gradientColors = [
    // 颜色 0：最浅（几乎白色，带蓝色调）
    {
      r: Math.min(255, rgb.r + 50),
      g: Math.min(255, rgb.g + 50),
      b: Math.min(255, rgb.b + 60)
    },
    // 颜色 1：浅色（基础色的浅色版本）
    {
      r: Math.min(255, rgb.r + 20),
      g: Math.min(255, rgb.g + 20),
      b: Math.min(255, rgb.b + 30)
    },
    // 颜色 2：基础色
    {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b
    },
    // 颜色 3：深色（基础色的深色版本）
    {
      r: Math.max(0, rgb.r - 30),
      g: Math.max(0, rgb.g - 30),
      b: Math.max(0, rgb.b - 15)
    }
  ];
  
  // 确保所有颜色都是有效的蓝色系（蓝色通道最高或接近最高）
  gradientColors.forEach(c => {
    const maxOther = Math.max(c.r, c.g);
    if (c.b < maxOther) {
      // 如果蓝色不是最高的，增强蓝色通道
      c.b = Math.min(255, maxOther + 30);
    }
    // 确保蓝色通道至少是其他通道的 1.2 倍
    if (c.b < maxOther * 1.2) {
      c.b = Math.min(255, Math.round(maxOther * 1.2));
    }
  });
  
  return gradientColors.map(c => rgbToHex(c.r, c.g, c.b));
}

/**
 * 字符串哈希函数（用于生成 seed）
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export default GradientPlaceholder;

