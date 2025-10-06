/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // No global redirects here. We handle apex->app in middleware (host check).
    return [];
  },
};
export default nextConfig;
