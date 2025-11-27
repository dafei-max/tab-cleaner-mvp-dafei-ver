import React from 'react';
import { SpotlightItem } from 'react-spotlight-cursor';

/**
 * 测试 Spotlight 效果组件
 * 用于验证 react-spotlight-cursor 是否能照亮组件
 */
export const SpotlightTest = () => {
  return (
    <div style={{ padding: '50px', background: '#f0f0f0', minHeight: '200px' }}>
      <h2>Spotlight 测试</h2>
      
      {/* 测试 SpotlightItem 组件 */}
      <SpotlightItem
        style={{
          padding: '30px',
          background: '#fff',
          borderRadius: '10px',
          margin: '20px 0',
          cursor: 'pointer',
        }}
        backgroundBlur={10}
        backgroundOpacity={0.5}
        showBackground={true}
        opacity={0.8}
        scaleOnTap={true}
        gradient="radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,200,255,0.8) 50%, transparent 100%)"
      >
        <h3>悬停我试试 Spotlight 效果</h3>
        <p>这个组件应该会在鼠标悬停时显示聚光灯效果</p>
      </SpotlightItem>

      {/* 另一个测试项 */}
      <SpotlightItem
        style={{
          padding: '30px',
          background: '#e0e0e0',
          borderRadius: '10px',
          margin: '20px 0',
          cursor: 'pointer',
        }}
        backgroundBlur={15}
        backgroundOpacity={0.6}
        showBackground={true}
        opacity={0.9}
        scaleOnTap={true}
      >
        <h3>第二个测试项</h3>
        <p>使用默认的彩虹渐变效果</p>
      </SpotlightItem>
    </div>
  );
};



