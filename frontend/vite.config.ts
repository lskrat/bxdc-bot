import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // When VITE_API_URL is unset, apiUrl() uses same-origin /api/* → skill-gateway.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18080',
        changeOrigin: true,
      },
    },
  },
})
