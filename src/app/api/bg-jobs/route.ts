import { NextRequest, NextResponse } from 'next/server';
import { incrementGalleryVersion, setCache, getGalleryVersion } from '@/lib/cache';
import { getPublicGallery } from '@/lib/db';
import { uploadThumbnailToCloudinary } from '@/lib/cloudinary';
import { neon } from '@neondatabase/serverless';

/**
 * BACKGROUND JOB PROCESSOR
 *
 * Receives jobs enqueued via QStash (or local async fallback) and processes them
 * off the synchronous request path so users get fast responses.
 *
 * Job types:
 *   - cache-invalidate: Increment gallery cache version
 *   - write-through: Proactively populate the gallery cache for the first page
 *   - upload-thumbnail: Upload a base64 thumbnail to Cloudinary and update the DB record
 */
export async function POST(req: NextRequest) {
  try {
    const job = await req.json();
    const { type, payload } = job;

    switch (type) {
      case 'cache-invalidate': {
        await incrementGalleryVersion();
        console.log('[BG-JOB] Gallery cache version incremented');
        break;
      }

      case 'write-through': {
        // Proactively cache the first page of gallery results after a new creation
        const version = await getGalleryVersion();
        const cacheKey = `cache:gallery:v${version}:30:0::`;
        const items = await getPublicGallery(30, 0);
        await setCache(cacheKey, { items }, 30);
        console.log('[BG-JOB] Write-through cache populated for gallery first page');
        break;
      }

      case 'upload-thumbnail': {
        const { creationId, base64Thumbnail } = payload || {};
        if (!creationId || !base64Thumbnail) {
          console.warn('[BG-JOB] upload-thumbnail missing creationId or base64Thumbnail');
          break;
        }

        const thumbnailUrl = await uploadThumbnailToCloudinary(base64Thumbnail);
        if (thumbnailUrl && thumbnailUrl !== base64Thumbnail) {
          // Update the creation record with the real Cloudinary URL
          const connectionString = process.env.DATABASE_URL;
          if (connectionString) {
            const sql = neon(connectionString);
            await sql`UPDATE creations SET thumbnail_url = ${thumbnailUrl} WHERE id = ${creationId}`;
          }
          console.log(`[BG-JOB] Thumbnail uploaded and DB updated for ${creationId}`);
        }
        break;
      }

      default:
        console.warn(`[BG-JOB] Unknown job type: ${type}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[BG-JOB] Processing error:', err);
    return NextResponse.json({ error: 'Job processing failed' }, { status: 500 });
  }
}
