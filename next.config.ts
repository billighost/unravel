import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true, // Enable gzip/brotli compression on all API and page responses
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
