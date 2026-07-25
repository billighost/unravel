import { NextRequest, NextResponse } from 'next/server';
import { getDailyChallenge, getDeviceStreak } from '@/lib/db';
import { Profiler } from '@/lib/profiler';
import { getCache, setCache } from '@/lib/cache';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const profiler = new Profiler();
  try {
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    // 1. Get daily challenge (from cache or DB)
    profiler.start('challenge_cache', 'Daily Challenge Cache Check');
    let challenge = await getCache('cache:daily-challenge:creation');
    profiler.stop('challenge_cache', 'Daily Challenge Cache Check');

    if (!challenge) {
      profiler.start('db_challenge', 'Daily Challenge DB Query');
      challenge = await getDailyChallenge();
      profiler.stop('db_challenge', 'Daily Challenge DB Query');

      if (challenge) {
        profiler.start('challenge_cache_write', 'Daily Challenge Cache Write');
        await setCache('cache:daily-challenge:creation', challenge, 3600); // 1 hour TTL
        profiler.stop('challenge_cache_write', 'Daily Challenge Cache Write');
      }
    }

    if (!challenge) {
      return NextResponse.json({ error: 'No active daily challenge available' }, { status: 404 });
    }

    // 2. Get device streak (always live DB query, indexed by device_id)
    profiler.start('db_streak', 'Streak DB Query');
    const streakInfo = await getDeviceStreak(deviceId);
    profiler.stop('db_streak', 'Streak DB Query');

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
