import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root to this project so Next.js never tries to climb
  // out into a parent lockfile when this folder is dropped next to
  // unrelated repos (e.g. an external legacy workspace during migration).
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
