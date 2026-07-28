import { NextRequest, NextResponse } from 'next/server';
import { getAccountForSession, isAdminEmail, getAdminAnalytics } from '@/lib/db';
import { getCache, setCache } from '@/lib/cache';

export const runtime = 'edge';

async function checkAdmin(req: NextRequest): Promise<boolean> {
  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return false;
  const account = await getAccountForSession(deviceId);
  if (!account?.email) return false;
  return isAdminEmail(account.email);
}

export async function GET(req: NextRequest) {
  try {
    if (!(await checkAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Cache analytics for 2 minutes — data is mostly pre-aggregated so this is a safety buffer
    const cacheKey = 'admin:analytics';
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, analytics: cached, cached: true });
    }

    const analytics = await getAdminAnalytics();
    setCache(cacheKey, analytics, 120).catch(() => {}); // 2 min cache

    return NextResponse.json({ success: true, analytics });
  } catch (err: any) {
    console.error('Admin analytics error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
