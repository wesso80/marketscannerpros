// Run migration 058 — disclosure_acceptance table
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: true } : undefined,
});

async function run() {
  const sql = `
    CREATE TABLE IF NOT EXISTS disclosure_acceptance (
      workspace_id UUID PRIMARY KEY,
      version      TEXT NOT NULL DEFAULT '1',
      accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(sql);
  console.log('✅ disclosure_acceptance table created');
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
