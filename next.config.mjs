import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Silence multiple lockfile warnings by pinning the turbopack root to the project folder.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms https://plausible.io https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.google-analytics.com https://*.clarity.ms https://plausible.io https://*.stripe.com https://api.coingecko.com https://pro-api.coingecko.com https://www.alphavantage.co wss: ws:",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
      // Prevent stale server action cache after deployments
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Fix old URLs that were in previous sitemaps
      {
        source: '/ai-analyst',
        destination: '/tools/ai-analyst',
        permanent: true,
      },
      {
        source: '/scanner',
        destination: '/tools/scanner',
        permanent: true,
      },
      {
        source: '/portfolio',
        destination: '/tools/portfolio',
        permanent: true,
      },
      {
        source: '/backtest',
        destination: '/tools/backtest',
        permanent: true,
      },
      {
        source: '/journal',
        destination: '/tools/journal',
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
