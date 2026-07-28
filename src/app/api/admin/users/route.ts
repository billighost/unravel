import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername, isAdminUsername, adminListUsers } from '@/lib/db';

export const runtime = 'edge';

async function checkAdmin(req: NextRequest): Promise<boolean> {
  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return false;
  const username = await getAssociatedUsername(deviceId);
  return isAdminUsername(username);
}

export async function GET(req: NextRequest) {
  try {
    if (!(await checkAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50'));
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const users = await adminListUsers(limit, offset);

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    console.error('Admin users error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
