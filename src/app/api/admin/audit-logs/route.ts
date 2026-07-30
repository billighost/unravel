import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuditLogs } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100'));
    const logs = await getAdminAuditLogs(limit);

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    console.error('GET /api/admin/audit-logs error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
