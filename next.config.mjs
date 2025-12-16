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
  async redirects() {
    // No global redirects; host-based redirect is handled in middleware.
    return [];
  },
};
export default nextConfig;
