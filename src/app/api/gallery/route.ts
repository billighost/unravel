import { NextRequest, NextResponse } from 'next/server';
import { getPublicGallery } from '@/lib/db';
import { Profiler } from '@/lib/profiler';
import { getCache, setCache, getGalleryVersion } from '@/lib/cache';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const profiler = new Profiler();
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const beforeDate = searchParams.get('before_date');
    const beforeId = searchParams.get('before_id');

    profiler.start('cache', 'Cache Check');
    const version = await getGalleryVersion();
    const cacheKey = `cache:gallery:v${version}:${limit}:${offset}:${beforeDate || ''}:${beforeId || ''}`;
    const cachedData = await getCache(cacheKey);
    profiler.stop('cache', 'Cache Check');

    if (cachedData) {
      profiler.stop('total', 'Total Request Time');
      profiler.log('/api/gallery (CACHED)');
      
      const response = NextResponse.json({
        success: true,
        items: cachedData.items,
        count: cachedData.items.length,
      });
      
      // Inject Server-Timing headers
      Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
        response.headers.set(k, v);
      });
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
      return response;
    }

    profiler.start('db', 'Database Query');
    const items = await getPublicGallery(limit, offset, beforeDate, beforeId);
    profiler.stop('db', 'Database Query');

    profiler.start('cache_write', 'Cache Write');
    await setCache(cacheKey, { items }, 30); // 30 seconds TTL
    profiler.stop('cache_write', 'Cache Write');

    profiler.stop('total', 'Total Request Time');
    profiler.log('/api/gallery (MISS)');

    const response = NextResponse.json({
      success: true,
      items,
      count: items.length,
    });

    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
    return response;
  } catch (err: any) {
    console.error('GET /api/gallery error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
