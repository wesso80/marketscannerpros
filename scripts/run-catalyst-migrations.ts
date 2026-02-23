// Temporary script to run catalyst migrations and seed data
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

async function q(sql: string, params?: any[]): Promise<any[]> {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function run() {
  try {
    // Check existing tables
    const tables = await q(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'catalyst%'`
    );
    console.log('Existing catalyst tables:', tables.map((r: any) => r.table_name));

    // Run migrations in order
    const migrationFiles = [
      'migrations/038_catalyst_events.sql',
      'migrations/039_catalyst_event_studies.sql',
      'migrations/040_catalyst_event_members.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
      console.log(`\nRunning ${file}...`);
      await q(sql);
      console.log(`  ✓ ${file} done`);
    }

    // Verify tables exist now
    const tablesAfter = await q(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'catalyst%'`
    );
    console.log('\nCatalyst tables after migration:', tablesAfter.map((r: any) => r.table_name));

    console.log('\n✓ All migrations complete');
  } catch (e: any) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
  await pool.end();
  process.exit(0);
}
run();
