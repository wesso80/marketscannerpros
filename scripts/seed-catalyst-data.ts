// Seed catalyst_events from SEC EDGAR with a longer lookback
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

const EFTS_BASE = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_FILING_BASE = 'https://www.sec.gov/Archives/edgar/data';
const TARGET_FORMS = ['8-K', '13D', '13D/A', '10-K', '10-Q', 'SC 13D', 'SC 13D/A'];

// Simple date formatting helper
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

let cikTickerMap: Map<string, string> | null = null;

async function loadCikTickerMap(): Promise<Map<string, string>> {
  if (cikTickerMap) return cikTickerMap;
  console.log('Loading SEC CIK→Ticker map...');
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load company_tickers.json: ${res.status}`);
  const data: Record<string, { cik_str: number; ticker: string; title: string }> = await res.json();
  const map = new Map<string, string>();
  for (const entry of Object.values(data)) {
    map.set(String(entry.cik_str).padStart(10, '0'), entry.ticker.toUpperCase());
  }
  cikTickerMap = map;
  console.log(`  Loaded ${map.size} CIK→Ticker mappings`);
  return map;
}

// 8-K item → subtype mapping (simplified from classifier.ts)
const ITEM_MAP: Record<string, { subtype: string; severity: string; confidence: number }> = {
  '1.01': { subtype: 'MATERIAL_AGREEMENT', severity: 'MED', confidence: 0.85 },
  '1.02': { subtype: 'BANKRUPTCY', severity: 'HIGH', confidence: 0.90 },
  '2.01': { subtype: 'MNA_DEFINITIVE', severity: 'HIGH', confidence: 0.85 },
  '2.02': { subtype: 'EARNINGS_RELEASE', severity: 'HIGH', confidence: 0.95 },
  '5.02': { subtype: 'LEADERSHIP', severity: 'MED', confidence: 0.85 },
  '5.07': { subtype: 'SHAREHOLDER_VOTE', severity: 'MED', confidence: 0.80 },
  '8.01': { subtype: 'GUIDANCE', severity: 'MED', confidence: 0.60 },
};

const FORM_MAP: Record<string, { subtype: string; type: string; severity: string; confidence: number }> = {
  '13D':       { subtype: 'STAKE', type: 'OWNERSHIP', severity: 'HIGH', confidence: 0.90 },
  '13D/A':     { subtype: 'STAKE', type: 'OWNERSHIP', severity: 'HIGH', confidence: 0.90 },
  'SC 13D':    { subtype: 'STAKE', type: 'OWNERSHIP', severity: 'HIGH', confidence: 0.90 },
  'SC 13D/A':  { subtype: 'STAKE', type: 'OWNERSHIP', severity: 'HIGH', confidence: 0.90 },
  '10-K':      { subtype: 'SEC_10K_10Q', type: 'SEC_FILING', severity: 'LOW', confidence: 0.95 },
  '10-Q':      { subtype: 'SEC_10K_10Q', type: 'SEC_FILING', severity: 'LOW', confidence: 0.95 },
};

interface Filing {
  accessionNumber: string;
  cik: string;
  ticker: string | null;
  companyName: string;
  formType: string;
  filingDate: string;
  items: string[];
}

async function queryEdgar(formType: string, startDate: string, endDate: string): Promise<Filing[]> {
  const tickerMap = await loadCikTickerMap();
  const results: Filing[] = [];
  let from = 0;
  const size = 100;
  let hasMore = true;

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
      headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error(`  EFTS failed for ${formType}: ${res.status}`);
      break;
    }

    const body = await res.json();
    const hits = body.hits?.hits ?? [];

    for (const hit of hits) {
      const src = hit._source;
      const cik = src.ciks?.[0] ?? hit._id.replace(/-/g, '').slice(0, 10);
      const ticker = tickerMap.get(cik) ?? null;
      const displayName = src.display_names?.[0] ?? '';
      const companyName = displayName.replace(/\s*\(.*$/, '').trim();
      const accessionNumber = src.adsh ?? hit._id.split(':')[0];

      results.push({
        accessionNumber,
        cik,
        ticker,
        companyName,
        formType: src.root_forms?.[0] ?? src.form ?? formType,
        filingDate: src.file_date,
        items: Array.isArray(src.items) ? src.items : [],
      });
    }

    const totalHits = body.hits?.total?.value ?? 0;
    from += hits.length;
    hasMore = hits.length === size && from < totalHits && from < 10_000;
  }

  return results;
}

function classifyFiling(filing: Filing): { subtype: string; type: string; severity: string; confidence: number; reason: string } | null {
  const baseForm = filing.formType.replace(/\/A$/, '');
  
  if (baseForm === '8-K') {
    // Find highest-priority item
    for (const item of filing.items) {
      const match = ITEM_MAP[item];
      if (match) {
        return {
          subtype: match.subtype,
          type: 'SEC_FILING',
          severity: match.severity,
          confidence: match.confidence,
          reason: `8-K Item ${item}: ${match.subtype}`,
        };
      }
    }
    // Generic 8-K
    return {
      subtype: 'GUIDANCE',
      type: 'SEC_FILING',
      severity: 'LOW',
      confidence: 0.50,
      reason: `8-K with items: ${filing.items.join(', ') || 'none'}`,
    };
  }

  const formMatch = FORM_MAP[baseForm];
  if (formMatch) {
    return {
      subtype: formMatch.subtype,
      type: formMatch.type,
      severity: formMatch.severity,
      confidence: formMatch.confidence,
      reason: `${filing.formType} filing`,
    };
  }

  return null;
}

// Simple session classifier
function classifySession(timestamp: Date): { session: string; anchorET: Date } {
  // Convert to ET (approximate — offset -5 + DST check)
  const et = new Date(timestamp.getTime());
  const month = et.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11; // rough approximation
  const etHour = (et.getUTCHours() + (isDST ? -4 : -5) + 24) % 24;
  
  let session: string;
  if (etHour >= 4 && etHour < 9.5) session = 'PREMARKET';
  else if (etHour >= 9.5 && etHour < 16) session = 'REGULAR';
  else if (etHour >= 16 && etHour < 20) session = 'AFTERHOURS';
  else session = 'OVERNIGHT';

  // Anchor: next regular session open or same-day open
  const anchor = new Date(timestamp);
  if (session === 'PREMARKET' || session === 'OVERNIGHT') {
    // Anchor at next 9:30 ET
    anchor.setUTCHours(isDST ? 13 : 14, 30, 0, 0);
  } else if (session === 'REGULAR') {
    anchor.setUTCHours(isDST ? 13 : 14, 30, 0, 0);
  } else {
    // AFTERHOURS — anchor at next day 9:30 ET
    anchor.setUTCDate(anchor.getUTCDate() + 1);
    anchor.setUTCHours(isDST ? 13 : 14, 30, 0, 0);
  }

  return { session, anchorET: anchor };
}

async function run() {
  const LOOKBACK_DAYS = 90; // 90 days for initial seed
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000));

  console.log(`\nSeeding catalyst_events from SEC EDGAR`);
  console.log(`Date range: ${startDate} → ${endDate} (${LOOKBACK_DAYS} days)`);
  console.log(`Form types: ${TARGET_FORMS.join(', ')}\n`);

  let totalIngested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const formType of TARGET_FORMS) {
    console.log(`Querying EDGAR for ${formType}...`);
    const filings = await queryEdgar(formType, startDate, endDate);
    console.log(`  Found ${filings.length} filings`);

    let ingested = 0;
    let skipped = 0;

    for (const filing of filings) {
      if (!filing.ticker) { skipped++; continue; }

      const classification = classifyFiling(filing);
      if (!classification) { skipped++; continue; }

      const timestamp = new Date(`${filing.filingDate}T16:00:00Z`);
      const { session, anchorET } = classifySession(timestamp);

      try {
        // Dedup check
        const existing = await pool.query(
          'SELECT id FROM catalyst_events WHERE ticker = $1 AND source = $2 AND event_timestamp_utc = $3 LIMIT 1',
          [filing.ticker, 'SEC', timestamp]
        );
        if (existing.rows.length > 0) { skipped++; continue; }

        await pool.query(
          `INSERT INTO catalyst_events (
            ticker, source, headline, url, catalyst_type, catalyst_subtype,
            event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
            confidence, severity, classification_reason, raw_payload
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )`,
          [
            filing.ticker,
            'SEC',
            `${filing.formType} Filing: ${classification.reason}`,
            `${EDGAR_FILING_BASE}/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}`,
            classification.type,
            classification.subtype,
            timestamp,
            timestamp, // simplified — same as UTC for file_date-based timestamps
            session,
            anchorET,
            classification.confidence,
            classification.severity,
            classification.reason,
            JSON.stringify({
              accessionNumber: filing.accessionNumber,
              cik: filing.cik,
              formType: filing.formType,
              items: filing.items,
              filingDate: filing.filingDate,
              companyName: filing.companyName,
            }),
          ]
        );
        ingested++;
      } catch (err: any) {
        totalErrors++;
        if (totalErrors <= 5) console.error(`  Error for ${filing.ticker}: ${err.message}`);
      }
    }

    console.log(`  Ingested: ${ingested}, Skipped: ${skipped}`);
    totalIngested += ingested;
    totalSkipped += skipped;
  }

  // Show summary
  const count = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_events');
  const tickerCount = await pool.query('SELECT COUNT(DISTINCT ticker) as cnt FROM catalyst_events');
  const sample = await pool.query(
    `SELECT ticker, catalyst_subtype, headline, file_date_display 
     FROM (SELECT ticker, catalyst_subtype, headline, event_timestamp_utc::date as file_date_display FROM catalyst_events ORDER BY event_timestamp_utc DESC LIMIT 10) sub`
  );

  console.log(`\n========================================`);
  console.log(`Total ingested: ${totalIngested}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Total rows in catalyst_events: ${count.rows[0].cnt}`);
  console.log(`Distinct tickers: ${tickerCount.rows[0].cnt}`);
  console.log(`\nRecent events:`);
  for (const row of sample.rows) {
    console.log(`  ${row.ticker} | ${row.catalyst_subtype} | ${row.headline?.slice(0, 60)}`);
  }

  // Check for specific popular tickers
  const popularTickers = ['META', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'NVDA', 'TSLA'];
  console.log('\nPopular ticker coverage:');
  for (const ticker of popularTickers) {
    const res = await pool.query('SELECT COUNT(*) as cnt FROM catalyst_events WHERE ticker = $1', [ticker]);
    console.log(`  ${ticker}: ${res.rows[0].cnt} events`);
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
