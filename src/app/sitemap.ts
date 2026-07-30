import { MetadataRoute } from 'next';
import { getPublicGallery } from '@/lib/db';

export const revalidate = 3600; // Revalidate sitemap at most every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
                      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unravel-3d.vercel.app');

  // Static routes
  const routes = ['', '/gallery', '/about', '/privacy', '/terms'].map((route) => ({
    url: `${baseAppUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));

  try {
    // Fetch up to 100 recent public gallery items
    const publicCreations = await getPublicGallery(100, 0);
    const creationRoutes = publicCreations.map((creation) => ({
      url: `${baseAppUrl}/challenge/${creation.id}`,
      lastModified: creation.created_at ? new Date(creation.created_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [...routes, ...creationRoutes];
  } catch (err) {
    console.error('Failed to generate dynamic sitemap routes:', err);
    return routes;
  }
}
