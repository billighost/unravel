/**
 * REDIS & MEMORY CACHING UTILITY
 *
 * Provides centralized caching functions with Upstash Redis as the primary backend,
 * falling back to a thread-safe in-memory cache for local development/offline environments.
 *
 * Cache format version: v2
 * All Redis keys are prefixed with KEY_PREFIX to allow clean invalidation of the v1
 * format (which double-JSON-stringified values via an explicit JSON.stringify before
 * the SDK's own serialisation step). v2 passes values directly to the SDK.
 */

import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (url && token) {
  try {
    redis = new Redis({ url, token });
  } catch (err) {
    console.warn('Failed to initialize Upstash Redis for caching:', err);
  }
}

/**
 * Key prefix for cache format version 2.
 * Bumping this value invalidates all v1 keys without touching live traffic —
 * the old keys simply expire naturally while new writes use the v2 namespace.
 */
const KEY_PREFIX = 'v2:';
function prefixKey(key: string): string {
  return KEY_PREFIX + key;
}

// ─── In-process gallery version cache ─────────────────────────────────────────
// Caches the gallery version counter in the V8 isolate for 5 s so the vast
// majority of gallery GET requests skip the Redis round-trip entirely. The
// version only changes when a new public creation is posted, so a 5-second
// stale reading is acceptable (the CDN already has a 30-second s-maxage anyway).
let _galleryVersionCache: { val: number; expiresAt: number } | null = null;

// ─── In-Memory Fallback Cache ──────────────────────────────────────────────────
class MemoryCache {
  private store = new Map<string, { value: any; expiresAt: number }>();

  get(key: string): any {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: any, ttlSeconds: number) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  incr(key: string): number {
    const val = (this.get(key) || 0) + 1;
    this.set(key, val, 31536000); // 1 year TTL
    return val;
  }
}

const memoryCache = new MemoryCache();

export async function getCache<T = any>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const data = await redis.get(prefixKey(key));
      if (data !== null && data !== undefined) {
        // v2: the Upstash SDK deserialises the stored value natively — no
        // manual JSON.parse needed. Simply return the value as-is.
        return data as T;
      }
      return null;
    } catch (err) {
      console.warn('Redis get failed, using memory cache:', err);
    }
  }
  return memoryCache.get(key) as T | null;
}

export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      // v2: pass the raw value; the Upstash SDK handles serialisation.
      // Previously we called JSON.stringify here, causing a double-encode.
      await redis.set(prefixKey(key), value, { ex: ttlSeconds });
      return;
    } catch (err) {
      console.warn('Redis set failed, using memory cache:', err);
    }
  }
  memoryCache.set(key, value, ttlSeconds);
}

export async function invalidateCache(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(prefixKey(key));
      return;
    } catch (err) {
      console.warn('Redis del failed, using memory cache:', err);
    }
  }
  memoryCache.delete(key);
}

export async function getGalleryVersion(): Promise<number> {
  // Serve from the in-process cache if still fresh — avoids a Redis RTT on
  // every gallery GET (the single biggest latency win in the gallery route).
  if (_galleryVersionCache && Date.now() < _galleryVersionCache.expiresAt) {
    return _galleryVersionCache.val;
  }

  const key = prefixKey('cache:gallery_version');
  let val = 0;

  if (redis) {
    try {
      const raw = await redis.get<any>(key);
      if (raw !== null && raw !== undefined) {
        val = typeof raw === 'number' ? raw : parseInt(raw, 10) || 0;
      }
    } catch (err) {
      console.warn('Redis get gallery version failed:', err);
      val = memoryCache.get('cache:gallery_version') || 0;
    }
  } else {
    val = memoryCache.get('cache:gallery_version') || 0;
  }

  // Populate the in-process cache; expires in 5 s.
  _galleryVersionCache = { val, expiresAt: Date.now() + 5_000 };
  return val;
}

export async function incrementGalleryVersion(): Promise<void> {
  // Invalidate the in-process cache immediately so the next gallery request
  // reads the freshly incremented version from Redis.
  _galleryVersionCache = null;

  const key = prefixKey('cache:gallery_version');
  if (redis) {
    try {
      await redis.incr(key);
      return;
    } catch (err) {
      console.warn('Redis incr gallery version failed:', err);
    }
  }
  memoryCache.incr('cache:gallery_version');
}
