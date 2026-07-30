import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About the 3D Tactile Toy Engine | UNRAVEL',
  description: 'Learn how Unravel bridges tactile physics simulations with digital creativity. Discover the draw, upload, and text modes, and offline functionality.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About the 3D Tactile Toy Engine | UNRAVEL',
    description: 'Learn how Unravel bridges tactile physics simulations with digital creativity. Discover the draw, upload, and text modes, and offline functionality.',
    url: '/about',
    type: 'website',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
