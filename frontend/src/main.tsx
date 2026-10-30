import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './router';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { HelmetProvider } from 'react-helmet-async';

// Deferred Service Worker registration with prompt update check
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      reg.update().catch(() => {});
      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          };
        }
      };
    }).catch(() => {});
  });
}

import { MotionConfig } from "framer-motion";
import { useUIStore } from "./store/ui";

function RootMotionConfig({ children }: { children: React.ReactNode }) {
  const reducedMotion = useUIStore(s => s.reducedMotion);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}

// Redirect legacy hash links: /#/some/path -> /some/path
if (typeof window !== 'undefined' && window.location.hash) {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  if (rawHash) {
    const [pathPart, queryPart] = rawHash.split('?');
    const cleanPath = pathPart ? (pathPart.startsWith('/') ? pathPart : `/${pathPart}`) : '/';
    const finalSearch = queryPart ? `?${queryPart}` : window.location.search;
    window.history.replaceState(null, '', `${cleanPath}${finalSearch}`);
  }
}

// Automatically reload and bust stale caches when a new Vite build is deployed
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) await caches.delete(key);
      }
    } catch (_) {}
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <RootMotionConfig>
            <AppRouter />
            <Analytics />
            <SpeedInsights />
          </RootMotionConfig>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
