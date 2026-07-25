import { NextRequest, NextResponse } from 'next/server';
import { reportCreation } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { Profiler } from '@/lib/profiler';
import { invalidateCache, incrementGalleryVersion } from '@/lib/cache';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profiler = new Profiler();
  try {
    const { id } = await params;
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    profiler.start('rate_limit', 'Rate Limit Check');
    const rateCheck = await rateLimit(`report_${deviceId}`);
    profiler.stop('rate_limit', 'Rate Limit Check');

    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many report actions. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    profiler.start('db_report', 'Report Database Write');
    const result = await reportCreation(id, reason);
    profiler.stop('db_report', 'Report Database Write');

    if (result.hidden) {
      profiler.start('cache_invalidate', 'Cache Invalidation');
      // Purge the creation lookup cache
      await invalidateCache(`cache:creation:${id}`);
      // Invalidate the public gallery cache
      await incrementGalleryVersion();
      profiler.stop('cache_invalidate', 'Cache Invalidation');
    }

    profiler.stop('total', 'Total Request Time');
    profiler.log(`/api/creations/${id}/report`);

    const response = NextResponse.json({
      success: true,
      hidden: result.hidden,
      message: result.hidden
        ? 'Thank you for reporting. This creation has crossed the report threshold and is now hidden.'
        : 'Thank you for your report.',
    });

    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });

    return response;
  } catch (err: any) {
    console.error('POST /api/creations/:id/report error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
