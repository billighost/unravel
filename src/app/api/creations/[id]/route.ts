import { NextRequest, NextResponse } from 'next/server';
import { getCreationById, incrementViewCount } from '@/lib/db';
import { Profiler } from '@/lib/profiler';
import { getCache, setCache } from '@/lib/cache';

export const runtime = 'edge';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profiler = new Profiler();
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing creation ID' }, { status: 400 });
    }

    const deviceId = req.headers.get('x-device-id') || 'unknown';
    const viewCacheKey = `viewed:${deviceId}:${id}`;

    profiler.start('cache', 'Cache Check');

    // Parallelize view-count dedup check AND creation cache lookup in a single round-trip
    const [alreadyViewed, cachedCreation] = await Promise.all([
      (deviceId && deviceId !== 'unknown') ? getCache(viewCacheKey) : Promise.resolve(true),
      getCache<any>(`cache:creation:${id}`),
    ]);

    profiler.stop('cache', 'Cache Check');

    const shouldIncrement = !alreadyViewed && !!deviceId && deviceId !== 'unknown';

    // Fire view-count increment and dedup-key write in parallel (no await — fire-and-forget)
    if (shouldIncrement) {
      Promise.all([
        incrementViewCount(id),
        setCache(viewCacheKey, true, 3600), // 1 hour dedup TTL
      ]).catch(() => {});
    }

    if (cachedCreation) {
      if (shouldIncrement) {
        cachedCreation.view_count = (cachedCreation.view_count || 0) + 1;
        setCache(`cache:creation:${id}`, cachedCreation, 604800).catch(() => {});
      }

      profiler.stop('total', 'Total Request Time');
      profiler.log(`/api/creations/${id} (CACHED)`);

      const etag = `"creation-${id}-${cachedCreation.view_count || 0}"`;
      if (req.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }

      const response = NextResponse.json({ success: true, creation: cachedCreation });
      Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
        response.headers.set(k, v);
      });
      response.headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      response.headers.set('ETag', etag);
      return response;
    }

    profiler.start('db', 'Database Query');
    const creation = await getCreationById(id);
    profiler.stop('db', 'Database Query');

    if (!creation) {
      return NextResponse.json(
        { error: 'Creation not found.' },
        { status: 404 }
      );
    }

    // Write through to cache (non-blocking)
    setCache(`cache:creation:${id}`, creation, 604800).catch(() => {}); // 7 days TTL

    profiler.stop('total', 'Total Request Time');
    profiler.log(`/api/creations/${id} (MISS)`);

    const etag = `"creation-${id}-${creation.view_count || 0}"`;
    const response = NextResponse.json({ success: true, creation });
    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });
    response.headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    response.headers.set('ETag', etag);
    return response;
  } catch (err: any) {
    console.error('GET /api/creations/:id error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
