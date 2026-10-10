import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { lucideSubset } from './plugins/lucideSubset'

// Plain-browser dev server for the renderer. Without Electron, the renderer falls back to the
// in-memory mock API (src/renderer/src/dev/mockApi.ts).
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
  },
  plugins: [react(), tailwindcss(), lucideSubset()],
  server: { port: 5173, strictPort: false }
})
