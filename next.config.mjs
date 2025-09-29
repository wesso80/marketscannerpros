/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: allow loading your dev server from additional origins (Replit/Ngrok/etc)
  experimental: {
    allowedDevOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://marketscannerpros.app"
    ]
  },
};
export default nextConfig;
