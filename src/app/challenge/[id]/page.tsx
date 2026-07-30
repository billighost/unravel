import { getCreationById } from '@/lib/db';
import type { Metadata } from 'next';
import ChallengeClient from './ChallengeClient';
import StructuredData from '@/components/seo/StructuredData';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const creation = await getCreationById(id);

  if (!creation) {
    return {
      title: 'Picture Not Found | UNRAVEL',
      description: 'This interactive 3D pixel artwork is no longer available.',
    };
  }

  const isDaily = creation.is_daily_challenge;
  const title = isDaily
    ? "Today's Daily Challenge | UNRAVEL"
    : "Can you unravel this? | UNRAVEL";

  const modeName = (creation.source_mode || 'draw').toUpperCase();
  const description = `Solve this interactive 3D spring-physics cube puzzle! Created in ${modeName} mode. Poke the cubes to scramble them and trigger wobble physics, then snap them back to reveal the hidden pixel artwork.`;

  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
                      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unravel-3d.vercel.app');

  const originalThumbnail = creation.thumbnail_url;
  const imageUrl = originalThumbnail || `${baseAppUrl}/icons/apple-touch-icon.png`;

  return {
    title,
    description,
    alternates: {
      canonical: `/challenge/${id}`,
    },
    openGraph: {
      title,
      description,
      url: `/challenge/${id}`,
      siteName: 'UNRAVEL',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: 'Unravel 3D Pixel Art Preview',
          type: 'image/png',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { id } = await params;
  const creation = await getCreationById(id);

  let schema = null;
  if (creation) {
    const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || 
                       (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
                        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unravel-3d.vercel.app');
    
    schema = {
      "@context": "https://schema.org",
      "@type": "VisualArtwork",
      "name": creation.is_daily_challenge ? "Today's Daily Challenge | UNRAVEL" : `3D Pixel Artwork #${id}`,
      "image": creation.thumbnail_url || `${baseAppUrl}/icons/apple-touch-icon.png`,
      "description": `Interactive 3D spring-physics cube art puzzle created in ${creation.source_mode || 'draw'} mode.`,
      "creator": {
        "@type": "Person",
        "name": creation.username || "Anonymous Creator"
      },
      "artMedium": "Digital 3D Cube Canvas",
      "artform": "3D Generative Pixel Art",
    };
  }

  return (
    <>
      {schema && <StructuredData schema={schema} />}
      <ChallengeClient id={id} />
    </>
  );
}
