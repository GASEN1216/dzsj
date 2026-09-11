/// <reference types="vitest" />
import { defineConfig } from 'vite';

// base 使用相对路径，保证部署到 GitHub Pages 的 <user>.github.io/<repo>/ 子路径时
// JS/CSS/静态资源都能正确加载，无需关心仓库名称。
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
