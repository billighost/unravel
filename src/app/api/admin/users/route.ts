import { NextRequest, NextResponse } from 'next/server';
import { adminListUsers } from '@/lib/db';
import { getCache, setCache } from '@/lib/cache';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50'));
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Cache user list for 30 seconds — reduces DB load on admin dashboards with frequent refreshes
    const cacheKey = `admin:users:${limit}:${offset}`;
    const cached = await getCache<any[]>(cacheKey);

    if (cached) {
      const etag = `"users-${limit}-${offset}-cached"`;
      if (req.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }
      const response = NextResponse.json({ success: true, users: cached, cached: true });
      response.headers.set('ETag', etag);
      response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');
      return response;
    }

    const users = await adminListUsers(limit, offset);
    setCache(cacheKey, users, 30).catch(() => {}); // 30s cache, fire-and-forget

    const etag = `"users-${limit}-${offset}-${Date.now()}"`;
    const response = NextResponse.json({ success: true, users });
    response.headers.set('ETag', etag);
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');
    return response;
  } catch (err: any) {
    console.error('Admin users error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
