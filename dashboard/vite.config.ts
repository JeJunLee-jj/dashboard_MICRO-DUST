/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 상대 경로(base: "./")로 빌드하면 dist/ 폴더를 아무 정적 서버나 GitHub Pages 하위 경로에 올려도 동작한다.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
