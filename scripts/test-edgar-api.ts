// Test EDGAR EFTS API connectivity and check DB state
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  // 1. Check how many rows in catalyst_events
  const countRes = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_events');
  console.log('catalyst_events row count:', countRes.rows[0].cnt);

  const studyCount = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_event_studies');
  console.log('catalyst_event_studies row count:', studyCount.rows[0].cnt);

  // 2. Test EDGAR EFTS search-index endpoint
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  
  const urls = [
    `https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=${sevenDaysAgo}&enddt=${today}&forms=8-K`,
    `https://efts.sec.gov/LATEST/search-index?q=*&dateRange=custom&startdt=${sevenDaysAgo}&enddt=${today}&forms=8-K`,
  ];

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 
          'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', 
          Accept: 'application/json' 
        },
      });
      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Response (first 500 chars): ${text.slice(0, 500)}`);
      
      if (res.ok) {
        try {
          const data = JSON.parse(text);
          console.log(`  Total hits: ${data.hits?.total?.value ?? data.hits?.total ?? 'unknown'}`);
          if (data.hits?.hits?.length > 0) {
            console.log(`  First hit keys: ${Object.keys(data.hits.hits[0]).join(', ')}`);
            console.log(`  First hit _source keys: ${Object.keys(data.hits.hits[0]._source || {}).join(', ')}`);
            console.log(`  First hit sample: ${JSON.stringify(data.hits.hits[0], null, 2).slice(0, 500)}`);
          }
        } catch (e) {
          console.log('  Not JSON');
        }
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // 3. Also test the public search endpoint (different URL)
  const altUrl = `https://efts.sec.gov/LATEST/search-index?q=%228-K%22&forms=8-K&dateRange=custom&startdt=${sevenDaysAgo}&enddt=${today}&_source=file_date,display_date_time,form_type,entity_name,file_num,items`;
  console.log(`\nTesting with _source filter: ${altUrl}`);
  try {
    const res = await fetch(altUrl, {
      headers: { 
        'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', 
        Accept: 'application/json' 
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response (first 500 chars): ${text.slice(0, 500)}`);
  } catch (err: any) {
    console.log(`  Error: ${err.message}`);
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
