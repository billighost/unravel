/**
 * Unravel API Endpoint Test Suite
 * 
 * Tests every backend endpoint from the V13 addendum against realistic data.
 * Runs against the dev server (http://localhost:3000 by default).
 * 
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. If testing against a real Neon branch: DATABASE_URL_TEST set + seeded
 *   3. If testing locally: no DATABASE_URL needed (uses in-memory store)
 * 
 * Usage:
 *   npm run test:api
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { assertTestEnvironment, testFetch, testFetchAs, TEST_BASE_URL } from './test-env-guard';

// Track IDs created during tests for cleanup/reuse
let createdId: string;
let remixId: string;
let reportTargetId: string;

beforeAll(() => {
  assertTestEnvironment();
});

// ─── POST /api/creations ─────────────────────────────────────────────────────

describe('POST /api/creations', () => {
  it('creates a creation successfully and returns a valid ID', async () => {
    const res = await testFetch('/api/creations', {
      method: 'POST',
      body: JSON.stringify({
        grid_data: {
          cols: 10,
          rows: 10,
          colors: Array.from({ length: 10 * 10 * 3 }, () => Math.random()),
        },
        source_mode: 'upload',
        is_public: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe('string');
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.shareUrl).toContain(data.id);

    // Save for later tests
    createdId = data.id;
  });

  it('creates a second creation for report testing', async () => {
    const res = await testFetch('/api/creations', {
      method: 'POST',
      body: JSON.stringify({
        grid_data: {
          cols: 5,
          rows: 5,
          colors: Array.from({ length: 5 * 5 * 3 }, () => 0.5),
        },
        source_mode: 'draw',
        is_public: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    reportTargetId = data.id;
  });

  it('rejects malformed input — missing grid_data.cols', async () => {
    const res = await testFetch('/api/creations', {
      method: 'POST',
      body: JSON.stringify({
        grid_data: {
          rows: 10,
          colors: [0.5, 0.5, 0.5],
        },
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('rejects completely missing grid_data', async () => {
    const res = await testFetch('/api/creations', {
      method: 'POST',
      body: JSON.stringify({
        source_mode: 'upload',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

// ─── GET /api/creations/:id ──────────────────────────────────────────────────

describe('GET /api/creations/:id', () => {
  it('returns correct data for a valid creation', async () => {
    // Wait briefly for creation to be queryable
    await new Promise(r => setTimeout(r, 200));

    const res = await testFetch(`/api/creations/${createdId}`);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.creation).toBeDefined();
    expect(data.creation.id).toBe(createdId);
    expect(data.creation.grid_data).toBeDefined();
    expect(data.creation.source_mode).toBe('upload');
  });

  it('returns 404 for a non-existent ID — not a 500', async () => {
    const res = await testFetch('/api/creations/nonexistent-id-12345');

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
    // Confirm it's a clean 404, not a 500 error masquerading as one
    expect(data.error).not.toContain('Internal');
  });

  it('does not serve a hidden creation', async () => {
    // We'll test this after the report threshold test hides reportTargetId
    // This is a placeholder — the actual test is in the report section below
    expect(true).toBe(true);
  });
});

// ─── POST /api/creations/:id/remix ───────────────────────────────────────────

describe('POST /api/creations/:id/remix', () => {
  it('creates a remix with correct parent_creation_id', async () => {
    const res = await testFetch(`/api/creations/${createdId}/remix`, {
      method: 'POST',
      body: JSON.stringify({
        grid_data: {
          cols: 10,
          rows: 10,
          colors: Array.from({ length: 10 * 10 * 3 }, () => Math.random()),
        },
        source_mode: 'draw',
        is_public: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    expect(data.parent_creation_id).toBe(createdId);

    remixId = data.id;
  });

  it('returns 404 for remix of a non-existent parent', async () => {
    const res = await testFetch('/api/creations/fake-parent-xyz/remix', {
      method: 'POST',
      body: JSON.stringify({
        grid_data: {
          cols: 5,
          rows: 5,
          colors: Array.from({ length: 5 * 5 * 3 }, () => 0.5),
        },
        source_mode: 'draw',
      }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

// ─── GET /api/daily-challenge ────────────────────────────────────────────────

describe('GET /api/daily-challenge', () => {
  it('returns a daily challenge with streak info', async () => {
    const res = await testFetch('/api/daily-challenge');

    // If no daily challenge is seeded, this might be 404 — that's ok for in-memory mode
    if (res.status === 200) {
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.challenge).toBeDefined();
      expect(data.streak).toBeDefined();
      expect(typeof data.streak.current_streak).toBe('number');
    } else {
      // 404 is acceptable if no challenge data exists (in-memory mode without seed)
      expect(res.status).toBe(404);
    }
  });
});

// ─── GET /api/gallery ────────────────────────────────────────────────────────

describe('GET /api/gallery', () => {
  it('returns gallery items without grid_data (V16 optimization)', async () => {
    const res = await testFetch('/api/gallery');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);

    // Verify no item includes full grid_data payload
    for (const item of data.items) {
      expect(item.grid_data).toBeUndefined();
      expect(item.disturbed_positions).toBeUndefined();
    }
  });

  it('returns only non-hidden entries', async () => {
    const res = await testFetch('/api/gallery');

    expect(res.status).toBe(200);
    const data = await res.json();

    for (const item of data.items) {
      expect(item.is_hidden).not.toBe(true);
    }
  });

  it('correctly paginates with limit parameter', async () => {
    const res = await testFetch('/api/gallery?limit=2');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.length).toBeLessThanOrEqual(2);
    expect(data.count).toBeLessThanOrEqual(2);
  });
});

// ─── POST /api/creations/:id/report ──────────────────────────────────────────

describe('POST /api/creations/:id/report', () => {
  it('increments report count on first report', async () => {
    const res = await testFetch(`/api/creations/${reportTargetId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'test report 1' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.hidden).toBe(false);
  });

  it('second report still does not hide', async () => {
    const res = await testFetch(`/api/creations/${reportTargetId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'test report 2' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hidden).toBe(false);
  });

  it('third report crosses threshold and hides the creation', async () => {
    const res = await testFetch(`/api/creations/${reportTargetId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'test report 3' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hidden).toBe(true);
    expect(data.message).toContain('hidden');
  });

  it('hidden creation is no longer served by GET', async () => {
    // Allow cache invalidation to propagate
    await new Promise(r => setTimeout(r, 500));

    const res = await testFetch(`/api/creations/${reportTargetId}`);

    // Should be 404 because the creation is now hidden
    expect(res.status).toBe(404);
  });

  it('hidden creation does not appear in gallery', async () => {
    const res = await testFetch('/api/gallery?limit=100');

    expect(res.status).toBe(200);
    const data = await res.json();

    const hiddenInGallery = data.items.find((item: any) => item.id === reportTargetId);
    expect(hiddenInGallery).toBeUndefined();
  });
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  it('rejects requests after exceeding the rate limit', async () => {
    const rateLimitDeviceId = `rate-test-${Date.now()}`;
    let rejected = false;

    // Send 12 rapid requests (limit is 10/minute)
    const promises = [];
    for (let i = 0; i < 12; i++) {
      promises.push(
        testFetchAs(rateLimitDeviceId, '/api/creations', {
          method: 'POST',
          body: JSON.stringify({
            grid_data: {
              cols: 5,
              rows: 5,
              colors: Array.from({ length: 5 * 5 * 3 }, () => 0.5),
            },
            source_mode: 'upload',
            is_public: false,
          }),
        })
      );
    }

    const responses = await Promise.all(promises);

    for (const res of responses) {
      if (res.status === 429) {
        rejected = true;
        const data = await res.json();
        expect(data.error).toContain('Too many requests');
        break;
      }
    }

    expect(rejected).toBe(true);
  }, 15000); // Extended timeout for rate limit test
});

// ─── Error Distinction (Section 3 verification) ─────────────────────────────

describe('Error Distinction: 404 vs 500', () => {
  it('genuine 404 returns a clean error message, not an internal error', async () => {
    const res = await testFetch('/api/creations/does-not-exist-at-all');

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Creation not found.');
    // No is_hidden flag on a genuine 404
    expect(data.is_hidden).toBeUndefined();
  });

  it('remix endpoint returns clean 404 for non-existent parent', async () => {
    const res = await testFetch('/api/creations/no-such-parent/remix', {
      method: 'POST',
      body: JSON.stringify({
        grid_data: { cols: 5, rows: 5, colors: [0.5, 0.5, 0.5] },
        source_mode: 'draw',
      }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('not found');
  });
});
