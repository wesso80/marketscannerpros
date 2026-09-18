/**
 * Apply one SQL migration file to DATABASE_URL and print before/after counts.
 *   npx tsx scripts/apply-migration.ts migrations/100_symbol_universe_asset_hygiene.sql
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import { Pool } from 'pg';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: apply-migration.ts <file.sql>');
  const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: true } : undefined });
  const counts = async () => (await pool.query(`SELECT asset_type, enabled, COUNT(*)::int n FROM symbol_universe GROUP BY 1,2 ORDER BY 1,2`)).rows;
  console.log('before', JSON.stringify(await counts()));
  await pool.query(sql);
  console.log('after ', JSON.stringify(await counts()));
  const bad = await pool.query(`SELECT symbol FROM symbol_universe WHERE asset_type='equity' AND (symbol ~ '^[A-Z0-9]{2,12}(USDT|USDC|USD)$' AND length(symbol) > 4 OR symbol IN ('GC','GC1','MGC1','NQ1','SPX'))`);
  console.log('remaining violations', bad.rows.length);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
