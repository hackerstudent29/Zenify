/**
 * Mobile-specific Next.js config for Capacitor static export.
 * 
 * Key differences from next.config.ts:
 * - output: 'export'      -> Generates static HTML/JS/CSS in /out folder
 * - trailingSlash: true   -> Required for file:// routing in Capacitor WebView
 * - images.unoptimized    -> Next/Image doesn't work in static export
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'export',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
};

export default nextConfig;
