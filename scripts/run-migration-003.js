// Migration runner 003 — strips comments before splitting
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(connectionString);
  const migrationPath = path.join(__dirname, '..', 'migrations', '003_admin_analytics.sql');
  const raw = fs.readFileSync(migrationPath, 'utf8');

  // Remove single-line comments then split on semicolons
  const stripped = raw
    .split('\n')
    .map(line => {
      const commentIdx = line.indexOf('--');
      return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
    })
    .join('\n');

  const statements = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 4);

  console.log(`Running ${statements.length} statements from migration 003...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await sql.query(stmt);
      const preview = stmt.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] OK: ${preview}...`);
    } catch (err) {
      const preview = stmt.substring(0, 120).replace(/\s+/g, ' ');
      console.error(`  [${i + 1}/${statements.length}] ERROR: ${err.message.split('\n')[0]}`);
      console.error(`    -> ${preview}`);
    }
  }

  console.log('\nMigration 003 complete!');
}

runMigration().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
