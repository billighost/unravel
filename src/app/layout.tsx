import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
     process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unravel-3d.vercel.app')
  ),
  title: 'UNRAVEL — Tactile 3D Generative Pixel Canvas',
  description: 'Turn photos, drawings, and text into interactive 3D physical cube grid art.',
  manifest: '/manifest.json',
  alternates: {
    canonical: '/',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Unravel',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'UNRAVEL — Tactile 3D Generative Pixel Canvas',
    description: 'Turn photos, drawings, and text into interactive 3D physical cube grid art.',
    url: '/',
    siteName: 'UNRAVEL',
    images: [
      {
        url: '/icons/apple-touch-icon.png',
        width: 180,
        height: 180,
        alt: 'UNRAVEL Logo',
        type: 'image/png',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UNRAVEL — Tactile 3D Generative Pixel Canvas',
    description: 'Turn photos, drawings, and text into interactive 3D physical cube grid art.',
    images: ['/icons/apple-touch-icon.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#F7F6F2',
  // Without an explicit viewport, mobile Safari renders at a 980px layout width
  // and scales down — which is why the cubes and UI appeared cropped and tiny
  // on small phones. `viewportFit: cover` plus the safe-area insets used in the
  // layout lets the canvas run edge to edge under the notch/home indicator.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

import ClientProviders from './ClientProviders';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientProviders />
        <div className="crt-overlay" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const urlParams = new URLSearchParams(window.location.search);
              const forceSW = urlParams.get('sw') === 'true';
              if ((forceSW || (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')) && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  const buildId = "${process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev-' + Date.now()}";
                  navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(buildId)).catch(function(err) {
                    console.log('SW registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
