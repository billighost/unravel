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

    // View count logic
    const deviceId = req.headers.get('x-device-id') || 'unknown';
    const viewCacheKey = `viewed:${deviceId}:${id}`;
    let shouldIncrement = false;
    if (deviceId && deviceId !== 'unknown') {
      const alreadyViewed = await getCache(viewCacheKey);
      if (!alreadyViewed) {
        shouldIncrement = true;
      }
    }

    if (shouldIncrement) {
      await incrementViewCount(id);
      await setCache(viewCacheKey, true, 3600); // 1 hour TTL
    }

    profiler.start('cache', 'Cache Check');
    let cachedCreation = await getCache<any>(`cache:creation:${id}`);
    profiler.stop('cache', 'Cache Check');

    if (cachedCreation) {
      if (shouldIncrement) {
        cachedCreation.view_count = (cachedCreation.view_count || 0) + 1;
        await setCache(`cache:creation:${id}`, cachedCreation, 604800);
      }

      profiler.stop('total', 'Total Request Time');
      profiler.log(`/api/creations/${id} (CACHED)`);

      const response = NextResponse.json({ success: true, creation: cachedCreation });
      Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
        response.headers.set(k, v);
      });
      response.headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
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

    profiler.start('cache_write', 'Cache Write');
    await setCache(`cache:creation:${id}`, creation, 604800); // 7 days TTL
    profiler.stop('cache_write', 'Cache Write');

    profiler.stop('total', 'Total Request Time');
    profiler.log(`/api/creations/${id} (MISS)`);

    const response = NextResponse.json({ success: true, creation });
    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });
    response.headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    return response;
  } catch (err: any) {
    console.error('GET /api/creations/:id error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
