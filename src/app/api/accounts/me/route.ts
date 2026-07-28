import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername, isAdminUsername } from '@/lib/db';
import { getCache, setCache } from '@/lib/cache';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ loggedIn: false });
    }

    // Cache session lookups for 5 minutes to avoid a DB round-trip on every page load
    const cacheKey = `session:${deviceId}`;
    const cached = await getCache<string | null>(cacheKey);

    let username: string | null;
    if (cached !== null && cached !== undefined) {
      username = cached === '' ? null : cached;
    } else {
      username = await getAssociatedUsername(deviceId);
      // Cache the result: empty string for "not logged in", actual username otherwise
      setCache(cacheKey, username ?? '', 300).catch(() => {}); // 5 min TTL, fire-and-forget
    }

    if (username) {
      // Determine admin status from username
      const adminFlag = isAdminUsername(username);
      const response = NextResponse.json({ loggedIn: true, username, isAdmin: adminFlag });
      response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
      return response;
    } else {
      const response = NextResponse.json({ loggedIn: false });
      response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
      return response;
    }
  } catch (err: any) {
    console.error('Session retrieval error:', err);
    return NextResponse.json({ loggedIn: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
