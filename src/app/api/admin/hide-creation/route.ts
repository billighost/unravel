import { NextRequest, NextResponse } from 'next/server';
import { adminToggleCreationVisibility } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
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
