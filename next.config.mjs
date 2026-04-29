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
  experimental: {
    optimizePackageImports: ['react-icons', '@heroicons/react', 'chart.js', 'react-markdown'],
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
          { key: 'Cache-Control', value: process.env.NODE_ENV === 'production'
            ? 'public, max-age=31536000, immutable'
            : 'no-store, no-cache, must-revalidate' },
        ],
      },
      // Prevent stale API data — always fetch fresh
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Fix old URLs that were in previous sitemaps
      {
        source: '/ai-analyst',
        destination: '/tools/scanner',
        permanent: true,
      },
      {
        source: '/scanner',
        destination: '/tools/scanner',
        permanent: true,
      },
      {
        source: '/portfolio',
        destination: '/tools/workspace',
        permanent: true,
      },
      {
        source: '/backtest',
        destination: '/tools/workspace',
        permanent: true,
      },
      {
        source: '/journal',
        destination: '/tools/workspace',
        permanent: true,
      },

      // ── V2 routes → consolidated /tools/* surfaces ──
      { source: '/v2/dashboard', destination: '/tools/dashboard', permanent: true },
      { source: '/v2/scanner', destination: '/tools/scanner', permanent: true },
      { source: '/v2/golden-egg', destination: '/tools/golden-egg', permanent: true },
      { source: '/v2/terminal', destination: '/tools/terminal', permanent: true },
      { source: '/v2/explorer', destination: '/tools/explorer', permanent: true },
      { source: '/v2/research', destination: '/tools/research', permanent: true },
      { source: '/v2/workspace', destination: '/tools/workspace', permanent: true },
      { source: '/v2/pricing', destination: '/pricing', permanent: true },
      { source: '/v2/backtest', destination: '/tools/workspace', permanent: true },
      { source: '/v2/referrals', destination: '/tools/referrals', permanent: true },
      { source: '/v2', destination: '/tools/dashboard', permanent: true },

      // ── Old v1 standalone routes → unified surfaces ──
      // Terminal surface
      { source: '/tools/options-terminal', destination: '/tools/terminal?tab=options-terminal', permanent: true },
      { source: '/tools/crypto-terminal', destination: '/tools/terminal?tab=crypto-terminal', permanent: true },
      { source: '/tools/options-flow', destination: '/tools/terminal?tab=options-flow', permanent: true },
      { source: '/tools/options', destination: '/tools/terminal?tab=options-terminal', permanent: true },

      // Explorer surface
      { source: '/tools/equity-explorer', destination: '/tools/explorer?tab=equity', permanent: true },
      { source: '/tools/crypto-explorer', destination: '/tools/explorer?tab=crypto', permanent: true },
      { source: '/tools/commodities', destination: '/tools/explorer?tab=commodities', permanent: true },
      { source: '/tools/market-movers', destination: '/tools/explorer?tab=movers', permanent: true },
      { source: '/tools/gainers-losers', destination: '/tools/explorer?tab=movers', permanent: true },
      { source: '/tools/heatmap', destination: '/tools/explorer?tab=heatmap', permanent: true },
      { source: '/tools/markets', destination: '/tools/explorer', permanent: true },

      // Research surface
      { source: '/tools/news', destination: '/tools/research', permanent: true },
      { source: '/tools/economic-calendar', destination: '/tools/research', permanent: true },
      { source: '/tools/earnings', destination: '/tools/research?tab=earnings', permanent: true },
      { source: '/tools/earnings-calendar', destination: '/tools/research?tab=earnings', permanent: true },

      // Dashboard surface
      { source: '/tools/crypto-dashboard', destination: '/tools/dashboard?tab=crypto', permanent: true },
      { source: '/tools/crypto', destination: '/tools/explorer?tab=crypto-command', permanent: true },
      { source: '/tools/macro', destination: '/tools/explorer?tab=macro', permanent: true },
      { source: '/tools/volatility-engine', destination: '/tools/golden-egg', permanent: true },

      // Scanner surface
      { source: '/tools/ai-analyst', destination: '/tools/scanner', permanent: true },
      { source: '/tools/confluence-scanner', destination: '/tools/terminal?tab=time-confluence', permanent: true },
      { source: '/tools/options-confluence', destination: '/tools/terminal?tab=options-confluence', permanent: true },
      { source: '/tools/crypto-time-confluence', destination: '/tools/terminal?tab=time-confluence', permanent: true },
      { source: '/tools/time-scanner', destination: '/tools/terminal?tab=time-scanner', permanent: true },
      { source: '/tools/deep-analysis', destination: '/tools/golden-egg', permanent: true },
      { source: '/tools/intraday-charts', destination: '/tools/golden-egg', permanent: true },

      // Workspace surface
      { source: '/tools/watchlists', destination: '/tools/workspace?tab=Watchlists', permanent: true },
      { source: '/tools/journal', destination: '/tools/workspace?tab=Journal', permanent: true },
      { source: '/tools/portfolio', destination: '/tools/workspace?tab=Portfolio', permanent: true },
      { source: '/tools/alerts', destination: '/tools/workspace?tab=Alerts', permanent: true },
      { source: '/tools/backtest', destination: '/tools/workspace?tab=Backtest', permanent: true },
      { source: '/tools/settings', destination: '/tools/workspace?tab=Settings', permanent: true },

      // Orphan pages → correct surfaces
      { source: '/tools/company-overview', destination: '/tools/golden-egg', permanent: true },
      { source: '/tools/liquidity-sweep', destination: '/tools/golden-egg', permanent: true },
      { source: '/tools/scanner/backtest', destination: '/tools/workspace?tab=Backtest', permanent: true },
    ];
  },
};
export default nextConfig;
