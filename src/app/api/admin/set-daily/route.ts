import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername, isAdminUsername, setDailyChallenge } from '@/lib/db';
import { setCache } from '@/lib/cache';

export const runtime = 'edge';

async function checkAdmin(req: NextRequest): Promise<boolean> {
  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return false;
  const username = await getAssociatedUsername(deviceId);
  return isAdminUsername(username);
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { creationId } = body;

    if (!creationId) {
      return NextResponse.json({ error: 'creationId is required' }, { status: 400 });
    }

    await setDailyChallenge(creationId);

    // Invalidate the cached daily challenge so users see the new one immediately
    setCache('cache:daily-challenge:creation', null, 1).catch(() => {});

    return NextResponse.json({ success: true, creationId });
  } catch (err: any) {
    console.error('Admin set-daily error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
