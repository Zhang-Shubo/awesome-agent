import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// dev: /api 与 /wallpapers 代理到 node server(先跑 node web/server.mjs)
// build: 产物在 dist/,server.mjs 检测到即优先托管
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/wallpapers': 'http://127.0.0.1:8787',
    },
  },
  build: { outDir: 'dist' },
})
