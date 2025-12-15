/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Force correct project root to silence multi-lockfile warning
    root: process.cwd(),
  },
  async redirects() {
    // No global redirects; host-based redirect is handled in middleware.
    return [];
  },
};
export default nextConfig;
