import { NextRequest, NextResponse } from 'next/server';
import { getDailyChallenge, getDeviceStreak } from '@/lib/db';
import { Profiler } from '@/lib/profiler';
import { getCache, setCache } from '@/lib/cache';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const profiler = new Profiler();
  try {
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    profiler.start('parallel_fetch', 'Parallel DB & Cache Fetch');
    // Fetch both the cached challenge and the user's specific streak simultaneously
    const [cachedChallenge, streakInfo] = await Promise.all([
      getCache('cache:daily-challenge:creation'),
      deviceId !== 'anonymous_device' ? getDeviceStreak(deviceId) : Promise.resolve({ current_streak: 0, longest_streak: 0, completed_today: false }),
    ]);
    profiler.stop('parallel_fetch', 'Parallel DB & Cache Fetch');

    let challenge = cachedChallenge;

    if (!challenge) {
      profiler.start('db_challenge', 'Daily Challenge DB Query');
      challenge = await getDailyChallenge();
      profiler.stop('db_challenge', 'Daily Challenge DB Query');

      if (challenge) {
        // Fire and forget cache write
        setCache('cache:daily-challenge:creation', challenge, 3600).catch(() => {}); // 1 hour TTL
      }
    }

    if (!challenge) {
      return NextResponse.json({ error: 'No active daily challenge available' }, { status: 404 });
    }

    profiler.stop('total', 'Total Request Time');
    profiler.log('/api/daily-challenge');

    const response = NextResponse.json({
      success: true,
      challenge,
      streak: streakInfo,
    });

    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });
    // Add caching header for Edge CDN, but keep private since streak is returned
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return response;
  } catch (err: any) {
    console.error('GET /api/daily-challenge error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
