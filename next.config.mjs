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
