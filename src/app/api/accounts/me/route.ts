import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername } from '@/lib/db';
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
      return NextResponse.json({ loggedIn: true, username });
    } else {
      return NextResponse.json({ loggedIn: false });
    }
  } catch (err: any) {
    console.error('Session retrieval error:', err);
    return NextResponse.json({ loggedIn: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
