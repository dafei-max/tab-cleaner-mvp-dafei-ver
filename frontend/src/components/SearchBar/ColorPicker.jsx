import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sketch } from '@uiw/react-color';

/**
 * 颜色选择器组件（Eagle 风格）
 * 使用 @uiw/react-color 的专业颜色选择器 + Delta E 颜色距离算法
 * 🆕 适配 IndexedDB：颜色筛选基于从 IndexedDB 图片中提取的 dominant_colors
 */
export const ColorPicker = ({ 
  isVisible, 
  onColorSelect, 
  onClose,
  selectedColor = null,
}) => {
  // 预设常用颜色（用户也可以自定义选择）
  const presetColors = [
    { name: '红色', hex: '#E53935' },
    { name: '橙色', hex: '#FB8C00' },
    { name: '黄色', hex: '#FDD835' },
    { name: '绿色', hex: '#43A047' },
    { name: '青色', hex: '#00ACC1' },
    { name: '蓝色', hex: '#1E88E5' },
    { name: '紫色', hex: '#8E24AA' },
    { name: '粉色', hex: '#EC407A' },
    { name: '棕色', hex: '#8D6E63' },
    { name: '灰色', hex: '#78909C' },
    { name: '黑色', hex: '#37474F' },
    { name: '白色', hex: '#F5F5F5' },
  ];

  // 🆕 使用 react-color 的颜色状态
  const [color, setColor] = useState(selectedColor?.hex || '#FDD835');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // 当 selectedColor 变化时，同步更新内部颜色状态
  React.useEffect(() => {
    if (selectedColor?.hex) {
      setColor(selectedColor.hex);
    }
  }, [selectedColor]);

  const handleColorClick = (color) => {
    // 直接传递 hex 值，让父组件处理筛选
    onColorSelect({ hex: color.hex, name: color.name });
    setShowColorPicker(false);
  };

  const handleColorChange = (color) => {
    setColor(color.hex);
  };

  const handleColorPickerConfirm = () => {
    onColorSelect({ hex: color, name: '自定义' });
    setShowColorPicker(false);
  };

  const handleClearFilter = () => {
    onColorSelect(null);
    setShowColorPicker(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="color-picker-container"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            padding: '12px',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,248,255,0.98) 100%)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid rgba(164, 223, 255, 0.5)',
            zIndex: 1000,
            minWidth: '220px',
            backdropFilter: 'blur(10px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}>
            <span style={{ 
              fontSize: '13px', 
              fontWeight: 600, 
              color: '#333',
              fontFamily: '"SF Pro Display", -apple-system, sans-serif',
            }}>
              🎨 按颜色筛选
            </span>
            {selectedColor && (
              <motion.button
                onClick={handleClearFilter}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  fontSize: '11px',
                  color: '#666',
                  background: 'rgba(0,0,0,0.05)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                清除
              </motion.button>
            )}
          </div>
          
          {/* 预设颜色网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '8px',
            marginBottom: '12px',
          }}>
            {presetColors.map((color) => (
              <motion.button
                key={color.name}
                onClick={() => handleColorClick(color)}
                title={color.name}
                whileHover={{ scale: 1.15, y: -2 }}
                whileTap={{ scale: 0.9 }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: color.hex,
                  border: selectedColor?.hex === color.hex 
                    ? '3px solid #333' 
                    : '2px solid rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  boxShadow: selectedColor?.hex === color.hex
                    ? `0 0 0 2px ${color.hex}, 0 2px 8px rgba(0,0,0,0.2)`
                    : '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'box-shadow 0.2s',
                }}
              />
            ))}
          </div>
          
          {/* 🆕 使用 react-color 的专业颜色选择器 */}
          <div style={{
            paddingTop: '8px',
            borderTop: '1px solid rgba(0,0,0,0.08)',
          }}>
            <motion.button
              onClick={() => setShowColorPicker(!showColorPicker)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                fontSize: '12px',
                color: '#333',
                background: 'rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '6px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: showColorPicker ? '12px' : 0,
              }}
            >
              <span style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: color,
                border: '1px solid rgba(0,0,0,0.1)',
              }} />
              <span>{showColorPicker ? '收起颜色选择器' : '打开专业颜色选择器'}</span>
            </motion.button>
            
            {showColorPicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginBottom: '12px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                <Sketch
                  color={color}
                  onChange={handleColorChange}
                  style={{
                    width: '100%',
                  }}
                />
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '8px',
                  background: 'rgba(0,0,0,0.02)',
                }}>
                  <motion.button
                    onClick={handleColorPickerConfirm}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      color: '#fff',
                      background: color,
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                  >
                    使用此颜色筛选
                  </motion.button>
                  <motion.button
                    onClick={() => setShowColorPicker(false)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      background: 'rgba(0,0,0,0.05)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    取消
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
          
          {/* 当前选中提示 */}
          {selectedColor && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(0,0,0,0.08)',
                fontSize: '12px',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                backgroundColor: selectedColor.hex,
                border: '1px solid rgba(0,0,0,0.1)',
              }} />
              <span>筛选: <strong>{selectedColor.name}</strong> ({selectedColor.hex})</span>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * 🆕 计算两个颜色的 Delta E 距离（CIE76）
 * 值越小越相似，0 = 完全相同
 * @param {string} hex1 - 颜色1 (#RRGGBB)
 * @param {string} hex2 - 颜色2 (#RRGGBB)
 * @returns {number} - Delta E 值
 */
export function colorDistance(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  
  if (!rgb1 || !rgb2) return 999;
  
  const lab1 = rgbToLab(rgb1);
  const lab2 = rgbToLab(rgb2);
  
  // Delta E (CIE76)
  const deltaL = lab1.l - lab2.l;
  const deltaA = lab1.a - lab2.a;
  const deltaB = lab1.b - lab2.b;
  
  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

/**
 * Hex 转 RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * RGB 转 Lab（用于 Delta E 计算）
 */
function rgbToLab(rgb) {
  // RGB to XYZ
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;
  
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
  r *= 100;
  g *= 100;
  b *= 100;
  
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  
  // XYZ to Lab
  let xn = x / 95.047;
  let yn = y / 100.0;
  let zn = z / 108.883;
  
  xn = xn > 0.008856 ? Math.pow(xn, 1/3) : (7.787 * xn) + (16 / 116);
  yn = yn > 0.008856 ? Math.pow(yn, 1/3) : (7.787 * yn) + (16 / 116);
  zn = zn > 0.008856 ? Math.pow(zn, 1/3) : (7.787 * zn) + (16 / 116);
  
  return {
    l: (116 * yn) - 16,
    a: 500 * (xn - yn),
    b: 200 * (yn - zn)
  };
}

export default ColorPicker;