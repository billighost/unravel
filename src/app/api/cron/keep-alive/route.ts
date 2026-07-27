import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * Neon DB Keep-Alive Cron Endpoint
 * 
 * Runs every 5 minutes via Vercel Cron to prevent Neon compute cold starts.
 * Executes a trivial indexed query to keep the connection warm.
 */
export async function GET(req: Request) {
  // Verify the request comes from Vercel Cron (or allow in dev)
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ status: 'skipped', reason: 'No DATABASE_URL configured' });
  }

  try {
    const sql = neon(connectionString);
    const start = performance.now();
    await sql`SELECT 1`;
    const duration = (performance.now() - start).toFixed(2);

    console.log(`[KEEP-ALIVE] DB ping successful in ${duration}ms`);
    return NextResponse.json({ status: 'ok', ping_ms: parseFloat(duration) });
  } catch (err: any) {
    console.error('[KEEP-ALIVE] DB ping failed:', err.message);
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
