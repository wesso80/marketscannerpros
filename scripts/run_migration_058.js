// Run migration 058 — disclosure_acceptance table
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { join } = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  try {
    // Additive, idempotent schema only. Never create acceptance records.
    await pool.query(readFileSync(join(__dirname, '../migrations/058_disclosure_acceptance.sql'), 'utf8'));
    console.log('[migration 058] disclosure_acceptance ready');
  } finally {
    await pool.end();
  }
}

run().catch((e) => { console.error('[migration 058] failed', e.code || e.name); process.exit(1); });
