/**
 * Test Database Seeder
 * 
 * Populates the test Neon branch with realistic mock data.
 * Uses DATABASE_URL_TEST — refuses to run against production.
 * 
 * Usage:
 *   npx tsx scripts/seed-test-db.ts
 */

import * as path from 'path';

async function main() {
  // Load env files
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  } catch {
    // dotenv not installed
  }

  const testDbUrl = process.env.DATABASE_URL_TEST;
  const prodDbUrl = process.env.DATABASE_URL;

  if (!testDbUrl) {
    console.error('❌ DATABASE_URL_TEST is not set. Cannot seed test database.');
    console.error('   Set it in .env.test.local pointing to a Neon branch.');
    process.exit(1);
  }

  if (testDbUrl === prodDbUrl) {
    console.error('🛑 DATABASE_URL_TEST is the same as DATABASE_URL. Refusing to seed production.');
    process.exit(1);
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(testDbUrl);

  console.log('🌱 Seeding test database...\n');

  // Clear existing test data
  console.log('  🗑️  Clearing existing data...');
  await sql`DELETE FROM reports`;
  await sql`DELETE FROM daily_challenges`;
  await sql`DELETE FROM device_streaks`;
  await sql`DELETE FROM creations`;

  // Helper: generate realistic grid_data
  function makeGridData(cols: number, rows: number, seed: number) {
    const colors: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        colors.push(
          Math.min(1, Math.abs(Math.sin((c / cols + seed) * Math.PI))),
          Math.min(1, Math.abs(Math.cos((r / rows + seed) * Math.PI))),
          0.5 + 0.5 * Math.sin(seed * 3)
        );
      }
    }
    return JSON.stringify({ cols, rows, colors });
  }

  // Helper: date N days ago
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  const today = new Date().toISOString().split('T')[0];

  // --- Seed Creations ---
  console.log('  📦 Creating test creations...');

  // 5 normal public creations spread over the last week
  const normalIds = [
    'test-creation-001',
    'test-creation-002',
    'test-creation-003',
    'test-creation-004',
    'test-creation-005',
  ];

  for (let i = 0; i < normalIds.length; i++) {
    const id = normalIds[i];
    const gridData = makeGridData(40, 30, i * 0.7);
    const createdAt = daysAgo(normalIds.length - i);
    await sql`
      INSERT INTO creations (id, device_id, created_at, grid_data, thumbnail_url, source_mode, is_public, is_daily_challenge, report_count, is_hidden)
      VALUES (${id}, ${'test-device-001'}, ${createdAt}, ${gridData}::jsonb, ${'https://example.com/thumb.jpg'}, ${'upload'}, ${true}, ${false}, ${0}, ${false})
    `;
    console.log(`    ✅ ${id} (public, ${normalIds.length - i} days ago)`);
  }

  // 1 remix (has parent_creation_id)
  const remixId = 'test-remix-001';
  const remixGrid = makeGridData(40, 30, 5.5);
  await sql`
    INSERT INTO creations (id, device_id, created_at, grid_data, thumbnail_url, source_mode, parent_creation_id, is_public, is_daily_challenge, report_count, is_hidden)
    VALUES (${remixId}, ${'test-device-002'}, ${daysAgo(0)}, ${remixGrid}::jsonb, ${'https://example.com/remix-thumb.jpg'}, ${'draw'}, ${normalIds[0]}, ${true}, ${false}, ${0}, ${false})
  `;
  console.log(`    ✅ ${remixId} (remix of ${normalIds[0]})`);

  // 1 hidden creation (is_hidden = true)
  const hiddenId = 'test-hidden-001';
  const hiddenGrid = makeGridData(40, 30, 99);
  await sql`
    INSERT INTO creations (id, device_id, created_at, grid_data, thumbnail_url, source_mode, is_public, is_daily_challenge, report_count, is_hidden)
    VALUES (${hiddenId}, ${'test-device-003'}, ${daysAgo(2)}, ${hiddenGrid}::jsonb, ${'https://example.com/hidden-thumb.jpg'}, ${'upload'}, ${true}, ${false}, ${3}, ${true})
  `;
  console.log(`    ✅ ${hiddenId} (hidden, report_count=3)`);

  // 1 private creation (is_public = false)
  const privateId = 'test-private-001';
  const privateGrid = makeGridData(30, 20, 42);
  await sql`
    INSERT INTO creations (id, device_id, created_at, grid_data, thumbnail_url, source_mode, is_public, is_daily_challenge, report_count, is_hidden)
    VALUES (${privateId}, ${'test-device-001'}, ${daysAgo(1)}, ${privateGrid}::jsonb, ${'https://example.com/private-thumb.jpg'}, ${'draw'}, ${false}, ${false}, ${0}, ${false})
  `;
  console.log(`    ✅ ${privateId} (private)`);

  // --- Seed Daily Challenge ---
  console.log('\n  🏆 Creating daily challenge...');
  await sql`
    INSERT INTO daily_challenges (creation_id, active_date)
    VALUES (${normalIds[4]}, ${today})
  `;
  console.log(`    ✅ Today's challenge linked to ${normalIds[4]}`);

  // --- Seed a Device Streak ---
  console.log('\n  🔥 Creating device streak...');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  await sql`
    INSERT INTO device_streaks (device_id, current_streak, longest_streak, last_completed_date)
    VALUES (${'test-device-001'}, ${3}, ${5}, ${yesterdayStr})
  `;
  console.log(`    ✅ test-device-001 streak: 3 current, 5 longest`);

  // --- Summary ---
  console.log('\n✅ Test database seeded successfully!');
  console.log('   • 5 normal public creations');
  console.log('   • 1 remix creation');
  console.log('   • 1 hidden creation');
  console.log('   • 1 private creation');
  console.log('   • 1 daily challenge for today');
  console.log('   • 1 device streak record');
}

main().catch(err => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
