import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: [
      'replit.dev',
      '*.replit.dev',
      'ngrok.io',
      '*.ngrok.io'
    ]
  } as any
};
export default nextConfig;
