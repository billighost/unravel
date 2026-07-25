/**
 * REDIS & MEMORY CACHING UTILITY
 * 
 * Provides centralized caching functions with Upstash Redis as the primary backend,
 * falling back to a thread-safe in-memory cache for local development/offline environments.
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

// In-Memory Fallback Cache for local/offline dev
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
      const data = await redis.get(key);
      if (data !== null && data !== undefined) {
        return (typeof data === 'string' ? JSON.parse(data) : data) as T;
      }
      return null;
    } catch (err) {
      console.warn('Redis get failed, using memory cache:', err);
    }
  }
  return memoryCache.get(key) as T | null;
}

export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  const stringifiedValue = JSON.stringify(value);
  if (redis) {
    try {
      await redis.set(key, stringifiedValue, { ex: ttlSeconds });
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
      await redis.del(key);
      return;
    } catch (err) {
      console.warn('Redis del failed, using memory cache:', err);
    }
  }
  memoryCache.delete(key);
}

export async function getGalleryVersion(): Promise<number> {
  const key = 'cache:gallery_version';
  if (redis) {
    try {
      const val = await redis.get<any>(key);
      if (val === null || val === undefined) return 0;
      return typeof val === 'number' ? val : parseInt(val, 10) || 0;
    } catch (err) {
      console.warn('Redis get gallery version failed:', err);
    }
  }
  return memoryCache.get(key) || 0;
}

export async function incrementGalleryVersion(): Promise<void> {
  const key = 'cache:gallery_version';
  if (redis) {
    try {
      await redis.incr(key);
      return;
    } catch (err) {
      console.warn('Redis incr gallery version failed:', err);
    }
  }
  memoryCache.incr(key);
}
