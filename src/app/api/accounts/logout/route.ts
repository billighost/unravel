import { NextRequest, NextResponse } from 'next/server';
import { removeDeviceAssociation } from '@/lib/db';
import { invalidateCache } from '@/lib/cache';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Missing device ID header' }, { status: 400 });
    }

    await removeDeviceAssociation(deviceId);
    invalidateCache(`session:${deviceId}`).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
