import { NextRequest, NextResponse } from 'next/server';
import { getAdminAnalytics } from '@/lib/db';
import { getCache, setCache } from '@/lib/cache';
import { Profiler } from '@/lib/profiler';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const profiler = new Profiler();
  try {
    profiler.start('auth', 'Admin Auth Check');
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    profiler.stop('auth', 'Admin Auth Check');

    // Cache analytics for 2 minutes — data is mostly pre-aggregated so this is a safety buffer
    const cacheKey = 'admin:analytics';
    profiler.start('cache', 'Cache Check');
    const cached = await getCache<any>(cacheKey);
    profiler.stop('cache', 'Cache Check');

    if (cached) {
      profiler.stop('total', 'Total Request Time');
      profiler.log('/api/admin/analytics (CACHED)');

      // ETag based on cache key — allows 304 Not Modified on repeated loads
      const etag = `"analytics-cached"`;
      if (req.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }

      const response = NextResponse.json({ success: true, analytics: cached, cached: true });
      Object.entries(profiler.getHeaders()).forEach(([k, v]) => response.headers.set(k, v));
      response.headers.set('ETag', etag);
      response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60');
      return response;
    }

    profiler.start('db', 'Database Query');
    const analytics = await getAdminAnalytics();
    profiler.stop('db', 'Database Query');

    setCache(cacheKey, analytics, 120).catch(() => {}); // 2 min cache, fire-and-forget

    profiler.stop('total', 'Total Request Time');
    profiler.log('/api/admin/analytics (MISS)');

    const etag = `"analytics-${Date.now()}"`;
    const response = NextResponse.json({ success: true, analytics });
    Object.entries(profiler.getHeaders()).forEach(([k, v]) => response.headers.set(k, v));
    response.headers.set('ETag', etag);
    response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60');
    return response;
  } catch (err: any) {
    console.error('Admin analytics error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
