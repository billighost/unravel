import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

async function generateSha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET(req: NextRequest) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ enabled: false });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'unravel_creations';

    // Cloudinary signature string structure: key1=value1&key2=value2<api_secret> sorted alphabetically
    const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = await generateSha1(stringToSign);

    return NextResponse.json({
      enabled: true,
      signature,
      timestamp,
      api_key: apiKey,
      cloud_name: cloudName,
      folder,
    });
  } catch (err: any) {
    console.error('Error generating Cloudinary signature:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
