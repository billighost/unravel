import { NextRequest, NextResponse } from 'next/server';
import { updateAccountCubeSizeByDevice } from '@/lib/db';

export const runtime = 'edge';

export async function PATCH(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');
    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Fast parsing: if it's just a raw number in the payload, use text()
    let cubeSizeLevel: number;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      cubeSizeLevel = body.cubeSizeLevel;
    } else {
      cubeSizeLevel = parseInt(await req.text(), 10);
    }

    if (typeof cubeSizeLevel !== 'number' || isNaN(cubeSizeLevel) || cubeSizeLevel < 1 || cubeSizeLevel > 5) {
      return NextResponse.json({ error: 'Invalid cubeSizeLevel' }, { status: 400 });
    }

    const updated = await updateAccountCubeSizeByDevice(deviceId, cubeSizeLevel);
    if (!updated) {
      return NextResponse.json({ error: 'Unauthorized or account not found' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Preferences update error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
