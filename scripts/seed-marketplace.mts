/**
 * MARKETPLACE SEEDER
 *
 * Wipes the database and repopulates it with a realistic public marketplace:
 * 100 accounts, each with ~10 image + ~10 draw + ~10 text creations, all
 * published publicly, with cross-user view counts and matching analytics.
 *
 * Image artworks use real photos from picsum.photos. Every URL is fetched and
 * checked for a 200 before it is stored, so no gallery card can 404. Draw and
 * text artworks are generated locally (see lib/artgen.mts) and carry an inline
 * PNG thumbnail.
 *
 * The `Billighost` admin account and its device session are preserved so you do
 * not lose dashboard access.
 *
 * Usage:
 *   npx tsx scripts/seed-marketplace.mts            # clear + seed
 *   npx tsx scripts/seed-marketplace.mts --clear-only
 *   npx tsx scripts/seed-marketplace.mts --users 20 --per-mode 3
 */

import * as path from 'path';
import { config } from 'dotenv';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { Redis } from '@upstash/redis';

import {
  makeRng,
  renderDrawArtwork,
  renderTextArtwork,
  averageToGrid,
  fitGrid,
  type Bitmap,
} from './lib/artgen';

config({ path: path.resolve(process.cwd(), '.env.local') });

// ─── Configuration ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = parseInt(args[i + 1], 10);
  return Number.isFinite(value) ? value : fallback;
};

const CLEAR_ONLY = args.includes('--clear-only');
const USER_COUNT = flag('users', 100);
const PER_MODE = flag('per-mode', 10);

/** The admin account kept across the wipe so dashboard access survives. */
const PRESERVED_ADMIN = 'Billighost';

/** Shared PIN for every seeded account. Test data only. */
const SEED_PIN = '1234';

/** Grid resolutions, matching the app's high quality tier. */
const GRID_MAX = 28;
const GRID_TYPE_COLS = 40;

/** Render sizes for locally generated artwork. */
const DRAW_W = 420;
const DRAW_H = 280;
const TEXT_W = 480;
const TEXT_H = 240;

/** Long edge of the stored PNG thumbnail for generated artwork. */
const THUMB_W = 512;

const IMAGE_FETCH_CONCURRENCY = 8;
const INSERT_BATCH = 40;
const DAYS_SPREAD = 30;

// ─── Database ────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}
const sql = postgres(dbUrl);

const log = (msg: string) => console.log(msg);

// ─── Name generation ─────────────────────────────────────────────────────────

const ADJECTIVES = [
  'Pixel', 'Neon', 'Cosmic', 'Velvet', 'Golden', 'Silent', 'Electric', 'Crimson',
  'Lunar', 'Solar', 'Frost', 'Ember', 'Iron', 'Jade', 'Copper', 'Midnight',
  'Prism', 'Echo', 'Nova', 'Quartz', 'Amber', 'Cobalt', 'Onyx', 'Coral',
  'Zen', 'Retro', 'Turbo', 'Glass', 'Paper', 'Chrome',
];

const NOUNS = [
  'Painter', 'Weaver', 'Sculptor', 'Dreamer', 'Builder', 'Wanderer', 'Forge',
  'Studio', 'Atlas', 'Cipher', 'Comet', 'Falcon', 'Garden', 'Harbor', 'Lantern',
  'Mosaic', 'Orbit', 'Prism', 'Rocket', 'Signal', 'Tinker', 'Vector', 'Willow',
  'Anvil', 'Beacon', 'Canvas', 'Drifter', 'Engine', 'Fable', 'Glyph',
];

/** Deterministic, unique, schema-valid usernames (letters/digits/underscore). */
function buildUsernames(count: number, rng: () => number): string[] {
  const used = new Set<string>([PRESERVED_ADMIN.toLowerCase()]);
  const names: string[] = [];

  while (names.length < count) {
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)];
    const suffix = Math.floor(rng() * 900) + 100;
    const name = `${adj}${noun}${suffix}`;
    const key = name.toLowerCase();
    // 'admin' anywhere in a username is treated as an admin account by the app,
    // so those combinations must never be generated.
    if (used.has(key) || key.includes('admin')) continue;
    used.add(key);
    names.push(name);
  }

  return names;
}

const TEXT_PHRASES = [
  'MAKE\nSOMETHING', 'HELLO\nWORLD', 'STAY\nWEIRD', 'BUILD\nIT', 'PIXEL\nPERFECT',
  'GOOD\nVIBES', 'NO RULES', 'DREAM BIG', 'KEEP GOING', 'BE KIND',
  'CREATE\nDAILY', 'THINK\nSMALL', 'LESS IS\nMORE', 'SHIP IT', 'TRY AGAIN',
  'GAME ON', 'RISE UP', 'STAY\nCURIOUS', 'MADE WITH\nUNRAVEL', 'CUBE\nLIFE',
  'THE FUTURE IS BLOCKY AND BRIGHT', 'EVERY PIXEL COUNTS WHEN YOU BUILD SLOWLY',
  'ART IS A MESS UNTIL IT IS NOT', 'SMASH IT THEN PUT IT BACK TOGETHER AGAIN',
  'BREAK THINGS\nFIX THINGS\nREPEAT', 'HOLD ON\nLET GO', 'ONE MORE\nTRY',
  'FIND THE\nQUIET', 'LOUD\nCOLOURS', 'SOFT\nEDGES',
];

// ─── Colour encoding (matches the client's encodeColorsForApi) ────────────────

const BASE64_PREFIX = 'b64:';

function encodeColorsForApi(colors: Float32Array): string {
  const bytes = Buffer.allocUnsafe(colors.length);
  for (let i = 0; i < colors.length; i++) {
    bytes[i] = Math.min(255, Math.max(0, Math.round(colors[i] * 255)));
  }
  return BASE64_PREFIX + bytes.toString('base64');
}

// ─── Thumbnails ──────────────────────────────────────────────────────────────

/** Encodes a generated bitmap as a compact palette PNG data URL. */
async function bitmapToThumbnailDataUrl(bmp: Bitmap): Promise<string> {
  const png = await sharp(Buffer.from(bmp.data), {
    raw: { width: bmp.width, height: bmp.height, channels: 3 },
  })
    .resize({ width: THUMB_W })
    // Palette PNGs keep these inline thumbnails at a few KB apiece, which
    // matters when 2000 of them live in the database.
    .png({ palette: true, colors: 64, effort: 7, compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${png.toString('base64')}`;
}

// ─── Image artworks ──────────────────────────────────────────────────────────

interface ImageArtwork {
  colors: Float32Array;
  cols: number;
  rows: number;
  thumbnailUrl: string;
}

/**
 * Fetches one photo, verifies it really is a 200 with image bytes, and samples
 * it into a cube grid. Retries with a different seed on failure so a transient
 * upstream error never leaves a broken URL in the database.
 */
async function buildImageArtwork(seedIndex: number, attempt = 0): Promise<ImageArtwork | null> {
  if (attempt >= 4) return null;

  const seed = `unravel-${seedIndex}-${attempt}`;
  const sampleUrl = `https://picsum.photos/seed/${seed}/240/160`;
  const displayUrl = `https://picsum.photos/seed/${seed}/600/400`;

  try {
    const res = await fetch(sampleUrl, { redirect: 'follow' });
    if (!res.ok) return buildImageArtwork(seedIndex, attempt + 1);

    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return buildImageArtwork(seedIndex, attempt + 1);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 512) return buildImageArtwork(seedIndex, attempt + 1);

    const { data, info } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bitmap: Bitmap = {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data),
    };

    const { cols, rows } = fitGrid(info.width / info.height, GRID_MAX);
    const colors = averageToGrid(bitmap, cols, rows, 'photo');

    // Confirm the URL that actually gets stored resolves too.
    const displayCheck = await fetch(displayUrl, { method: 'GET', redirect: 'follow' });
    if (!displayCheck.ok) return buildImageArtwork(seedIndex, attempt + 1);
    // Drain the body so the connection can be reused.
    await displayCheck.arrayBuffer();

    return { colors, cols, rows, thumbnailUrl: displayUrl };
  } catch {
    return buildImageArtwork(seedIndex, attempt + 1);
  }
}

/** Runs an async mapper over items with a fixed concurrency ceiling. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return out;
}

// ─── Clearing ────────────────────────────────────────────────────────────────

async function listTables(): Promise<string[]> {
  const rows = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `) as Array<{ table_name: string }>;
  return rows.map((r) => r.table_name);
}

async function countAll(tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = (await sql.unsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`)) as Array<{
      n: number;
    }>;
    counts[table] = rows[0].n;
  }
  return counts;
}

async function clearDatabase(tables: string[]) {
  log('\nClearing database...');

  // Content tables: wiped wholesale.
  const wipe = [
    'creations',
    'daily_challenges',
    'device_streaks',
    'reports',
    'daily_activity',
    'source_mode_stats',
    'admin_audit_logs',
    '_migrations_skip', // placeholder, filtered below
  ].filter((t) => tables.includes(t));

  for (const table of wipe) {
    await sql.unsafe(`TRUNCATE TABLE "${table}"`);
    log(`  cleared ${table}`);
  }

  // Accounts and sessions: everything except the preserved admin. Deleting an
  // account cascades to its device_sessions rows.
  if (tables.includes('device_sessions')) {
    await sql`DELETE FROM device_sessions WHERE username <> ${PRESERVED_ADMIN}`;
    log('  cleared device_sessions (kept admin session)');
  }
  if (tables.includes('accounts')) {
    await sql`DELETE FROM accounts WHERE username <> ${PRESERVED_ADMIN}`;
    log(`  cleared accounts (kept ${PRESERVED_ADMIN})`);
  }

  if (tables.includes('analytics_counters')) {
    await sql`UPDATE analytics_counters SET value = 0, updated_at = NOW()`;
    log('  reset analytics_counters');
  }
}

// ─── Seeding ─────────────────────────────────────────────────────────────────

interface CreationRow {
  id: string;
  device_id: string;
  username: string;
  created_at: string;
  grid_data: string;
  thumbnail_url: string;
  source_mode: string;
  is_public: boolean;
  view_count: number;
}

async function insertCreations(rows: CreationRow[]) {
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    const batch = rows.slice(start, start + INSERT_BATCH);
    const values: any[] = [];
    const tuples: string[] = [];

    batch.forEach((row, i) => {
      const b = i * 9;
      tuples.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::jsonb, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`
      );
      values.push(
        row.id,
        row.device_id,
        row.username,
        row.created_at,
        row.grid_data,
        row.thumbnail_url,
        row.source_mode,
        row.is_public,
        row.view_count
      );
    });

    await sql.unsafe(
      `INSERT INTO creations
         (id, device_id, username, created_at, grid_data, thumbnail_url, source_mode, is_public, view_count)
       VALUES ${tuples.join(', ')}`,
      values
    );
  }
}

async function main() {
  const tables = await listTables();
  log(`Connected. Tables: ${tables.join(', ')}`);

  const before = await countAll(tables);
  log('\nBefore:');
  for (const [table, n] of Object.entries(before)) log(`  ${table.padEnd(20)} ${n}`);

  await clearDatabase(tables);

  if (CLEAR_ONLY) {
    const after = await countAll(tables);
    log('\nAfter:');
    for (const [table, n] of Object.entries(after)) log(`  ${table.padEnd(20)} ${n}`);
    return;
  }

  // ── Accounts ───────────────────────────────────────────────────────────────
  const rng = makeRng(20260812);
  const usernames = buildUsernames(USER_COUNT, rng);

  log(`\nCreating ${usernames.length} accounts...`);
  // One hash reused across seeded accounts: 100 bcrypt rounds of the same test
  // PIN would cost ~10s for no benefit in fixture data.
  const pinHash = await bcrypt.hash(SEED_PIN, 10);
  const now = Date.now();

  for (let start = 0; start < usernames.length; start += INSERT_BATCH) {
    const batch = usernames.slice(start, start + INSERT_BATCH);
    const values: any[] = [];
    const tuples: string[] = [];
    batch.forEach((username, i) => {
      const b = i * 3;
      tuples.push(`($${b + 1}, $${b + 2}, $${b + 3})`);
      const createdAt = new Date(now - Math.floor(rng() * DAYS_SPREAD * 86400000)).toISOString();
      values.push(username, pinHash, createdAt);
    });
    await sql.unsafe(
      `INSERT INTO accounts (username, pin_hash, created_at) VALUES ${tuples.join(', ')}
       ON CONFLICT (username) DO NOTHING`,
      values
    );
  }

  const deviceIds = new Map(usernames.map((u) => [u, `seed_dev_${u.toLowerCase()}`]));

  for (let start = 0; start < usernames.length; start += INSERT_BATCH) {
    const batch = usernames.slice(start, start + INSERT_BATCH);
    const values: any[] = [];
    const tuples: string[] = [];
    batch.forEach((username, i) => {
      const b = i * 2;
      tuples.push(`($${b + 1}, $${b + 2})`);
      values.push(deviceIds.get(username), username);
    });
    await sql.unsafe(
      `INSERT INTO device_sessions (device_id, username) VALUES ${tuples.join(', ')}
       ON CONFLICT (device_id) DO NOTHING`,
      values
    );
  }
  log(`  ${usernames.length} accounts + sessions created (PIN ${SEED_PIN})`);

  // ── Image artworks ─────────────────────────────────────────────────────────
  const imageTotal = usernames.length * PER_MODE;
  log(`\nFetching and sampling ${imageTotal} photos (concurrency ${IMAGE_FETCH_CONCURRENCY})...`);

  let fetched = 0;
  const imageArtworks = await mapLimit(
    Array.from({ length: imageTotal }, (_, i) => i),
    IMAGE_FETCH_CONCURRENCY,
    async (index) => {
      const artwork = await buildImageArtwork(index);
      fetched++;
      if (fetched % 100 === 0) log(`  ${fetched}/${imageTotal} photos`);
      return artwork;
    }
  );

  const failedImages = imageArtworks.filter((a) => a === null).length;
  log(`  done — ${imageTotal - failedImages} usable, ${failedImages} unavailable`);

  // ── Build all creation rows ────────────────────────────────────────────────
  log(`\nGenerating ${usernames.length * PER_MODE * 3} creations...`);

  const rows: CreationRow[] = [];
  let imageCursor = 0;
  let generated = 0;

  for (let u = 0; u < usernames.length; u++) {
    const username = usernames[u];
    const deviceId = deviceIds.get(username)!;

    for (let k = 0; k < PER_MODE; k++) {
      const daysAgo = rng() * DAYS_SPREAD;
      const createdAt = new Date(now - daysAgo * 86400000).toISOString();
      // Long-tail view counts: most creations get a handful of views from other
      // users, a few break out.
      const viewCount = Math.floor(Math.pow(rng(), 2.2) * (usernames.length - 1)) + (rng() < 0.5 ? 0 : 1);

      // 1. Image artwork
      const image = imageArtworks[imageCursor++];
      if (image) {
        rows.push({
          id: `seed_img_${u}_${k}`,
          device_id: deviceId,
          username,
          created_at: createdAt,
          grid_data: JSON.stringify({
            cols: image.cols,
            rows: image.rows,
            colors: encodeColorsForApi(image.colors),
          }),
          thumbnail_url: image.thumbnailUrl,
          source_mode: 'upload',
          is_public: true,
          view_count: viewCount,
        });
      }

      // 2. Draw artwork
      const draw = renderDrawArtwork((u * 1000 + k) * 31 + 7, DRAW_W, DRAW_H);
      const drawGrid = fitGrid(DRAW_W / DRAW_H, GRID_MAX);
      rows.push({
        id: `seed_draw_${u}_${k}`,
        device_id: deviceId,
        username,
        created_at: createdAt,
        grid_data: JSON.stringify({
          cols: drawGrid.cols,
          rows: drawGrid.rows,
          colors: encodeColorsForApi(
            averageToGrid(draw.bitmap, drawGrid.cols, drawGrid.rows, 'draw')
          ),
        }),
        thumbnail_url: await bitmapToThumbnailDataUrl(draw.bitmap),
        source_mode: 'draw',
        is_public: true,
        view_count: Math.floor(Math.pow(rng(), 2.2) * (usernames.length - 1)),
      });

      // 3. Text artwork
      const phrase = TEXT_PHRASES[Math.floor(rng() * TEXT_PHRASES.length)];
      const textBitmap = renderTextArtwork(phrase, TEXT_W, TEXT_H);
      const textRows = Math.round(GRID_TYPE_COLS / 2);
      rows.push({
        id: `seed_text_${u}_${k}`,
        device_id: deviceId,
        username,
        created_at: createdAt,
        grid_data: JSON.stringify({
          cols: GRID_TYPE_COLS,
          rows: textRows,
          colors: encodeColorsForApi(averageToGrid(textBitmap, GRID_TYPE_COLS, textRows, 'type')),
        }),
        thumbnail_url: await bitmapToThumbnailDataUrl(textBitmap),
        source_mode: 'type',
        is_public: true,
        view_count: Math.floor(Math.pow(rng(), 2.2) * (usernames.length - 1)),
      });

      generated += 3;
    }

    if ((u + 1) % 10 === 0) log(`  ${u + 1}/${usernames.length} users (${generated} creations)`);
  }

  log(`\nInserting ${rows.length} creations...`);
  await insertCreations(rows);

  // ── Daily challenge ────────────────────────────────────────────────────────
  // Without a row for today the home screen reports "no daily picture".
  const todayKey = new Date().toISOString().slice(0, 10);
  const feature = rows[Math.floor(rng() * rows.length)];
  await sql`UPDATE creations SET is_daily_challenge = TRUE WHERE id = ${feature.id}`;
  await sql`
    INSERT INTO daily_challenges (creation_id, active_date)
    VALUES (${feature.id}, ${todayKey})
    ON CONFLICT (active_date) DO UPDATE SET creation_id = EXCLUDED.creation_id
  `;
  log(`  daily challenge for ${todayKey}: ${feature.id}`);

  // ── Analytics ──────────────────────────────────────────────────────────────
  log('\nRebuilding analytics...');

  await sql`
    INSERT INTO source_mode_stats (source_mode, count)
    SELECT source_mode, COUNT(*) FROM creations GROUP BY source_mode
    ON CONFLICT (source_mode) DO UPDATE SET count = EXCLUDED.count
  `;

  await sql`
    INSERT INTO daily_activity (date, creations_count, public_count, views)
    SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
           COUNT(*),
           COUNT(*) FILTER (WHERE is_public = TRUE),
           COALESCE(SUM(view_count), 0)
    FROM creations
    GROUP BY 1
    ON CONFLICT (date) DO UPDATE
      SET creations_count = EXCLUDED.creations_count,
          public_count = EXCLUDED.public_count,
          views = EXCLUDED.views
  `;

  await sql`
    INSERT INTO daily_activity (date, new_accounts)
    SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), COUNT(*)
    FROM accounts GROUP BY 1
    ON CONFLICT (date) DO UPDATE SET new_accounts = EXCLUDED.new_accounts
  `;

  const counters: Array<[string, string]> = [
    ['total_creations', 'SELECT COUNT(*)::bigint FROM creations'],
    ['total_public', 'SELECT COUNT(*)::bigint FROM creations WHERE is_public = TRUE AND is_hidden = FALSE'],
    ['total_hidden', 'SELECT COUNT(*)::bigint FROM creations WHERE is_hidden = TRUE'],
    ['total_accounts', 'SELECT COUNT(*)::bigint FROM accounts'],
    ['total_views', 'SELECT COALESCE(SUM(view_count), 0)::bigint FROM creations'],
  ];

  for (const [key, query] of counters) {
    await sql.unsafe(
      `INSERT INTO analytics_counters (key, value)
       SELECT $1, (${query})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key]
    );
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const after = await countAll(await listTables());
  log('\nAfter:');
  for (const [table, n] of Object.entries(after)) log(`  ${table.padEnd(20)} ${n}`);

  const summary = (await sql`
    SELECT source_mode, COUNT(*)::int AS n, SUM(view_count)::int AS views
    FROM creations GROUP BY source_mode ORDER BY source_mode
  `) as Array<{ source_mode: string; n: number; views: number }>;

  log('\nBy mode:');
  for (const s of summary) log(`  ${s.source_mode.padEnd(8)} ${s.n} creations, ${s.views} views`);
}

main()
  .then(() => {
    log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nSeeding failed:', err);
    process.exit(1);
  });
