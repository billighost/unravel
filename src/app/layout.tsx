import type { Metadata, Viewport } from 'next';
import {
  Pixelify_Sans,
  Press_Start_2P,
  Space_Mono,
  Inter,
  Playfair_Display,
  Righteous,
  Caveat,
} from 'next/font/google';
import './globals.css';

/*
 * Fonts are self-hosted through next/font rather than pulled in with an
 * `@import` at the top of globals.css.
 *
 * The @import cost three chained round trips before a single character could
 * paint — stylesheet, then Google's CSS, then the font files — and none of it
 * was available offline. next/font inlines the @font-face rules, serves the
 * files from our own origin (so the service worker caches them like any other
 * static asset), and preloads them.
 */
const pixelifySans = Pixelify_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pixelify',
});

const pressStart2P = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-press-start',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-space-mono',
});

// Type-mode display faces. Not preloaded: they are only needed once the user
// opens Type mode and picks one, so preloading them would compete with the
// fonts the first screen actually paints with.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: false,
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
  preload: false,
});

const righteous = Righteous({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-righteous',
  preload: false,
});

const caveat = Caveat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-caveat',
  preload: false,
});

const fontVariables = [
  pixelifySans.variable,
  pressStart2P.variable,
  spaceMono.variable,
  inter.variable,
  playfairDisplay.variable,
  righteous.variable,
  caveat.variable,
].join(' ');

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
    <html lang="en" className={fontVariables}>
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
