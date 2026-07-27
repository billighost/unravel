import { NextRequest, NextResponse } from 'next/server';
import { createCreation, getCreationById } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { Profiler } from '@/lib/profiler';
import { enqueueBackgroundJob } from '@/lib/qstash';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profiler = new Profiler();
  try {
    const { id: parentId } = await params;
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    // Parallelize rate-limit check and body parsing simultaneously
    profiler.start('rate_limit', 'Rate Limit Check');
    const [rateCheck, body] = await Promise.all([
      rateLimit(deviceId),
      req.json(),
    ]);
    profiler.stop('rate_limit', 'Rate Limit Check');

    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
    }

    profiler.start('db_read', 'Database Read Parent');
    const parentCreation = await getCreationById(parentId);
    profiler.stop('db_read', 'Database Read Parent');

    if (!parentCreation || parentCreation.is_hidden) {
      return NextResponse.json({ error: 'Parent creation not found or unavailable' }, { status: 404 });
    }

    const { grid_data, disturbed_positions, thumbnail, source_mode, is_public } = body;

    if (!grid_data || !grid_data.cols || !grid_data.rows || !grid_data.colors) {
      return NextResponse.json({ error: 'Invalid grid_data structure' }, { status: 400 });
    }

    const remixId = `rmx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    // Use thumbnail directly — client has already uploaded to Cloudinary.
    // If it's still base64, save it and enqueue a background upload.
    const isBase64 = thumbnail && thumbnail.startsWith('data:image');
    const thumbnailUrl = thumbnail || '';

    profiler.start('db_write', 'Database Write');
    const record = await createCreation({
      id: remixId,
      device_id: deviceId,
      grid_data,
      disturbed_positions: disturbed_positions || null,
      thumbnail_url: thumbnailUrl,
      source_mode: source_mode || 'draw',
      parent_creation_id: parentId,
      is_daily_challenge: false,
      is_public: !!is_public,
    });
    profiler.stop('db_write', 'Database Write');

    profiler.stop('total', 'Total Request Time');
    profiler.log(`/api/creations/${parentId}/remix`);

    const response = NextResponse.json({
      success: true,
      id: record.id,
      parent_creation_id: parentId,
      shareUrl: `/challenge/${record.id}`,
    });

    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });

    // Fire-and-forget background jobs
    if (!!is_public) {
      enqueueBackgroundJob({ type: 'cache-invalidate', payload: {} });
      enqueueBackgroundJob({ type: 'write-through', payload: {} });
    }

    if (isBase64) {
      enqueueBackgroundJob({
        type: 'upload-thumbnail',
        payload: { creationId: remixId, base64Thumbnail: thumbnail },
      });
    }

    return response;
  } catch (err: any) {
    console.error('POST /api/creations/:id/remix error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
