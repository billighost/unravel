import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
// Load from .env.local
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env.local');
    process.exit(1);
  }
  const sql = neon(connectionString);

  console.log('Starting DB fix for username case-sensitivity: billighost -> Billighost');

  try {
    // 1. Check if 'billighost' (lowercase) exists
    const accounts = await sql`SELECT * FROM accounts WHERE username = 'billighost'`;
    if (accounts.length === 0) {
      console.log("No lowercase 'billighost' user found. Maybe it's already fixed or doesn't exist.");
      // Just check if Billighost exists
      const checkBillighost = await sql`SELECT * FROM accounts WHERE username = 'Billighost'`;
      console.log(`'Billighost' account exists: ${checkBillighost.length > 0}`);
      process.exit(0);
    }

    const billighostAcc = accounts[0];
    console.log("Found 'billighost' account. Pin Hash:", billighostAcc.pin_hash);

    // 2. Insert 'Billighost' if it doesn't exist
    const checkTarget = await sql`SELECT * FROM accounts WHERE username = 'Billighost'`;
    if (checkTarget.length === 0) {
      console.log("Creating 'Billighost' (case-sensitive) account...");
      await sql`
        INSERT INTO accounts (username, pin_hash, created_at)
        VALUES ('Billighost', ${billighostAcc.pin_hash}, ${billighostAcc.created_at})
      `;
      console.log("✅ Created 'Billighost' account.");
    } else {
      console.log("'Billighost' already exists.");
    }

    // 3. Update referencing tables
    console.log("Updating referencing tables...");
    
    // Update creations
    const creationsUpd = await sql`
      UPDATE creations
      SET username = 'Billighost'
      WHERE username = 'billighost'
    `;
    console.log(`✅ Updated creations: ${creationsUpd.length || 0} rows.`);

    // Update device_sessions
    const sessionsUpd = await sql`
      UPDATE device_sessions
      SET username = 'Billighost'
      WHERE username = 'billighost'
    `;
    console.log(`✅ Updated device_sessions: ${sessionsUpd.length || 0} rows.`);

    // Update device_streaks
    const streaksUpd = await sql`
      UPDATE device_streaks
      SET username = 'Billighost'
      WHERE username = 'billighost'
    `;
    console.log(`✅ Updated device_streaks: ${streaksUpd.length || 0} rows.`);

    // 4. Delete the old lowercase account
    console.log("Deleting old 'billighost' (lowercase) account...");
    await sql`DELETE FROM accounts WHERE username = 'billighost'`;
    console.log("✅ Deleted lowercase 'billighost' account.");

    console.log('🎉 Fix completed successfully!');
  } catch (err) {
    console.error('❌ Error during fix:', err);
    process.exit(1);
  }
}

run();
