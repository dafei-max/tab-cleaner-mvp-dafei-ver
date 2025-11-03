import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: "./public",
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.jsx"),
        sidepanel: resolve(__dirname, "src/sidepanel/index.jsx"),
        background: resolve(__dirname, "src/background/index.js"),
        content: resolve(__dirname, "src/content/index.jsx"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
