import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAccountByUsername, associateDeviceWithAccount } from '@/lib/db';
import { getCache, setCache, invalidateCache } from '@/lib/cache';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, pin } = body;
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Missing device ID header' }, { status: 400 });
    }

    if (!username || !pin) {
      return NextResponse.json({ error: 'Username and PIN are required.' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim();

    // 1. IP Rate Limiting (Second Layer)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const ipLimit = await rateLimit(`login_ip:${ip}`);
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // 2. Lockout Check
    const failedKey = `failed_logins:${cleanUsername}`;
    const lockoutKey = `lockout:${cleanUsername}`;
    const failedAttempts = await getCache<number>(failedKey) || 0;

    if (failedAttempts >= 5) {
      const lockoutExpiry = await getCache<number>(lockoutKey);
      if (lockoutExpiry && Date.now() < lockoutExpiry) {
        const remainingSeconds = Math.ceil((lockoutExpiry - Date.now()) / 1000);
        return NextResponse.json({
          error: `Account is temporarily locked due to too many failed attempts. Try again in ${remainingSeconds}s.`
        }, { status: 429 });
      }
    }

    // Get Account
    const account = await getAccountByUsername(cleanUsername);
    if (!account) {
      // Return general incorrect message to prevent username enumeration, but increment failed attempts for the input username
      return handleFailedLogin(cleanUsername, failedAttempts, failedKey, lockoutKey);
    }

    // Compare PIN
    const match = await bcrypt.compare(pin, account.pin_hash);
    if (!match) {
      return handleFailedLogin(cleanUsername, failedAttempts, failedKey, lockoutKey);
    }

    // Success! Clear limits and invalidate session cache
    await Promise.all([
      invalidateCache(failedKey),
      invalidateCache(lockoutKey),
    ]);

    // Login (associate device session) and update session cache
    await associateDeviceWithAccount(deviceId, cleanUsername);
    setCache(`session:${deviceId}`, cleanUsername, 300).catch(() => {}); // Warm session cache

    return NextResponse.json({ success: true, username: cleanUsername });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleFailedLogin(username: string, failedAttempts: number, failedKey: string, lockoutKey: string) {
  const newFailedAttempts = failedAttempts + 1;
  await setCache(failedKey, newFailedAttempts, 86400); // 24 hours retention

  if (newFailedAttempts >= 5) {
    // Lockout starts at 60s and doubles with each subsequent fail: 60s, 120s, 240s...
    const duration = 60 * Math.pow(2, newFailedAttempts - 5);
    const lockoutExpiry = Date.now() + duration * 1000;
    await setCache(lockoutKey, lockoutExpiry, duration);
    return NextResponse.json({
      error: `Incorrect PIN. Too many failed attempts. Account locked for ${duration}s.`
    }, { status: 401 });
  }

  return NextResponse.json({
    error: `Incorrect PIN. ${5 - newFailedAttempts} attempts remaining.`
  }, { status: 401 });
}
