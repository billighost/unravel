import { NextRequest, NextResponse } from 'next/server';
import { getCreationById } from '@/lib/db';
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

    profiler.start('cache', 'Cache Check');
    const cachedCreation = await getCache(`cache:creation:${id}`);
    profiler.stop('cache', 'Cache Check');

    if (cachedCreation) {
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
