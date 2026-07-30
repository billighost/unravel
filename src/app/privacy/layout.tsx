import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | UNRAVEL',
  description: 'Read our privacy guidelines regarding device IDs, custom creation uploads, and browser data storage on Unravel.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | UNRAVEL',
    description: 'Read our privacy guidelines regarding device IDs, custom creation uploads, and browser data storage on Unravel.',
    url: '/privacy',
    type: 'website',
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
