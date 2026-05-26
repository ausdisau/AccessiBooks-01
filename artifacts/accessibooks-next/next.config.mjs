import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const basePath = process.env.BASE_PATH && process.env.BASE_PATH !== "/"
  ? process.env.BASE_PATH.replace(/\/$/, "")
  : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "..", "..", "shared"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    };
    return config;
  },
};

export default nextConfig;
