import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAssetUrl } from '../../shared/utils';
import './OnboardingModal.css';

/**
 * 新手教程引导弹窗
 * 在用户首次安装或刷新插件时显示
 */
export const OnboardingModal = ({ onContinue, onSkip, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  // 控制小象视频在弹窗入场动画结束后再出现/播放，减轻同时期的压力
  const [showPet, setShowPet] = useState(false);

  const handleContinue = () => {
    setIsVisible(false);
    if (onContinue) {
      onContinue();
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    if (onSkip) {
      onSkip();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="onboarding-overlay">
          {/* 主内容容器 - Overlay: 1047x708 */}
          <motion.div
            className="onboarding-container"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 0.5 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            onAnimationComplete={() => setShowPet(true)}
          >
            {/* 气泡背景层（缩放到 modal 内部作为背景） */}
            <div className="onboarding-bubble-layer">
              <img
                src={getAssetUrl('static/img/onboarding/bubble-lay.svg')}
                alt=""
                className="bubble-bg"
              />
            </div>
            {/* 关闭按钮 */}
            <button
              className="onboarding-close-button"
              onClick={handleClose}
              aria-label="关闭"
            >
              <span className="close-icon">+</span>
            </button>

            {/* 箭头（使用 Arrow.svg） */}
            <img
              src={getAssetUrl('static/img/onboarding/Arrow.svg')}
              alt=""
              className="onboarding-arrow"
            />

            {/* 文本内容区域 - textcontent: 735x312 */}
            <div className="onboarding-textcontent">
              {/* 标题 */}
              <h1 className="onboarding-title">
                欢迎来到 Tab 洗衣房
                <br />
                我是值班长 Leo
              </h1>

              {/* 描述文字 */}
              <p className="onboarding-description">
                很多 Tab 就像堆在一起的衣物，虽然开着，但并没有被有效利用。我的工作，就是帮你将暂时不用的 Tab 挂起来晾晒、收纳妥当。
                <br />
                接下来我们来试试吧～
              </p>
            </div>

            {/* Tab 示例 - 使用 Tab.svg 直接还原 Figma */}
            <div className="onboarding-tab-example">
              <img
                src={getAssetUrl('static/img/onboarding/Tab.svg')}
                alt="Tab 示例"
                className="onboarding-tab-image"
              />
            </div>

            {/* 卡片示例 - card: 108x153, left: 685px, top: 368px */}
            <div className="onboarding-card-example">
              <div className="card-glow"></div>
              <div className="card-wrapper">
                <img
                  src={getAssetUrl('static/img/onboarding/card-example.png')}
                  alt="卡片示例"
                  className="card-image"
                />
              </div>
            </div>

            {/* 按钮组 */}
            <div className="onboarding-buttons">
              {/* 跳过按钮 */}
              <button className="onboarding-skip-btn" onClick={handleSkip}>
                <img
                  src={getAssetUrl('static/img/onboarding/Polygon 3.svg')}
                  alt=""
                  className="btn-polygon"
                />
                <span className="btn-text">跳过新手教程</span>
              </button>

              {/* 继续按钮 */}
              <button className="onboarding-continue-btn" onClick={handleContinue}>
                <img
                  src={getAssetUrl('static/img/onboarding/Polygon 1 (2).svg')}
                  alt=""
                  className="btn-polygon"
                />
                <span className="btn-text">继续</span>
              </button>
            </div>

            {/* wave-hand 视频小象：在入场 scale 动画结束后再挂载/播放 */}
            {showPet && (
              <div className="onboarding-pet">
                <video
                  className="pet-video"
                  src={getAssetUrl('static/video/wave-hand.webm')}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingModal;

