import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './router';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { HelmetProvider } from 'react-helmet-async';

// Deferred Service Worker registration to eliminate render-blocking script from initial critical path
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
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

// Automatically reload when a new Vite build is deployed and chunk hashes change
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
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
