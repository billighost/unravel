import { NextRequest, NextResponse } from 'next/server';
import { updateDeviceStreak } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');

    // A streak is per-device state, so a request without a device id has nothing
    // to credit. Previously this fell back to a shared 'anonymous_device' bucket,
    // which let unidentified callers mutate one global streak row.
    if (!deviceId) {
      return NextResponse.json({ error: 'Missing device identifier' }, { status: 400 });
    }

    const { success } = await rateLimit(`dc-complete:${deviceId}`);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const updatedStreak = await updateDeviceStreak(deviceId);

    return NextResponse.json({
      success: true,
      streak: updatedStreak,
    });
  } catch (err: any) {
    console.error('POST /api/daily-challenge/complete error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
