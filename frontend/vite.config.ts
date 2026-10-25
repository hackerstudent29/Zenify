import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Zenify Music',
        short_name: 'Zenify',
        description: 'A premium music streaming experience',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: '/favicon_32.png',
            sizes: '32x32',
            type: 'image/png'
          },
          {
            src: '/favicon_z_512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, './src/lib/next-link-compat.tsx'),
      'next/navigation': path.resolve(__dirname, './src/lib/next-navigation-compat.ts'),
    },
  },
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  define: {
    'process.env': 'import.meta.env',
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress "use client" directive warnings
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/')) {
            if (normalized.includes('lucide-react') || normalized.includes('@animateicons')) {
              return 'vendor-icons';
            }
            if (normalized.includes('@radix-ui') || normalized.includes('/radix-ui/')) {
              return 'vendor-radix';
            }
            if (normalized.includes('framer-motion') || normalized.includes('gsap')) {
              return 'vendor-motion';
            }
            if (normalized.includes('@tanstack')) {
              return 'vendor-query';
            }
            if (normalized.includes('react-hook-form') || normalized.includes('@hookform') || normalized.includes('/zod/')) {
              return 'vendor-forms';
            }
            if (normalized.includes('@hello-pangea') || normalized.includes('react-image-crop') || normalized.includes('react-day-picker')) {
              return 'vendor-heavy-ui';
            }
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/react-router-dom/') ||
              normalized.includes('/node_modules/react-router/') ||
              normalized.includes('/node_modules/zustand/') ||
              normalized.includes('/node_modules/react-helmet-async/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalized.includes('axios') || normalized.includes('date-fns') || normalized.includes('colorthief') || normalized.includes('idb-keyval') || normalized.includes('clsx') || normalized.includes('tailwind-merge')) {
              return 'vendor-utils';
            }
          }
        }
      }
    },
  },
});
