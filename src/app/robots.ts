import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
                      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unravel-3d.vercel.app');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/admin', '/api/creations/*/report'],
      },
    ],
    sitemap: `${baseAppUrl}/sitemap.xml`,
  };
}
