/**
 * IndexedDB 检查工具
 * 在浏览器 Console 中运行，用于检查 IndexedDB 中的图片数据
 */

// 1. 查看所有图片
async function listAllImages() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tab_cleaner_images', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  const transaction = db.transaction(['images'], 'readonly');
  const store = transaction.objectStore('images');
  const allImages = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  console.log(`📦 总共 ${allImages.length} 张图片`);
  
  allImages.forEach((img, idx) => {
    console.log(`\n[${idx + 1}] ${img.originalUrl?.substring(0, 50)}...`, {
      hash: img.hash?.substring(0, 20),
      hasDataUrl: !!img.dataUrl,
      hasThumbnail: !!img.thumbnail,
      dataUrlSize: img.dataUrl ? `${(img.dataUrl.length / 1024).toFixed(1)} KB` : 'N/A',
      thumbnailSize: img.thumbnail ? `${(img.thumbnail.length / 1024).toFixed(1)} KB` : 'N/A',
    });
  });
  
  const withDataUrl = allImages.filter(img => img.dataUrl).length;
  const withThumbnail = allImages.filter(img => img.thumbnail).length;
  console.log(`\n📊 统计:`, {
    总数: allImages.length,
    有 dataUrl: withDataUrl,
    有 thumbnail: withThumbnail,
    缺失 dataUrl: allImages.length - withDataUrl,
    缺失 thumbnail: allImages.length - withThumbnail,
  });
  
  return allImages;
}

// 2. 通过 URL 查找图片
async function findImageByUrl(url) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tab_cleaner_images', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  // 计算 hash（和 eagle_storage.js 中的 hashUrl 函数一致）
  async function hashUrl(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const hash = await hashUrl(url);
  const transaction = db.transaction(['images'], 'readonly');
  const store = transaction.objectStore('images');
  const image = await new Promise((resolve, reject) => {
    const request = store.get(hash);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  if (image) {
    console.log('✅ 找到图片:', {
      hash: image.hash,
      originalUrl: image.originalUrl,
      hasDataUrl: !!image.dataUrl,
      hasThumbnail: !!image.thumbnail,
      dataUrlSize: image.dataUrl ? `${(image.dataUrl.length / 1024).toFixed(1)} KB` : 'N/A',
      thumbnailSize: image.thumbnail ? `${(image.thumbnail.length / 1024).toFixed(1)} KB` : 'N/A',
    });
    
    if (image.dataUrl) {
      console.log('🖼️ dataUrl 预览:', image.dataUrl.substring(0, 100) + '...');
      // 可以在新窗口打开预览
      // window.open(image.dataUrl);
    }
  } else {
    console.log('❌ 未找到图片');
  }
  
  return image;
}

// 3. 检查缺失 dataUrl 的图片
async function checkMissingDataUrl() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tab_cleaner_images', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  const transaction = db.transaction(['images'], 'readonly');
  const store = transaction.objectStore('images');
  const allImages = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  
  const missingDataUrl = allImages.filter(img => !img.dataUrl);
  const missingThumbnail = allImages.filter(img => !img.thumbnail);
  
  console.log('📊 检查结果:');
  console.log(`总数: ${allImages.length}`);
  console.log(`缺失 dataUrl: ${missingDataUrl.length}`);
  console.log(`缺失 thumbnail: ${missingThumbnail.length}`);
  
  if (missingDataUrl.length > 0) {
    console.log('\n❌ 缺失 dataUrl 的图片:');
    missingDataUrl.forEach((img, idx) => {
      console.log(`[${idx + 1}] ${img.originalUrl?.substring(0, 60)}`);
    });
  }
  
  if (missingThumbnail.length > 0) {
    console.log('\n❌ 缺失 thumbnail 的图片:');
    missingThumbnail.forEach((img, idx) => {
      console.log(`[${idx + 1}] ${img.originalUrl?.substring(0, 60)}`);
    });
  }
  
  return { missingDataUrl, missingThumbnail };
}

// 4. 导出到全局，方便在 Console 中使用
if (typeof window !== 'undefined') {
  window.__TAB_CLEANER_INDEXEDDB_TOOLS = {
    listAllImages,
    findImageByUrl,
    checkMissingDataUrl,
  };
  console.log('✅ IndexedDB 检查工具已加载！');
  console.log('使用方法:');
  console.log('  - window.__TAB_CLEANER_INDEXEDDB_TOOLS.listAllImages()');
  console.log('  - window.__TAB_CLEANER_INDEXEDDB_TOOLS.findImageByUrl("https://example.com/image.jpg")');
  console.log('  - window.__TAB_CLEANER_INDEXEDDB_TOOLS.checkMissingDataUrl()');
}

