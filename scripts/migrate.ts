/**
 * Database Migration Runner
 * 
 * Reads numbered SQL migration files from /migrations, tracks which have been
 * applied in a _migrations table, and runs any unapplied ones in order.
 * 
 * Usage:
 *   npx tsx scripts/migrate.ts
 * 
 * Reads DATABASE_URL from environment (supports .env.local via dotenv).
 */

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Load .env.local if dotenv is available
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  } catch {
    // dotenv not installed, rely on environment variables
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }

  // Dynamic import to avoid issues in non-Node environments
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);

  console.log('🔄 Running database migrations...\n');

  // Ensure _migrations tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Get list of already-applied migrations
  const applied = await sql`SELECT filename FROM _migrations ORDER BY filename`;
  const appliedSet = new Set(applied.map((r: any) => r.filename));

  // Read migration files from /migrations directory
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found. Nothing to do.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ranCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ✅ ${file} (already applied)`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8').trim();

    if (!content) {
      console.log(`  ⏭️  ${file} (empty, skipping)`);
      continue;
    }

    console.log(`  🔧 Applying ${file}...`);

    try {
      // Use sql.query() for dynamic SQL content loaded from files.
      // Tagged templates can't be used here because the SQL is a runtime string.
      // Split on semicolons to handle multi-statement files.
      // Strip single-line comments (-- ...) and multi-line comments (/* ... */)
      const sqlWithoutComments = content
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      const statements = sqlWithoutComments
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        await sql.query(statement);
      }

      // Record this migration as applied
      await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
      console.log(`  ✅ ${file} applied successfully`);
      ranCount++;
    } catch (err) {
      console.error(`  ❌ Failed to apply ${file}:`, err);
      process.exit(1);
    }
  }

  if (ranCount === 0) {
    console.log('\n✅ All migrations are up to date.');
  } else {
    console.log(`\n✅ Applied ${ranCount} migration(s) successfully.`);
  }
}

main().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
