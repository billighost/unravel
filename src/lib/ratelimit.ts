/**
 * UPSTASH RATELIMIT UTILITY
 * 
 * Rate limits creation uploads and report submissions per device ID / IP.
 * Uses @upstash/ratelimit and @upstash/redis when environment variables are set,
 * with a sliding window fallback for local testing.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let upstashRatelimit: Ratelimit | null = null;

if (url && token) {
  try {
    const redis = new Redis({ url, token });
    upstashRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
      analytics: true,
    });
  } catch (err) {
    console.warn('Failed to initialize Upstash Redis rate limiter:', err);
  }
}

// In-Memory Fallback Rate Limiter
class MemoryRateLimiter {
  private requests = new Map<string, number[]>();

  async check(identifier: string, limit = 10, windowMs = 60000): Promise<{ success: boolean; limit: number; remaining: number }> {
    const now = Date.now();
    let timestamps = this.requests.get(identifier) || [];
    timestamps = timestamps.filter((ts) => now - ts < windowMs);

    if (timestamps.length >= limit) {
      return { success: false, limit, remaining: 0 };
    }

    timestamps.push(now);
    this.requests.set(identifier, timestamps);
    return { success: true, limit, remaining: limit - timestamps.length };
  }
}

const memoryRateLimiter = new MemoryRateLimiter();

export async function rateLimit(identifier: string): Promise<{ success: boolean; remaining: number }> {
  if (upstashRatelimit) {
    try {
      const res = await upstashRatelimit.limit(identifier);
      return { success: res.success, remaining: res.remaining };
    } catch (err) {
      console.warn('Upstash limit call failed, using memory rate limiter:', err);
    }
  }

  const res = await memoryRateLimiter.check(identifier, 10, 60000);
  return { success: res.success, remaining: res.remaining };
}
