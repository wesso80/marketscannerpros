/**
 * SEC EDGAR Ingestion Service
 *
 * Pulls recent filings from EDGAR full-text search / RSS feed,
 * parses filing metadata (form type, items, CIK→ticker mapping),
 * classifies into catalyst subtypes, and stores in catalyst_events.
 *
 * Data source: https://efts.sec.gov/LATEST/search-index?q=*&dateRange=custom&startdt=...
 * CIK→ticker: https://www.sec.gov/files/company_tickers.json
 */

import { q } from '@/lib/db';
import { classifySession, computeAnchor, etDateString } from './sessionClassifier';
import { classifyFiling } from './classifier';
import type { EdgarFiling, CatalystEvent, IngestionResult } from './types';
import { CatalystType, MarketSession } from './types';

// ─── CIK → Ticker mapping ──────────────────────────────────────────

let cikTickerMap: Map<string, string> | null = null;
let cikMapLastAttempt = 0;
const CIK_MAP_RETRY_MS = 5 * 60 * 1000; // Retry after 5 minutes on failure

/**
 * Load SEC company_tickers.json and build CIK→Ticker map.
 * Cached in memory after first successful call.
 * On failure, retries after CIK_MAP_RETRY_MS instead of caching empty map.
 */
export async function loadCikTickerMap(): Promise<Map<string, string>> {
  if (cikTickerMap && cikTickerMap.size > 0) return cikTickerMap;

  // If we recently failed, skip retry to avoid hammering SEC
  if (cikTickerMap !== null && Date.now() - cikMapLastAttempt < CIK_MAP_RETRY_MS) {
    return cikTickerMap;
  }

  cikMapLastAttempt = Date.now();

  try {
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[SEC] Failed to load company_tickers.json: ${res.status}`);
      if (!cikTickerMap) cikTickerMap = new Map();
      return cikTickerMap;
    }

    const data: Record<string, { cik_str: number; ticker: string; title: string }> = await res.json();
    const map = new Map<string, string>();
    for (const entry of Object.values(data)) {
      map.set(String(entry.cik_str).padStart(10, '0'), entry.ticker.toUpperCase());
    }
    cikTickerMap = map;
    return map;
  } catch (err) {
    console.error(`[SEC] Failed to fetch company_tickers.json:`, err);
    if (!cikTickerMap) cikTickerMap = new Map();
    return cikTickerMap;
  }
}

/** Resolve CIK string to ticker. Returns null if unmapped. */
export async function cikToTicker(cik: string): Promise<string | null> {
  const map = await loadCikTickerMap();
  const padded = cik.padStart(10, '0');
  return map.get(padded) ?? null;
}

// ─── EDGAR EFTS Search ──────────────────────────────────────────────

const EFTS_BASE = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_FILING_BASE = 'https://www.sec.gov/Archives/edgar/data';

interface EftsHit {
  _id: string;
  _source: {
    file_date: string;         // YYYY-MM-DD
    ciks: string[];            // ["0000737758"]
    display_names: string[];   // ["TORO CO  (TTC)  (CIK 0000737758)"]
    root_forms: string[];      // ["8-K"]
    form: string;              // "8-K/A"
    file_type: string;         // "8-K/A"
    adsh: string;              // "0001628280-26-008467"
    file_num: string[];        // ["001-08649"]
    biz_locations?: string[];
    file_description?: string;
    items?: string[];           // ["5.02", "9.01"]
  };
}

/**
 * Query EDGAR full-text search for recent filings of specific form types.
 */
export async function queryEdgar(formTypes: string[], startDate: string, endDate: string): Promise<EdgarFiling[]> {
  const tickerMap = await loadCikTickerMap();
  const results: EdgarFiling[] = [];
  const deadline = Date.now() + 60_000; // 60s time budget for all EDGAR queries

  for (const formType of formTypes) {
    if (Date.now() > deadline) {
      console.warn(`[SEC] EDGAR time budget exceeded, skipping remaining form types`);
      break;
    }
    try {
      // Paginate through results (EFTS max 100 per page)
      let from = 0;
      const size = 100;
      let hasMore = true;

      while (hasMore && Date.now() < deadline) {
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
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          console.error(`[SEC] EFTS query failed for ${formType}: ${res.status}`);
          break;
        }

        const body = await res.json();
        const hits: EftsHit[] = body.hits?.hits ?? [];

        for (const hit of hits) {
          const src = hit._source;
          // Use ciks array directly; fall back to parsing from _id
          const cik = src.ciks?.[0] ?? hit._id.replace(/-/g, '').slice(0, 10);
          const ticker = tickerMap.get(cik) ?? null;

          // Items are already an array from EFTS
          const items = Array.isArray(src.items) ? src.items : [];

          // Extract company name from display_names: "TORO CO  (TTC)  (CIK 0000737758)"
          const displayName = src.display_names?.[0] ?? '';
          const companyName = displayName.replace(/\s*\(.*$/, '').trim();

          // Accession number (clean, without :filename suffix)
          const accessionNumber = src.adsh ?? hit._id.split(':')[0];
          const accessionFlat = accessionNumber.replace(/-/g, '');

          const filing: EdgarFiling = {
            accessionNumber,
            cik,
            ticker,
            companyName,
            formType: src.root_forms?.[0] ?? src.form ?? formType,
            filingDate: src.file_date,
            filingTimestamp: new Date(`${src.file_date}T16:00:00Z`),
            primaryDocUrl: `${EDGAR_FILING_BASE}/${cik}/${accessionFlat}`,
            items,
          };

          results.push(filing);
        }

        // Pagination: stop if fewer results than page size or hit 10k ES limit
        const totalHits = body.hits?.total?.value ?? 0;
        from += hits.length;
        hasMore = hits.length === size && from < totalHits && from < 10_000;
      }
    } catch (err) {
      console.error(`[SEC] Error querying EFTS for ${formType}:`, err);
    }
  }

  return results;
}

// ─── Filing → Catalyst Event ────────────────────────────────────────

/**
 * Convert an EdgarFiling into a CatalystEvent record ready for DB insertion.
 * Returns null if filing cannot be classified (unknown form/items).
 */
export function filingToCatalystEvent(filing: EdgarFiling): Omit<CatalystEvent, 'id' | 'createdAt'> | null {
  if (!filing.ticker) return null;

  const classification = classifyFiling(filing);
  if (!classification) return null;

  const anchor = computeAnchor(filing.filingTimestamp);
  const sessionInfo = classifySession(filing.filingTimestamp);

  return {
    ticker: filing.ticker,
    source: 'SEC',
    headline: `${filing.formType} Filing: ${classification.reason}`,
    url: filing.primaryDocUrl,
    catalystType: CatalystType.SEC_FILING,
    catalystSubtype: classification.subtype,
    eventTimestampUtc: filing.filingTimestamp,
    eventTimestampEt: sessionInfo.inputTimestampET,
    session: anchor.session,
    anchorTimestampEt: anchor.anchorTimestampET,
    confidence: classification.confidence,
    severity: classification.severity,
    rawPayload: {
      accessionNumber: filing.accessionNumber,
      cik: filing.cik,
      formType: filing.formType,
      items: filing.items,
      filingDate: filing.filingDate,
      companyName: filing.companyName,
    },
    classificationReason: classification.reason,
  };
}

// ─── Batch ingest ───────────────────────────────────────────────────

const TARGET_FORMS = ['8-K', '13D', '13D/A', '10-K', '10-Q', 'SC 13D', 'SC 13D/A'];

/**
 * Ingest recent SEC filings into catalyst_events table.
 * Deduplicates by (ticker, source, event_timestamp_utc).
 */
export async function ingestSecFilings(lookbackDays = 7): Promise<IngestionResult> {
  const start = Date.now();
  const endDate = etDateString(new Date());
  const startDate = etDateString(new Date(Date.now() - lookbackDays * 86_400_000));

  const filings = await queryEdgar(TARGET_FORMS, startDate, endDate);

  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Build events array first, then batch upsert
  const events: Array<{ event: NonNullable<ReturnType<typeof filingToCatalystEvent>>; accession: string }> = [];
  for (const filing of filings) {
    const event = filingToCatalystEvent(filing);
    if (!event) { skipped++; continue; }
    events.push({ event, accession: filing.accessionNumber });
  }

  // Batch upsert using ON CONFLICT DO NOTHING (eliminates N+1 SELECT queries)
  const BATCH_SIZE = 50;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const { event } = batch[j];
      const offset = j * 14;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6},
          $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
          $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
      );
      values.push(
        event.ticker, event.source, event.headline, event.url,
        event.catalystType, event.catalystSubtype,
        event.eventTimestampUtc, event.eventTimestampEt,
        event.session, event.anchorTimestampEt,
        event.confidence, event.severity, event.classificationReason,
        JSON.stringify(event.rawPayload),
      );
    }

    try {
      const result = await q(
        `INSERT INTO catalyst_events (
          ticker, source, headline, url, catalyst_type, catalyst_subtype,
          event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
          confidence, severity, classification_reason, raw_payload
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (ticker, source, event_timestamp_utc) DO NOTHING`,
        values
      );
      const inserted = (result as any)?.rowCount ?? batch.length;
      ingested += inserted;
      skipped += batch.length - inserted;
    } catch (err: any) {
      // Fall back to single inserts for this batch so partial failures don't lose everything
      for (const { event, accession } of batch) {
        try {
          const res = await q(
            `INSERT INTO catalyst_events (
              ticker, source, headline, url, catalyst_type, catalyst_subtype,
              event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
              confidence, severity, classification_reason, raw_payload
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (ticker, source, event_timestamp_utc) DO NOTHING`,
            [
              event.ticker, event.source, event.headline, event.url,
              event.catalystType, event.catalystSubtype,
              event.eventTimestampUtc, event.eventTimestampEt,
              event.session, event.anchorTimestampEt,
              event.confidence, event.severity, event.classificationReason,
              JSON.stringify(event.rawPayload),
            ]
          );
          const inserted = (res as any)?.rowCount ?? 0;
          if (inserted > 0) ingested++; else skipped++;
        } catch (innerErr: any) {
          errors.push(`${accession}: ${innerErr.message}`);
        }
      }
    }
  }

  return { source: 'SEC_EDGAR', ingested, skipped, errors, durationMs: Date.now() - start };
}
