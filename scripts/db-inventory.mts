/**
 * Read-only inventory of the Neon database: table names and row counts, plus a
 * peek at the accounts table so admin usernames can be sanity-checked.
 *
 * Run: npx tsx scripts/db-inventory.mts
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const sql = neon(url);

const tables = (await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`) as Array<{ table_name: string }>;

console.log('\nTables and row counts:');
for (const { table_name } of tables) {
  // Identifiers cannot be parameterised, and these names come straight from
  // information_schema, so they are quoted rather than interpolated raw.
  // sql.query() is the non-template form for dynamic SQL text.
  const rows = (await sql.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`)) as Array<{
    n: number;
  }>;
  console.log(`  ${table_name.padEnd(28)} ${rows[0].n}`);
}

const hasAccounts = tables.some((t) => t.table_name === 'accounts');
if (hasAccounts) {
  const accounts = (await sql`
    SELECT username, created_at FROM accounts ORDER BY created_at ASC
  `) as Array<{ username: string; created_at: string }>;
  console.log('\nAccounts:');
  for (const a of accounts) {
    console.log(`  ${a.username}`);
  }
}
