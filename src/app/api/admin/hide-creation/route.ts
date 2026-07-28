import { NextRequest, NextResponse } from 'next/server';
import { getAccountForSession, isAdminEmail, adminToggleCreationVisibility } from '@/lib/db';

export const runtime = 'edge';

async function checkAdmin(req: NextRequest): Promise<boolean> {
  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return false;
  const account = await getAccountForSession(deviceId);
  if (!account?.email) return false;
  return isAdminEmail(account.email);
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { creationId, hidden } = body;

    if (!creationId || typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'creationId and hidden (boolean) are required' }, { status: 400 });
    }

    await adminToggleCreationVisibility(creationId, hidden);

    return NextResponse.json({ success: true, creationId, hidden });
  } catch (err: any) {
    console.error('Admin hide-creation error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
