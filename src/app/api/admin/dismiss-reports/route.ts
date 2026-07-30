import { NextRequest, NextResponse } from 'next/server';
import { adminDismissReports, logAdminAction, getAssociatedUsername } from '@/lib/db';
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

    const deviceId = req.headers.get('x-device-id') || 'unknown';
    const username = await getAssociatedUsername(deviceId) || 'admin';

    await adminDismissReports(creationId);
    
    // Log the moderation action to the audit logs
    await logAdminAction(
      username,
      'dismiss',
      creationId,
      `Dismissed all reports on creation: ${creationId}`
    );

    return NextResponse.json({ success: true, creationId });
  } catch (err: any) {
    console.error('POST /api/admin/dismiss-reports error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
