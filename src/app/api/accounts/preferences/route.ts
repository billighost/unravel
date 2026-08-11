import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername, updateAccountCubeSize } from '@/lib/db';

export const runtime = 'edge';

export async function PATCH(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');
    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    const username = await getAssociatedUsername(deviceId);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cubeSizeLevel } = await req.json();
    if (typeof cubeSizeLevel !== 'number' || cubeSizeLevel < 1 || cubeSizeLevel > 5) {
      return NextResponse.json({ error: 'Invalid cubeSizeLevel' }, { status: 400 });
    }

    await updateAccountCubeSize(username, cubeSizeLevel);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Preferences update error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
