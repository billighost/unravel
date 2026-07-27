/**
 * QSTASH BACKGROUND JOB QUEUE UTILITY
 * 
 * Publishes background jobs to QStash for async processing.
 * Falls back to local async execution if QSTASH_TOKEN is not configured.
 */

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const QSTASH_URL = 'https://qstash.upstash.io/v2/publish/';

export interface BackgroundJob {
  type: 'cache-invalidate' | 'write-through' | 'upload-thumbnail';
  payload: Record<string, any>;
}

/**
 * Enqueue a background job. Uses QStash in production, or fires a local
 * async fetch to /api/bg-jobs in dev/when QStash isn't configured.
 */
export async function enqueueBackgroundJob(job: BackgroundJob): Promise<void> {
  const body = JSON.stringify(job);

  if (QSTASH_TOKEN) {
    // Determine the app's public URL for the callback
    const appUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const isLocal = appUrl.includes('localhost') || appUrl.includes('127.0.0.1');

    if (isLocal) {
      fireLocalAsync(body);
      return;
    }

    try {
      const res = await fetch(`${QSTASH_URL}${appUrl}/api/bg-jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!res.ok) {
        console.warn(`[QSTASH] Failed to enqueue job (${res.status}):`, await res.text());
      }
    } catch (err) {
      console.warn('[QSTASH] Enqueue error, falling back to local async:', err);
      fireLocalAsync(body);
    }
  } else {
    // No QStash — fire-and-forget local async execution
    fireLocalAsync(body);
  }
}

/**
 * Fire-and-forget: call the local bg-jobs endpoint asynchronously.
 * We don't await the result — the caller returns immediately.
 */
function fireLocalAsync(body: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  fetch(`${appUrl}/api/bg-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch((err) => {
    console.warn('[BG-JOB] Local async fire failed:', err);
  });
}
