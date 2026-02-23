import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Check current subtypes
  const r = await pool.query('SELECT catalyst_subtype, COUNT(*) as cnt FROM catalyst_events GROUP BY catalyst_subtype ORDER BY cnt DESC');
  console.log('Current subtypes in DB:');
  r.rows.forEach((row: any) => console.log(`  ${row.catalyst_subtype}: ${row.cnt}`));

  // Remap short names to proper CatalystSubtype enum values
  const remaps: [string, string][] = [
    ['MATERIAL_AGREEMENT', 'SEC_8K_MATERIAL_AGREEMENT'],
    ['BANKRUPTCY', 'SEC_8K_MATERIAL_AGREEMENT'],      // 1.02 maps to material in the real classifier
    ['LEADERSHIP', 'SEC_8K_LEADERSHIP'],
    ['STAKE', 'SEC_13D_STAKE'],
    ['GUIDANCE', 'SEC_8K_MATERIAL_AGREEMENT'],         // 8.01 maps to SEC_8K_MATERIAL_AGREEMENT in real classifier
    ['EARNINGS_RELEASE', 'SEC_8K_MATERIAL_AGREEMENT'], // 2.02 - we'll treat as material for now since it's not in CatalystSubtype enum
    ['SHAREHOLDER_VOTE', 'SEC_8K_MATERIAL_AGREEMENT'], // 5.07 - not in enum
  ];

  console.log('\nApplying remap updates...');
  for (const [fromSub, toSub] of remaps) {
    const result = await pool.query(
      'UPDATE catalyst_events SET catalyst_subtype = $1 WHERE catalyst_subtype = $2',
      [toSub, fromSub]
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`  ${fromSub} → ${toSub}: ${result.rowCount} rows`);
    }
  }

  // Verify
  console.log('\nSubtypes after remap:');
  const r2 = await pool.query('SELECT catalyst_subtype, COUNT(*) as cnt FROM catalyst_events GROUP BY catalyst_subtype ORDER BY cnt DESC');
  r2.rows.forEach((row: any) => console.log(`  ${row.catalyst_subtype}: ${row.cnt}`));

  // Also check specific tickers
  console.log('\nMETA events:');
  const meta = await pool.query('SELECT catalyst_subtype, headline FROM catalyst_events WHERE ticker = $1 ORDER BY event_timestamp_utc DESC', ['META']);
  meta.rows.forEach((row: any) => console.log(`  ${row.catalyst_subtype}: ${row.headline?.slice(0, 60)}`));

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
