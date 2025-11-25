import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './GradualBlur.css';

/**
 * GradualBlur 组件
 * 基于 reactbits.dev 的渐进模糊效果实现
 * 支持多层模糊叠加，创建平滑的渐变效果
 */
export const GradualBlur = ({
  position = 'bottom',
  strength = 2,
  height = '6rem',
  width,
  divCount = 5,
  exponential = false,
  curve = 'linear',
  opacity = 1,
  animated = false,
  duration = '0.35',
  easing = 'ease-out',
  hoverIntensity,
  target = 'parent',
  preset,
  responsive = false,
  zIndex = 1000,
  onAnimationComplete,
  className = '',
  style = {},
}) => {
  const containerRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(!animated);

  // 处理预设配置
  useEffect(() => {
    if (preset) {
      // 预设配置可以在这里应用
    }
  }, [preset]);

  // 处理滚动动画
  useEffect(() => {
    if (animated === 'scroll' && containerRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsVisible(true);
            }
          });
        },
        { threshold: 0.1 }
      );

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    } else if (animated === true) {
      setIsVisible(true);
    }
  }, [animated]);

  // GSAP 动画
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    const layers = containerRef.current.querySelectorAll('.gradual-blur-layer');
    
    if (animated) {
      gsap.fromTo(
        layers,
        { opacity: 0 },
        {
          opacity: opacity,
          duration: parseFloat(duration),
          ease: easing,
          stagger: 0.05,
          onComplete: onAnimationComplete,
        }
      );
    } else {
      gsap.set(layers, { opacity: opacity });
    }
  }, [isVisible, animated, opacity, duration, easing, onAnimationComplete]);

  // 平滑缓动函数 - 消除硬边界
  const smoothStep = (t) => {
    return t * t * (3 - 2 * t);
  };

  // 超平滑缓动函数 - 用于更自然的过渡
  const smootherStep = (t) => {
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  // 计算每层的模糊强度 - 优化过渡消除硬边界
  const calculateBlurStrength = (index) => {
    const totalLayers = divCount;
    // 使用更平滑的进度计算，从 0 开始而不是从 1/totalLayers
    const progress = index / (totalLayers - 1);
    
    let normalizedProgress;
    if (exponential) {
      // 使用更平滑的指数曲线，避免底部突然出现
      normalizedProgress = Math.pow(progress, 1.8);
    } else {
      normalizedProgress = progress;
    }

    // 应用超平滑曲线
    let curveProgress = normalizedProgress;
    if (curve === 'bezier') {
      // 使用 smootherStep 让过渡更自然
      curveProgress = smootherStep(normalizedProgress);
    } else if (curve === 'ease-in') {
      curveProgress = normalizedProgress * normalizedProgress;
    }

    const baseStrength = strength * (hoverIntensity && isHovered ? hoverIntensity : 1);
    // 使用更平滑的强度分布，避免硬边界
    return baseStrength * curveProgress * 7;
  };

  // 计算每层的透明度 - 优化过渡消除硬边界
  const calculateOpacity = (index) => {
    const totalLayers = divCount;
    // 使用更平滑的进度计算
    const progress = index / (totalLayers - 1);
    
    let normalizedProgress = progress;
    if (exponential) {
      // 指数级透明度分布
      normalizedProgress = Math.pow(progress, 1.6);
    }
    
    if (curve === 'bezier') {
      // 使用超平滑曲线
      const smoothProgress = smootherStep(normalizedProgress);
      return opacity * smoothProgress;
    } else if (curve === 'ease-in') {
      return opacity * (normalizedProgress * normalizedProgress);
    }
    // 使用平滑曲线
    const smoothProgress = smoothStep(normalizedProgress);
    return opacity * smoothProgress;
  };

  // 根据位置设置样式
  const getPositionStyles = () => {
    const isVertical = position === 'top' || position === 'bottom';
    const baseStyle = {
      position: target === 'page' ? 'fixed' : 'absolute',
      zIndex: target === 'page' ? zIndex + 100 : zIndex,
      ...style,
    };

    if (position === 'bottom') {
      return {
        ...baseStyle,
        bottom: 0,
        left: 0,
        right: 0,
        width: width || '100%',
        height: height,
      };
    } else if (position === 'top') {
      return {
        ...baseStyle,
        top: 0,
        left: 0,
        right: 0,
        width: width || '100%',
        height: height,
      };
    } else if (position === 'left') {
      return {
        ...baseStyle,
        left: 0,
        top: 0,
        bottom: 0,
        width: width || height,
        height: '100%',
      };
    } else if (position === 'right') {
      return {
        ...baseStyle,
        right: 0,
        top: 0,
        bottom: 0,
        width: width || height,
        height: '100%',
      };
    }

    return baseStyle;
  };

  // 生成渐变方向
  const getGradientDirection = () => {
    if (position === 'bottom') return 'to top';
    if (position === 'top') return 'to bottom';
    if (position === 'left') return 'to right';
    if (position === 'right') return 'to left';
    return 'to top';
  };

  return (
    <div
      ref={containerRef}
      className={`gradual-blur ${className}`}
      style={getPositionStyles()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {Array.from({ length: divCount }).map((_, index) => {
        const blurStrength = calculateBlurStrength(index);
        const layerOpacity = calculateOpacity(index);
        const gradientDirection = getGradientDirection();
        
        return (
          <div
            key={index}
            className="gradual-blur-layer"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backdropFilter: `blur(${blurStrength}px)`,
              WebkitBackdropFilter: `blur(${blurStrength}px)`,
              opacity: layerOpacity,
              // 使用更柔和的渐变，消除硬边界 - 从完全透明开始
              background: `linear-gradient(${gradientDirection}, 
                rgba(227, 235, 245, ${Math.min(layerOpacity * 0.5, 0.9)}) 0%, 
                rgba(227, 235, 245, ${Math.min(layerOpacity * 0.25, 0.45)}) 40%, 
                rgba(227, 235, 245, ${Math.min(layerOpacity * 0.1, 0.2)}) 70%, 
                transparent 100%)`,
              pointerEvents: 'none',
              transition: 'opacity 0.3s ease-out',
              // 添加 mask 让边缘更柔和
              maskImage: `linear-gradient(${gradientDirection}, 
                rgba(0, 0, 0, ${layerOpacity}) 0%, 
                rgba(0, 0, 0, ${layerOpacity * 0.7}) 50%, 
                transparent 100%)`,
              WebkitMaskImage: `linear-gradient(${gradientDirection}, 
                rgba(0, 0, 0, ${layerOpacity}) 0%, 
                rgba(0, 0, 0, ${layerOpacity * 0.7}) 50%, 
                transparent 100%)`,
            }}
          />
        );
      })}
    </div>
  );
};

export default GradualBlur;
