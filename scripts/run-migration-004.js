import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
  }
  const sql = neon(connectionString);
  const sqlContent = fs.readFileSync('./migrations/004_drop_email.sql', 'utf8');
  
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} statements to execute in migration 004.`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`\nExecuting statement ${i + 1}/${statements.length}:`);
    console.log(stmt);
    try {
      await sql.query(stmt);
      console.log('✅ Success');
    } catch (err) {
      console.error('❌ Error executing statement:', err);
      process.exit(1);
    }
  }
  console.log('\nMigration 004 completed successfully!');
}

run();
