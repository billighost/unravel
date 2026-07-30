import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | UNRAVEL',
  description: 'Terms and conditions for playing, creating, sharing, and remixing interactive 3D grid artwork on Unravel.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Service | UNRAVEL',
    description: 'Terms and conditions for playing, creating, sharing, and remixing interactive 3D grid artwork on Unravel.',
    url: '/terms',
    type: 'website',
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
