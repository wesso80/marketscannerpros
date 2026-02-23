import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // TSLA events and subtypes
  const r = await pool.query(
    `SELECT catalyst_subtype, COUNT(*) as cnt, MIN(headline) as sample_headline 
     FROM catalyst_events WHERE ticker = 'TSLA' GROUP BY catalyst_subtype ORDER BY cnt DESC`
  );
  console.log('TSLA subtypes:');
  r.rows.forEach((row: any) => console.log(`  ${row.catalyst_subtype}: ${row.cnt} — ${row.sample_headline?.slice(0, 60)}`));

  // Count TSLA per subtype with lookback
  const cutoff = new Date(Date.now() - 1825 * 86400000);
  for (const row of r.rows) {
    const sub = row.catalyst_subtype;
    const countR = await pool.query(
      'SELECT COUNT(*) as cnt FROM catalyst_events WHERE ticker = $1 AND catalyst_subtype = $2 AND event_timestamp_utc >= $3',
      ['TSLA', sub, cutoff]
    );
    const cnt = parseInt(countR.rows[0].cnt);
    const cohort = cnt >= 10 ? 'TICKER' : 'MARKET';
    console.log(`  ${sub}: ${cnt} ticker events → cohort=${cohort}`);

    if (cohort === 'MARKET') {
      const marketCount = await pool.query(
        'SELECT COUNT(*) as cnt FROM catalyst_events WHERE catalyst_subtype = $1 AND event_timestamp_utc >= $2',
        [sub, cutoff]
      );
      console.log(`    MARKET cohort: ${marketCount.rows[0].cnt} total events`);
    }
  }

  // Check anchor timestamps on TSLA events
  console.log('\nTSLA event timestamps:');
  const events = await pool.query(
    `SELECT catalyst_subtype, event_timestamp_utc, event_timestamp_et, anchor_timestamp_et, session 
     FROM catalyst_events WHERE ticker = 'TSLA' ORDER BY event_timestamp_utc DESC LIMIT 5`
  );
  events.rows.forEach((row: any) => {
    console.log(`  ${row.catalyst_subtype} | utc=${row.event_timestamp_utc} | et=${row.event_timestamp_et} | anchor=${row.anchor_timestamp_et} | session=${row.session}`);
  });

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
