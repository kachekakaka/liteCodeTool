import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  cacheDir: '../liteCodeTool_tmp/vite-cache',
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 8787}`, '/ws': { target: `ws://127.0.0.1:${process.env.PORT || 8787}`, ws: true } }
  },
  build: {
    outDir: fileURLToPath(new URL('../liteCodeTool_tmp/dist', import.meta.url)),
    emptyOutDir: true
  }
});
