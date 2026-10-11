import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import AppRouter from './router';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { HelmetProvider } from 'react-helmet-async';

// Load fonts locally to avoid Google Fonts network blocks
import "@fontsource/inter/100.css";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "@fontsource/cormorant-garamond/300.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";

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

// Auto-redirect direct URL paths to HashRouter equivalent and normalize dirty paths (e.g., /login#/profile -> /#/profile, /terms -> /#/terms)
if (typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/') {
  const p = window.location.pathname;
  const currentHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
  const finalRoute = currentHash ? `/#/${currentHash}` : `/#${p.startsWith('/') ? p : '/' + p}`;
  window.location.replace(`${window.location.origin}${finalRoute}${window.location.search}`);
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
        <HashRouter>
          <RootMotionConfig>
            <AppRouter />
            <Analytics />
            <SpeedInsights />
          </RootMotionConfig>
        </HashRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
