import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  output: "standalone",
  poweredByHeader: false,

  // ✅ Redirect all traffic on app.marketscannerpros.app → Streamlit (keeps path & query)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.marketscannerpros.app" }],
        destination: "https://market-scanner-1-wesso80.replit.app/:path*",
        permanent: true, // 308
      },
    ];
  },
};

export default nextConfig;
