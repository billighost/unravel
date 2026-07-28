import { NextRequest } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { getAssociatedUsername, isAdminUsername } from '@/lib/db';

/**
 * Shared, Redis-cached admin authentication helper.
 *
 * Caches the result of the device-id → username → isAdmin lookup for 60 seconds
 * so that every admin route does NOT pay 2 serial Redis/DB round-trips per request.
 *
 * Usage:
 *   import { requireAdmin } from '@/lib/adminAuth';
 *   if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
 */
export async function requireAdmin(req: NextRequest): Promise<boolean> {
  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return false;

  // Check cached admin status first (60s TTL)
  const cacheKey = `isAdmin:${deviceId}`;
  const cached = await getCache<boolean>(cacheKey);
  if (cached !== null && cached !== undefined) {
    return cached === true;
  }

  // Resolve from DB/cache chain
  const username = await getAssociatedUsername(deviceId);
  const isAdmin = isAdminUsername(username);

  // Cache result for 60 seconds (short enough that a login change is reflected quickly)
  setCache(cacheKey, isAdmin, 60).catch(() => {});

  return isAdmin;
}
