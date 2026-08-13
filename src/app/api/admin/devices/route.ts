import { NextRequest, NextResponse } from 'next/server';
import { adminListDevices } from '@/lib/db';
import { getCache, setCache } from '@/lib/cache';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '200'));
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Cache for 60 s — device list changes infrequently and the query is relatively heavy.
    const cacheKey = `admin:devices:${limit}:${offset}`;
    const cached = await getCache<any[]>(cacheKey);

    if (cached) {
      const etag = `"devices-${limit}-${offset}-cached"`;
      if (req.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }
      const response = NextResponse.json({ success: true, devices: cached, total: cached.length, cached: true });
      response.headers.set('ETag', etag);
      response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=60');
      return response;
    }

    const devices = await adminListDevices(limit, offset);
    setCache(cacheKey, devices, 60).catch(() => {}); // 60 s, fire-and-forget

    const etag = `"devices-${limit}-${offset}-${Date.now()}"`;
    const response = NextResponse.json({ success: true, devices, total: devices.length });
    response.headers.set('ETag', etag);
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=60');
    return response;
  } catch (err: any) {
    console.error('Admin devices error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
