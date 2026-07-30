import { NextRequest, NextResponse } from 'next/server';
import { setDailyChallenge, logAdminAction, getAssociatedUsername } from '@/lib/db';
import { setCache } from '@/lib/cache';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { creationId } = body;

    if (!creationId) {
      return NextResponse.json({ error: 'creationId is required' }, { status: 400 });
    }

    await setDailyChallenge(creationId);

    const deviceId = req.headers.get('x-device-id') || 'unknown';
    const username = await getAssociatedUsername(deviceId) || 'admin';
    await logAdminAction(
      username,
      'set_daily',
      creationId,
      `Set creation as today's daily challenge: ${creationId}`
    );

    // Warm cache: pre-populate active daily challenge cache (1 hour TTL)
    const { getCreationById } = await import('@/lib/db');
    const { setCache } = await import('@/lib/cache');
    const activeChallenge = await getCreationById(creationId);
    if (activeChallenge) {
      setCache('cache:daily-challenge:creation', activeChallenge, 3600).catch(() => {});
    } else {
      setCache('cache:daily-challenge:creation', null, 1).catch(() => {});
    }

    return NextResponse.json({ success: true, creationId });
  } catch (err: any) {
    console.error('Admin set-daily error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
