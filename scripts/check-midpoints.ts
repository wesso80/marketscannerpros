import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

async function main() {
  const r = await pool.query('SELECT COUNT(*) as cnt FROM timeframe_midpoints');
  console.log('Total midpoints:', r.rows[0].cnt);

  const r2 = await pool.query('SELECT DISTINCT symbol FROM timeframe_midpoints ORDER BY symbol');
  console.log('Symbols:', r2.rows.map((x: any) => x.symbol));

  const r3 = await pool.query('SELECT symbol, timeframe, COUNT(*) as cnt FROM timeframe_midpoints GROUP BY symbol, timeframe ORDER BY symbol, timeframe');
  console.table(r3.rows);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
