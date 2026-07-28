import { NextRequest, NextResponse } from 'next/server';
import { updateDeviceStreak } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';
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
