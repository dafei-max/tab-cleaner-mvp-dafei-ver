import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: "./public",
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true, // ✅ 启用 source maps 便于调试
    minify: 'esbuild', // ✅ 使用 esbuild（Vite 默认，更快）
    rollupOptions: {
      input: {
        blank: resolve(__dirname, "public/blank.html"),
        personalspace: resolve(__dirname, "personalspace.html"),
        sidepanel: resolve(__dirname, "public/sidepanel.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          // 保持图片资源在 static/img/ 目录
          const ext = assetInfo.name ? assetInfo.name.split('.').pop() : '';
          if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
            const name = assetInfo.name.replace(/^.*[\\/]/, '');
            // 检查是否是个人空间的图片资源
            if (name.includes('clipboard') || name.includes('image-') || name.includes('vector') || 
                name.includes('union') || name.includes('pinterest') || name.includes('basket') ||
                name.includes('aha') || name.includes('live') || name.includes('loriann') ||
                name.includes('roses') || name.includes('ucev') || name.includes('a-1') ||
                name.includes('1-2') || name.includes('1-3') || name.includes('1-4') ||
                name.includes('viewbuttons') || name.includes('lasso') || name.includes('draw') ||
                name.includes('text') || name.includes('last-move') || name.includes('next-move') ||
                name.includes('ai-clustering') || name.includes('3.svg') || name.includes('4.svg') ||
                name.includes('5.svg') || name.includes('1.svg')) {
              return `static/img/${name}`;
            }
          }
          return "assets/[name].[ext]";
        },
      },
    },
  },
});
