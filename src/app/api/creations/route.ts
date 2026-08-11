import { NextRequest, NextResponse } from 'next/server';
import { createCreation } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { Profiler } from '@/lib/profiler';
import { enqueueBackgroundJob } from '@/lib/qstash';
import { setCache } from '@/lib/cache';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const profiler = new Profiler();
  try {
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

    const { grid_data, disturbed_positions, thumbnail, source_mode, is_public, is_daily_challenge } = body;

    if (!grid_data || !grid_data.cols || !grid_data.rows || !grid_data.colors) {
      return NextResponse.json({ error: 'Invalid grid_data structure' }, { status: 400 });
    }

    // Accept hex-compressed colors (string) OR legacy raw number[] — both handled in db.ts
    // The frontend already sends hex via compressColors(), but we defend against old clients.
    if (typeof grid_data.colors !== 'string' && !Array.isArray(grid_data.colors)) {
      return NextResponse.json({ error: 'grid_data.colors must be a hex string or number array' }, { status: 400 });
    }

    const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    // Use the thumbnail directly (client already uploaded to Cloudinary via direct upload).
    // If it's still base64, save it now and enqueue a background upload job.
    const isBase64 = thumbnail && thumbnail.startsWith('data:image');
    const thumbnailUrl = thumbnail || '';

    profiler.start('db_write', 'Database Write');
    const record = await createCreation({
      id,
      device_id: deviceId,
      grid_data,
      disturbed_positions: disturbed_positions || null,
      thumbnail_url: thumbnailUrl,
      source_mode: source_mode || 'upload',
      parent_creation_id: null,
      is_daily_challenge: !!is_daily_challenge,
      is_public: !!is_public,
    });
    profiler.stop('db_write', 'Database Write');

    // Write-through caching: Cache the creation immediately (7 days TTL) so the first load is a cache-hit
    setCache(`cache:creation:${record.id}`, record, 604800).catch(() => {});

    // Return success immediately — offload non-critical work to background
    profiler.stop('total', 'Total Request Time');
    profiler.log('/api/creations');

    const response = NextResponse.json({
      success: true,
      id: record.id,
      shareUrl: `/challenge/${record.id}`,
    });

    Object.entries(profiler.getHeaders()).forEach(([k, v]) => {
      response.headers.set(k, v);
    });

    // Fire-and-forget background jobs (don't await)
    if (!!is_public) {
      enqueueBackgroundJob({ type: 'cache-invalidate', payload: {} });
      enqueueBackgroundJob({ type: 'write-through', payload: {} });
    }

    if (isBase64) {
      enqueueBackgroundJob({
        type: 'upload-thumbnail',
        payload: { creationId: id, base64Thumbnail: thumbnail },
      });
    }

    return response;
  } catch (err: any) {
    console.error('POST /api/creations error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
