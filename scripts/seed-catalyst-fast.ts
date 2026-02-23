// Fast batch seed of catalyst_events from SEC EDGAR
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

const EFTS_BASE = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_FILING_BASE = 'https://www.sec.gov/Archives/edgar/data';

function formatDate(d: Date): string { return d.toISOString().slice(0, 10); }

let cikTickerMap: Map<string, string> | null = null;

async function loadCikTickerMap(): Promise<Map<string, string>> {
  if (cikTickerMap) return cikTickerMap;
  console.log('Loading SEC CIK→Ticker map...');
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)' },
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data: Record<string, { cik_str: number; ticker: string }> = await res.json();
  const map = new Map<string, string>();
  for (const entry of Object.values(data)) {
    map.set(String(entry.cik_str).padStart(10, '0'), entry.ticker.toUpperCase());
  }
  cikTickerMap = map;
  console.log(`  ${map.size} CIK→Ticker mappings loaded`);
  return map;
}

// Item → subtype classification
const ITEM_MAP: Record<string, { subtype: string; severity: string; confidence: number }> = {
  '1.01': { subtype: 'MATERIAL_AGREEMENT', severity: 'MED', confidence: 0.85 },
  '1.02': { subtype: 'BANKRUPTCY', severity: 'HIGH', confidence: 0.90 },
  '2.01': { subtype: 'MNA_DEFINITIVE', severity: 'HIGH', confidence: 0.85 },
  '2.02': { subtype: 'EARNINGS_RELEASE', severity: 'HIGH', confidence: 0.95 },
  '5.02': { subtype: 'LEADERSHIP', severity: 'MED', confidence: 0.85 },
  '5.07': { subtype: 'SHAREHOLDER_VOTE', severity: 'MED', confidence: 0.80 },
  '8.01': { subtype: 'GUIDANCE', severity: 'MED', confidence: 0.60 },
};

interface Row {
  ticker: string;
  headline: string;
  url: string;
  subtype: string;
  ts: Date;
  session: string;
  anchor: Date;
  confidence: number;
  severity: string;
  reason: string;
  payload: string;
}

function classifyAndBuild(src: any, cik: string, ticker: string, adsh: string, filingDate: string, formType: string): Row | null {
  const items: string[] = Array.isArray(src.items) ? src.items : [];
  const baseForm = formType.replace(/\/A$/, '');

  let subtype: string;
  let severity: string;
  let confidence: number;
  let reason: string;

  if (baseForm === '8-K') {
    let matched = false;
    for (const item of items) {
      const m = ITEM_MAP[item];
      if (m) {
        subtype = m.subtype;
        severity = m.severity;
        confidence = m.confidence;
        reason = `8-K Item ${item}: ${m.subtype}`;
        matched = true;
        break;
      }
    }
    if (!matched) {
      subtype = 'GUIDANCE';
      severity = 'LOW';
      confidence = 0.50;
      reason = `8-K items: ${items.join(', ') || 'none'}`;
    }
  } else if (baseForm === '13D' || baseForm === 'SC 13D') {
    subtype = 'STAKE';
    severity = 'HIGH';
    confidence = 0.90;
    reason = `${formType} filing`;
  } else if (baseForm === '10-K' || baseForm === '10-Q') {
    subtype = 'SEC_10K_10Q';
    severity = 'LOW';
    confidence = 0.95;
    reason = `${formType} filing`;
  } else {
    return null;
  }

  const ts = new Date(`${filingDate}T16:00:00Z`);
  // Rough ET classification
  const session = 'AFTERHOURS'; // File date filings are assumed filed during market hours, available after
  const anchor = new Date(ts);
  anchor.setUTCDate(anchor.getUTCDate() + 1);
  anchor.setUTCHours(14, 30, 0, 0); // Next day 9:30 ET (EST)

  const displayName = src.display_names?.[0] ?? '';
  const companyName = displayName.replace(/\s*\(.*$/, '').trim();
  const accFlat = adsh.replace(/-/g, '');

  return {
    ticker,
    headline: `${formType} Filing: ${reason}`,
    url: `${EDGAR_FILING_BASE}/${cik}/${accFlat}`,
    subtype: subtype!,
    ts,
    session,
    anchor,
    confidence: confidence!,
    severity: severity!,
    reason: reason!,
    payload: JSON.stringify({ accessionNumber: adsh, cik, formType, items, filingDate, companyName }),
  };
}

async function queryAndInsert(formType: string, startDate: string, endDate: string): Promise<{ ingested: number; skipped: number }> {
  const tickerMap = await loadCikTickerMap();
  let from = 0;
  const size = 100;
  let hasMore = true;
  let totalIngested = 0;
  let totalSkipped = 0;

  while (hasMore) {
    const params = new URLSearchParams({
      q: `"${formType}"`,
      dateRange: 'custom',
      startdt: startDate,
      enddt: endDate,
      forms: formType,
      from: String(from),
      size: String(size),
    });

    const res = await fetch(`${EFTS_BASE}?${params}`, {
      headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)' },
    });

    if (!res.ok) { console.error(`  EFTS ${formType} failed: ${res.status}`); break; }
    const body = await res.json();
    const hits = body.hits?.hits ?? [];

    // Build batch of rows
    const rows: Row[] = [];
    for (const hit of hits) {
      const src = hit._source;
      const cik = src.ciks?.[0] ?? hit._id.replace(/-/g, '').slice(0, 10);
      const ticker = tickerMap.get(cik);
      if (!ticker) { totalSkipped++; continue; }

      const adsh = src.adsh ?? hit._id.split(':')[0];
      const ft = src.root_forms?.[0] ?? src.form ?? formType;
      const row = classifyAndBuild(src, cik, ticker, adsh, src.file_date, ft);
      if (!row) { totalSkipped++; continue; }
      rows.push(row);
    }

    // Batch insert with ON CONFLICT skip
    if (rows.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];
        
        batch.forEach((r, idx) => {
          const base = idx * 14;
          placeholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14})`);
          values.push(
            r.ticker, 'SEC', r.headline, r.url,
            'SEC_FILING', r.subtype,
            r.ts, r.ts, // utc and et same for file_date-based
            r.session, r.anchor,
            r.confidence, r.severity, r.reason, r.payload
          );
        });

        try {
          const result = await pool.query(
            `INSERT INTO catalyst_events (
              ticker, source, headline, url, catalyst_type, catalyst_subtype,
              event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
              confidence, severity, classification_reason, raw_payload
            ) VALUES ${placeholders.join(',')}
            ON CONFLICT DO NOTHING`,
            values
          );
          totalIngested += result.rowCount ?? 0;
        } catch (err: any) {
          console.error(`  Batch insert error: ${err.message}`);
        }
      }
    }

    const totalHits = body.hits?.total?.value ?? 0;
    from += hits.length;
    hasMore = hits.length === size && from < totalHits && from < 10_000;
    
    if (from % 1000 === 0 && from > 0) {
      process.stdout.write(`    ...${from} processed\n`);
    }
  }

  return { ingested: totalIngested, skipped: totalSkipped };
}

async function run() {
  const LOOKBACK_DAYS = 90;
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000));

  console.log(`Seeding catalyst_events: ${startDate} → ${endDate} (${LOOKBACK_DAYS} days)\n`);

  const TARGET_FORMS = ['8-K', '13D', '13D/A', '10-K', '10-Q', 'SC 13D', 'SC 13D/A'];
  let grandTotal = 0;
  let grandSkipped = 0;

  for (const formType of TARGET_FORMS) {
    process.stdout.write(`${formType}... `);
    const { ingested, skipped } = await queryAndInsert(formType, startDate, endDate);
    console.log(`ingested ${ingested}, skipped ${skipped}`);
    grandTotal += ingested;
    grandSkipped += skipped;
  }

  // Summary
  const count = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_events');
  const tickerCount = await pool.query('SELECT COUNT(DISTINCT ticker) as cnt FROM catalyst_events');
  
  console.log(`\n════════════════════════════════════════`);
  console.log(`Total ingested: ${grandTotal}`);
  console.log(`Total skipped: ${grandSkipped}`);
  console.log(`DB rows: ${count.rows[0].cnt}`);
  console.log(`Distinct tickers: ${tickerCount.rows[0].cnt}`);

  // Popular tickers
  const popular = ['META', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'DIS', 'BA', 'JPM', 'GS'];
  console.log('\nPopular ticker coverage:');
  for (const t of popular) {
    const r = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_events WHERE ticker = $1', [t]);
    if (parseInt(r.rows[0].cnt) > 0) console.log(`  ${t}: ${r.rows[0].cnt} events`);
  }

  // Sample recent events
  const sample = await pool.query(
    `SELECT ticker, catalyst_subtype, headline, event_timestamp_utc::date as filed 
     FROM catalyst_events ORDER BY event_timestamp_utc DESC LIMIT 10`
  );
  console.log('\nMost recent events:');
  for (const row of sample.rows) {
    console.log(`  ${row.filed} | ${row.ticker.padEnd(6)} | ${row.catalyst_subtype.padEnd(20)} | ${row.headline?.slice(0, 50)}`);
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
