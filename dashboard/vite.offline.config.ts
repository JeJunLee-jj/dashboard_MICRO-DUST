/* 오프라인판 빌드 설정: JS·CSS를 한 덩어리로 묶는다(코드 분할 없음).
   빌드 후 scripts/inline-offline.mjs 가 index.html 하나에 모두 넣는다. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_OFFLINE": JSON.stringify("1") },
  build: {
    outDir: "dist-offline",
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rolldownOptions: { output: { inlineDynamicImports: true } },
  },
});
