import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAccount, getAccountByUsername, associateDeviceWithAccount, migrateDeviceDataToAccount } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, pin } = body;
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

    const cleanUsername = username.toLowerCase().trim();
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores.' }, { status: 400 });
    }

    // IP rate limit signup
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const signupLimit = await rateLimit(`signup_ip:${ip}`);
    if (!signupLimit.success) {
      return NextResponse.json({ error: 'Too many registration requests. Please try again later.' }, { status: 429 });
    }

    // Check if account already exists
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

    return NextResponse.json({ success: true, username: cleanUsername });
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
