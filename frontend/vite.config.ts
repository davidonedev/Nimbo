import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // o usuário decide quando atualizar ("Nova versão disponível")
      includeAssets: ['icons/apple-touch-icon.png', 'images/favicon-32.png'],
      manifest: {
        name: 'Nimbo — Agenda e gestão',
        short_name: 'Nimbo',
        description: 'Agenda, clientes e gestão do seu negócio de beleza e bem-estar.',
        lang: 'pt-BR',
        start_url: '/login',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1927b0',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true, // já na primeira visita o SW enxerga as leituras (sem skipWaiting: atualização só com o clique do usuário)
        runtimeCaching: [
          {
            // Leituras da agenda/painel para ver o último estado offline. Só GET, só áreas autenticadas do negócio
            // (/api/admin e /api/professional). Escrita nunca passa pelo cache. Limpo no login e no logout (src/pwa/offline.ts).
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\/(admin|professional)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nimbo-api-v1', // mantenha igual a API_CACHE_NAME
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 80, maxAgeSeconds: 12 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'nimbo-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // O 1º teste de cada arquivo paga a partida do jsdom; com a máquina ocupada passa dos 5 s padrão.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
