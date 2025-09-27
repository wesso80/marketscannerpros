/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: allow loading your dev server from additional origins (Replit/Ngrok/etc)
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://<paste-your-dev-preview-url>"  // ← replace with your dev URL in Chunk 2
  ],
};
export default nextConfig;
