import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer-when-downgrade",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self' http://localhost:3000 http://127.0.0.1:3000 http://10.216.26.186:3000 https: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000 http://10.216.26.186:3000 https:; media-src 'self' http://localhost:3000 http://127.0.0.1:3000 http://10.216.26.186:3000 https: data: blob:; img-src * data: blob:;",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          }
        ],
      },
    ];
  },
};

export default nextConfig;
