import { NextRequest, NextResponse } from 'next/server';
import { getPublicGallery, getUserCreations } from '@/lib/db';
import { Profiler } from '@/lib/profiler';
import { getCache, setCache, getGalleryVersion } from '@/lib/cache';

export const runtime = 'edge';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

/** Parses a pagination param, rejecting NaN/negative/oversized values. */
function parseBounded(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(req: NextRequest) {
  const profiler = new Profiler();
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseBounded(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = parseBounded(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const beforeDate = searchParams.get('before_date');
    const beforeId = searchParams.get('before_id');
    const filter = searchParams.get('filter');
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    if (filter === 'my') {
      profiler.start('db', 'Database Query My Creations');
      // getUserCreations resolves the username via an inline SQL subquery when
      // knownUsername is omitted — one fewer sequential DB round-trip vs. the
      // old getAssociatedUsername() → getUserCreations() waterfall.
      const items = await getUserCreations(deviceId, limit, offset);
      profiler.stop('db', 'Database Query My Creations');

      profiler.stop('total', 'Total Request Time');
      profiler.log('/api/gallery?filter=my');

      const response = NextResponse.json({
        success: true,
        items,
        count: items.length,
      });

      Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
        response.headers.set(k, v);
      });
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return response;
    }

    profiler.start('cache', 'Cache Check');
    const version = await getGalleryVersion();
    const cacheKey = `cache:gallery:v${version}:${limit}:${offset}:${beforeDate || ''}:${beforeId || ''}`;
    
    const etag = `"${cacheKey}"`;
    if (req.headers.get('if-none-match') === etag) {
      profiler.stop('total', 'Total Request Time');
      return new NextResponse(null, { status: 304 });
    }

    const cachedData = await getCache<{ items?: unknown[] }>(cacheKey);
    profiler.stop('cache', 'Cache Check');

    if (cachedData && Array.isArray(cachedData.items)) {
      const cachedItems = cachedData.items;
      profiler.stop('total', 'Total Request Time');
      profiler.log('/api/gallery (CACHED)');

      const response = NextResponse.json({
        success: true,
        items: cachedItems,
        count: cachedItems.length,
      });
      
      // Inject Server-Timing headers
      Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
        response.headers.set(k, v);
      });
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
      response.headers.set('ETag', etag);
      return response;
    }

    profiler.start('db', 'Database Query');
    const items = await getPublicGallery(limit, offset, beforeDate, beforeId);
    profiler.stop('db', 'Database Query');

    // Fire-and-forget: the client does not need the cache write to land before
    // it gets its data, and awaiting it added a full Redis round-trip to every
    // cache miss.
    setCache(cacheKey, { items }, 30).catch(() => {});

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
    response.headers.set('ETag', etag);
    return response;
  } catch (err: any) {
    console.error('GET /api/gallery error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
