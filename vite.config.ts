import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const pdfjsAssetDirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const

const telemetryFlush = 'flush(t,e){if(this.error)'
const telemetryUrl = 'https://odml.pa.googleapis.com/v1/log'

function silenceFaceTelemetry(code: string): string {
  if (!code.includes(telemetryFlush) && !code.includes(telemetryUrl)) return code
  return code
    .replace(telemetryFlush, 'flush(t,e){t?.();return;if(this.error)')
    .replaceAll(telemetryUrl, '')
}

function stripMediaPipeTelemetry(): Plugin {
  return {
    name: 'strip-mediapipe-telemetry',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('tasks-vision') && !code.includes(telemetryUrl)) return null
      const next = silenceFaceTelemetry(code)
      if (next === code) return null
      return { code: next, map: null }
    },
  }
}

const stripTelemetry = stripMediaPipeTelemetry()

export default defineConfig({
  plugins: [
    stripTelemetry,
    react(),
    tailwindcss(),
    ...viteStaticCopy({
      targets: pdfjsAssetDirs.map((dir) => ({
        src: `node_modules/pdfjs-dist/${dir}/*`,
        dest: dir,
        rename: { stripBase: true },
      })),
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
      ],
      manifest: {
        name: 'Volti',
        short_name: 'Volti',
        description: 'Read sheet music one page at a time.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,mjs,wasm,bcmap,ttf,pfb,icc,task}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  optimizeDeps: {
    rolldownOptions: {
      plugins: [stripTelemetry],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 43123,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 43123,
    strictPort: true,
  },
})
