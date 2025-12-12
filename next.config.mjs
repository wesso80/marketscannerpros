/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // No global redirects; host-based redirect is handled in middleware.
    return [];
  },
};
export default nextConfig;
