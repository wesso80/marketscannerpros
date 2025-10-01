import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.marketscannerpros.app" }],
        destination: "https://market-scanner-1-wesso80.replit.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
