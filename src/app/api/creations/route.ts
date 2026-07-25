import { NextRequest, NextResponse } from 'next/server';
import { createCreation } from '@/lib/db';
import { uploadThumbnailToCloudinary } from '@/lib/cloudinary';
import { rateLimit } from '@/lib/ratelimit';
import { Profiler } from '@/lib/profiler';
import { incrementGalleryVersion } from '@/lib/cache';

export async function POST(req: NextRequest) {
  const profiler = new Profiler();
  try {
    const deviceId = req.headers.get('x-device-id') || 'anonymous_device';

    profiler.start('rate_limit', 'Rate Limit Check');
    const rateCheck = await rateLimit(deviceId);
    profiler.stop('rate_limit', 'Rate Limit Check');
    
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
    }

    const body = await req.json();
    const { grid_data, disturbed_positions, thumbnail, source_mode, is_public, is_daily_challenge } = body;

    if (!grid_data || !grid_data.cols || !grid_data.rows || !grid_data.colors) {
      return NextResponse.json({ error: 'Invalid grid_data structure' }, { status: 400 });
    }

    const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    profiler.start('cloudinary', 'Cloudinary Upload');
    const thumbnailUrl = await uploadThumbnailToCloudinary(thumbnail || '');
    profiler.stop('cloudinary', 'Cloudinary Upload');

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

    if (!!is_public) {
      profiler.start('cache_invalidate', 'Cache Invalidation');
      await incrementGalleryVersion();
      profiler.stop('cache_invalidate', 'Cache Invalidation');
    }

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

    return response;
  } catch (err: any) {
    console.error('POST /api/creations error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
