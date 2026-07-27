import { NextRequest, NextResponse } from 'next/server';
import { getAssociatedUsername } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) {
      return NextResponse.json({ loggedIn: false });
    }

    const username = await getAssociatedUsername(deviceId);

    if (username) {
      return NextResponse.json({ loggedIn: true, username });
    } else {
      return NextResponse.json({ loggedIn: false });
    }
  } catch (err: any) {
    console.error('Session retrieval error:', err);
    return NextResponse.json({ loggedIn: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
