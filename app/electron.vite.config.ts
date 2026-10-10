import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { lucideSubset } from './plugins/lucideSubset'
import type { Plugin } from 'vite'

/**
 * Adds a strict Content-Security-Policy to the production renderer only. The dev server needs
 * inline scripts and websockets for HMR, so it stays unrestricted there.
 */
function productionCsp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
  return {
    name: 'volt-production-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }
    ]
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
    },
    plugins: [react(), tailwindcss(), lucideSubset(), productionCsp()],
    build: { minify: 'esbuild' }
  }
})
