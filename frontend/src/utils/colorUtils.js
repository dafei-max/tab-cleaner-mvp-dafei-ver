/**
 * 颜色工具函数
 * 用于颜色提取、转换和比较
 */

/**
 * 从 Base64 图片中提取主色调
 * @param {string} base64Image - Base64 格式的图片 (data:image/...)
 * @param {boolean} suppressWarnings - 是否抑制警告（默认 true）
 * @returns {Promise<string[]>} - 主色调数组 (Hex 格式)
 */
export function extractColorsFromBase64(base64Image, suppressWarnings = true) {
  return new Promise((resolve) => {
    if (!base64Image || !base64Image.startsWith('data:image')) {
      resolve([]);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // 缩小图片以加速处理
        const SAMPLE_SIZE = 50;
        const ratio = Math.min(1, SAMPLE_SIZE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); // ✅ 性能优化
        ctx.drawImage(img, 0, 0, w, h);

        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          if (!suppressWarnings) {
            console.warn('[colorUtils] Failed to get image data (CORS?)');
          }
          resolve([]);
          return;
        }

        const pixels = imageData.data;
        const colorCounts = {};

        // 采样像素，统计颜色频率
        for (let i = 0; i < pixels.length; i += 16) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          if (a < 128) continue; // 跳过透明像素

          // 量化颜色（减少颜色种类）
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          colorCounts[key] = (colorCounts[key] || 0) + 1;
        }

        // 排序获取最常见的颜色
        const sortedColors = Object.entries(colorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
          });

        // 去重
        const uniqueColors = [...new Set(sortedColors)];
        resolve(uniqueColors.length > 0 ? uniqueColors : []);
      } catch (e) {
        if (!suppressWarnings) {
          console.warn('[colorUtils] Failed to extract colors:', e);
        }
        resolve([]);
      }
    };

    img.onerror = () => {
      if (!suppressWarnings) {
        console.warn('[colorUtils] Failed to load image from base64');
      }
      resolve([]);
    };

    img.src = base64Image;
  });
}

/**
 * Hex 颜色转 RGB
 * @param {string} hex - Hex 颜色值 (#RRGGBB)
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * RGB 转 Lab 颜色空间
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {{ L: number, a: number, b: number }}
 */
export function rgbToLab(rgb) {
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

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // XYZ to Lab (D65 illuminant)
  const xn = 95.047;
  const yn = 100.0;
  const zn = 108.883;

  const fx = x / xn > 0.008856 ? Math.pow(x / xn, 1 / 3) : (903.3 * x / xn + 16) / 116;
  const fy = y / yn > 0.008856 ? Math.pow(y / yn, 1 / 3) : (903.3 * y / yn + 16) / 116;
  const fz = z / zn > 0.008856 ? Math.pow(z / zn, 1 / 3) : (903.3 * z / zn + 16) / 116;

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Hex 颜色转 Lab
 * @param {string} hex - Hex 颜色值
 * @returns {{ L: number, a: number, b: number }}
 */
export function hexToLab(hex) {
  return rgbToLab(hexToRgb(hex));
}

/**
 * 计算两个 Lab 颜色之间的 Delta E (CIE76)
 * @param {{ L: number, a: number, b: number }} lab1
 * @param {{ L: number, a: number, b: number }} lab2
 * @returns {number} - Delta E 值
 */
export function calculateDeltaE(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * RGB 转 HSV（用于色相计算）
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {{ h: number, s: number, v: number }} - 色相 (0-360), 饱和度 (0-1), 明度 (0-1)
 */
export function rgbToHsv(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / delta + 2) * 60;
    } else {
      h = ((r - g) / delta + 4) * 60;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Hex 转 HSV
 * @param {string} hex - Hex 颜色值
 * @returns {{ h: number, s: number, v: number }}
 */
export function hexToHsv(hex) {
  return rgbToHsv(hexToRgb(hex));
}

/**
 * 计算两个色相之间的角度差（考虑色相环的循环性）
 * @param {number} h1 - 色相 1 (0-360)
 * @param {number} h2 - 色相 2 (0-360)
 * @returns {number} - 角度差 (0-180)
 */
export function calculateHueDifference(h1, h2) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * 检查两个颜色是否为互补色（在色相环上相差约 180 度）
 * @param {string} hex1 - Hex 颜色值 1
 * @param {string} hex2 - Hex 颜色值 2
 * @returns {boolean}
 */
export function areComplementaryColors(hex1, hex2) {
  const hsv1 = hexToHsv(hex1);
  const hsv2 = hexToHsv(hex2);
  
  // 如果饱和度太低，无法判断色相，不算互补色
  if (hsv1.s < 0.3 || hsv2.s < 0.3) {
    return false;
  }
  
  const hueDiff = calculateHueDifference(hsv1.h, hsv2.h);
  // 互补色在色相环上相差约 180 度，允许 ±30 度的误差
  return hueDiff >= 150 && hueDiff <= 210;
}

/**
 * 颜色匹配阈值（Delta E）
 * 🆕 优化：降低阈值以提高精确度
 * - Delta E < 15: 非常相似的颜色
 * - Delta E 15-30: 相似的颜色（同一色系）
 * - Delta E > 30: 明显不同的颜色
 */
export const COLOR_MATCH_THRESHOLD = 30;

/**
 * 规范化 Hex 颜色为 #RRGGBB（大写）。无效返回 null
 * @param {string} hex
 * @returns {string|null}
 */
export function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

/**
 * 从已加载的 <img> 元素提取主色调（不重新 fetch）
 * @param {HTMLImageElement} imgElement
 * @param {boolean} suppressWarnings - 是否抑制 CORS 警告（默认 true）
 * @returns {string[]|null} Hex 数组（#RRGGBB）
 */
export function extractColorsFromLoadedImage(imgElement, suppressWarnings = true) {
  if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
    return null;
  }
  try {
    const SAMPLE_SIZE = 50;
    const ratio = Math.min(1, SAMPLE_SIZE / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
    const w = Math.max(1, Math.round(imgElement.naturalWidth * ratio));
    const h = Math.max(1, Math.round(imgElement.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); // ✅ 性能优化
    ctx.drawImage(imgElement, 0, 0, w, h);

    // CORS 检测
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch (e) {
      if (!suppressWarnings) {
        console.warn('[colorUtils] CORS blocked color extraction for:', imgElement.src);
      }
      return null; // ✅ 静默失败，不抛出错误
    }

    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const colorCounts = {};
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      if (a < 128) continue;
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const key = `${qr},${qg},${qb}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
      });
    const normalized = [...new Set(sortedColors)].map(normalizeHex).filter(Boolean);
    return normalized.length > 0 ? normalized : null;
  } catch (err) {
    if (!suppressWarnings) {
      console.warn('[colorUtils] Failed to extract colors:', err.message);
    }
    return null;
  }
}

/**
 * 批量为 session 数据补全缺失的颜色
 * @param {Array} sessions - session 数组
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<{ sessions: Array, updated: number }>}
 */
export async function enrichSessionsWithColors(sessions, onProgress = null) {
  if (!Array.isArray(sessions)) return { sessions, updated: 0 };

  let updatedCount = 0;
  let totalItems = 0;
  let processedItems = 0;

  // 统计总数
  sessions.forEach(session => {
    if (session?.opengraphData) {
      totalItems += session.opengraphData.length;
    }
  });

  const enrichedSessions = [];

  for (const session of sessions) {
    if (!session?.opengraphData) {
      enrichedSessions.push(session);
      continue;
    }

    const enrichedItems = [];

    for (const item of session.opengraphData) {
      processedItems++;
      
      // 如果已经有颜色数据，跳过
      if (item.dominant_colors && Array.isArray(item.dominant_colors) && item.dominant_colors.length > 0) {
        enrichedItems.push(item);
        continue;
      }

      // 优先级：thumbnail > screenshot_image > image(base64)
      const base64Candidates = [
        item.thumbnail,
        item.screenshot_image,
        item.image && item.image.startsWith('data:image') ? item.image : null,
      ].filter(Boolean);

      let updated = false;
      for (const b64 of base64Candidates) {
        if (typeof b64 !== 'string' || !b64.startsWith('data:image')) continue;
        try {
          const colors = await extractColorsFromBase64(b64);
          if (colors.length > 0) {
            enrichedItems.push({ ...item, dominant_colors: colors });
            updatedCount++;
            updated = true;
            if (onProgress) {
              onProgress(processedItems, totalItems, updatedCount);
            }
            break;
          }
        } catch (e) {
          // 提取失败，尝试下一个候选
        }
      }

      if (!updated) {
        enrichedItems.push(item);
      }
    }

    enrichedSessions.push({
      ...session,
      opengraphData: enrichedItems,
    });
  }

  return { sessions: enrichedSessions, updated: updatedCount };
}

