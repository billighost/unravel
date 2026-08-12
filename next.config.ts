import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true, // Enable gzip/brotli compression on all API and page responses
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Rewrites barrel imports to direct module paths so a single `import
    // { Download } from 'lucide-react'` does not pull the whole icon set into
    // the first-load bundle.
    optimizePackageImports: ['lucide-react', 'framer-motion', 'three'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        // Icons and the manifest are content-stable, so let the browser keep
        // them for a year instead of revalidating on every load.
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // The worker itself must never be served stale, or a deploy cannot
        // roll out a new cache version.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
