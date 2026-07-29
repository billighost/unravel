import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAccount, getAccountByUsername, associateDeviceWithAccount, migrateDeviceDataToAccount, isAdminUsername, verifyAdminSpecialCode } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, pin, specialCode } = body;
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ error: 'Missing device ID header' }, { status: 400 });
    }

    if (!username || username.trim().length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
    }

    if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be at least 6 numeric digits.' }, { status: 400 });
    }

    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores.' }, { status: 400 });
    }

    // Admin username gating
    if (isAdminUsername(cleanUsername)) {
      // "billighost" is auto-admin, no special code required if they manage to grab it first.
      // But let's require the code for any username containing 'admin' or 'billighost' just to be secure.
      if (!specialCode || !verifyAdminSpecialCode(specialCode)) {
        return NextResponse.json({
          error: 'This username is reserved for admin accounts. Please provide the special code to register.',
          requiresSpecialCode: true,
        }, { status: 403 });
      }
    }

    // IP rate limit signup
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const signupLimit = await rateLimit(`signup_ip:${ip}`);
    if (!signupLimit.success) {
      return NextResponse.json({ error: 'Too many registration requests. Please try again later.' }, { status: 429 });
    }

    // Check if username already exists
    const existing = await getAccountByUsername(cleanUsername);
    if (existing) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Create account
    await createAccount(cleanUsername, pinHash);

    // Migrate creations and streak
    await migrateDeviceDataToAccount(deviceId, cleanUsername);

    // Login (associate device session)
    await associateDeviceWithAccount(deviceId, cleanUsername);

    const adminFlag = isAdminUsername(cleanUsername);

    return NextResponse.json({ success: true, username: cleanUsername, isAdmin: adminFlag });
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
