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

/**
 * Load SEC company_tickers.json and build CIK→Ticker map.
 * Cached in memory after first call.
 */
export async function loadCikTickerMap(): Promise<Map<string, string>> {
  if (cikTickerMap) return cikTickerMap;

  const url = 'https://www.sec.gov/files/company_tickers.json';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', Accept: 'application/json' },
  });

  if (!res.ok) {
    console.error(`[SEC] Failed to load company_tickers.json: ${res.status}`);
    cikTickerMap = new Map();
    return cikTickerMap;
  }

  const data: Record<string, { cik_str: number; ticker: string; title: string }> = await res.json();
  const map = new Map<string, string>();
  for (const entry of Object.values(data)) {
    map.set(String(entry.cik_str).padStart(10, '0'), entry.ticker.toUpperCase());
  }
  cikTickerMap = map;
  return map;
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
    file_date: string;        // YYYY-MM-DD
    display_date_time: string; // e.g. "2026-02-23T15:30:00.000Z"
    form_type: string;
    entity_name: string;
    file_num: string;
    biz_locations?: string;
    file_description?: string;
    items?: string;            // "5.02, 9.01"
  };
}

/**
 * Query EDGAR full-text search for recent filings of specific form types.
 */
export async function queryEdgar(formTypes: string[], startDate: string, endDate: string): Promise<EdgarFiling[]> {
  const tickerMap = await loadCikTickerMap();
  const results: EdgarFiling[] = [];

  for (const formType of formTypes) {
    try {
      const params = new URLSearchParams({
        q: `"${formType}"`,
        dateRange: 'custom',
        startdt: startDate,
        enddt: endDate,
        forms: formType,
      });

      const res = await fetch(`${EFTS_BASE}?${params}`, {
        headers: { 'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', Accept: 'application/json' },
      });

      if (!res.ok) {
        console.error(`[SEC] EFTS query failed for ${formType}: ${res.status}`);
        continue;
      }

      const body = await res.json();
      const hits: EftsHit[] = body.hits?.hits ?? [];

      for (const hit of hits) {
        const src = hit._source;
        const accession = hit._id.replace(/-/g, '');
        const cik = accession.slice(0, 10);
        const ticker = tickerMap.get(cik) ?? null;

        // Parse items from 8-K filings
        const items = src.items
          ? src.items.split(',').map(s => s.trim()).filter(Boolean)
          : [];

        const filing: EdgarFiling = {
          accessionNumber: hit._id,
          cik,
          ticker,
          companyName: src.entity_name || '',
          formType: src.form_type || formType,
          filingDate: src.file_date,
          filingTimestamp: new Date(src.display_date_time || `${src.file_date}T16:00:00Z`),
          primaryDocUrl: `${EDGAR_FILING_BASE}/${cik}/${accession}`,
          items,
        };

        results.push(filing);
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

  for (const filing of filings) {
    try {
      const event = filingToCatalystEvent(filing);
      if (!event) { skipped++; continue; }

      // Upsert: skip if same ticker+source+timestamp already exists
      const existing = await q(
        `SELECT id FROM catalyst_events WHERE ticker = $1 AND source = $2 AND event_timestamp_utc = $3 LIMIT 1`,
        [event.ticker, event.source, event.eventTimestampUtc]
      );
      if (existing && existing.length > 0) { skipped++; continue; }

      await q(
        `INSERT INTO catalyst_events (
          ticker, source, headline, url, catalyst_type, catalyst_subtype,
          event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
          confidence, severity, classification_reason, raw_payload
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14
        )`,
        [
          event.ticker, event.source, event.headline, event.url,
          event.catalystType, event.catalystSubtype,
          event.eventTimestampUtc, event.eventTimestampEt,
          event.session, event.anchorTimestampEt,
          event.confidence, event.severity, event.classificationReason,
          JSON.stringify(event.rawPayload),
        ]
      );
      ingested++;
    } catch (err: any) {
      errors.push(`${filing.accessionNumber}: ${err.message}`);
    }
  }

  return { source: 'SEC_EDGAR', ingested, skipped, errors, durationMs: Date.now() - start };
}
