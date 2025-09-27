import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove allowedDevOrigins for production build
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      allowedDevOrigins: [
        'replit.dev',
        '*.replit.dev',
        'ngrok.io',
        '*.ngrok.io'
      ]
    } as any
  }),
  
  // Production optimizations
  output: 'standalone',
  poweredByHeader: false,
  
  // Remove lockfile warning by setting outputFileTracingRoot
  outputFileTracingRoot: undefined,
};

export default nextConfig;
