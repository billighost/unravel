import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Public Community Gallery | UNRAVEL',
  description: 'Browse, view, and challenge friends with tactile 3D physical pixel artwork created by the Unravel community.',
  alternates: {
    canonical: '/gallery',
  },
  openGraph: {
    title: 'Public Community Gallery | UNRAVEL',
    description: 'Browse, view, and challenge friends with tactile 3D physical pixel artwork created by the Unravel community.',
    url: '/gallery',
    type: 'website',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
