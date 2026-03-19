/**
 * News Provider — Interface + Stub
 *
 * Defines the contract for any news data vendor.
 * The stub implementation returns an empty array so the pipeline
 * compiles and runs without a live feed.
 *
 * When a vendor is integrated (e.g. Benzinga, NewsAPI, etc.),
 * implement a concrete class and swap in via factory.
 */

import { q } from '@/lib/db';
import { classifyNews } from './classifier';
import { classifySession, computeAnchor } from './sessionClassifier';
import { CatalystType, type NewsItem, type IngestionResult } from './types';

// ─── Provider interface ─────────────────────────────────────────────

export interface NewsProvider {
  /** Unique vendor identifier. */
  readonly name: string;

  /**
   * Fetch recent news items for the given tickers (or all if empty).
   * Must return raw items — classification happens downstream.
   */
  fetchRecent(tickers: string[], lookbackHours: number): Promise<NewsItem[]>;
}

// ─── Stub provider (no live feed) ───────────────────────────────────

export class StubNewsProvider implements NewsProvider {
  readonly name = 'STUB';

  async fetchRecent(_tickers: string[], _lookbackHours: number): Promise<NewsItem[]> {
    console.warn('[NewsProvider:STUB] No live news feed configured. Returning empty.');
    return [];
  }
}

// ─── Provider registry ──────────────────────────────────────────────

let activeProvider: NewsProvider = new StubNewsProvider();

export function setNewsProvider(provider: NewsProvider): void {
  activeProvider = provider;
  console.log(`[NewsProvider] Active provider set to: ${provider.name}`);
}

export function getNewsProvider(): NewsProvider {
  return activeProvider;
}

// ─── News ingestion pipeline ────────────────────────────────────────

/**
 * Ingest recent news, classify, and store as catalyst_events.
 * Uses whatever NewsProvider is currently active.
 */
export async function ingestNews(tickers: string[] = [], lookbackHours = 24): Promise<IngestionResult> {
  const start = Date.now();
  const provider = getNewsProvider();
  const items = await provider.fetchRecent(tickers, lookbackHours);

  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Build all events first, then batch upsert
  interface PendingEvent {
    ticker: string; source: string; headline: string; url: string;
    catalystType: string; catalystSubtype: string;
    eventTimestampUtc: Date; eventTimestampEt: Date;
    session: string; anchorTimestampEt: Date;
    confidence: number; severity: string;
    classificationReason: string; rawPayload: string;
  }

  const pending: PendingEvent[] = [];

  for (const item of items) {
    try {
      const classification = classifyNews(item);
      if (!classification) { skipped++; continue; }

      for (const ticker of item.tickers) {
        const anchor = computeAnchor(item.timestamp);
        const sessionInfo = classifySession(item.timestamp);

        pending.push({
          ticker: ticker.toUpperCase(),
          source: provider.name,
          headline: item.headline,
          url: item.url,
          catalystType: CatalystType.NEWS,
          catalystSubtype: classification.subtype,
          eventTimestampUtc: item.timestamp,
          eventTimestampEt: sessionInfo.inputTimestampET,
          session: anchor.session,
          anchorTimestampEt: anchor.anchorTimestampET,
          confidence: classification.confidence,
          severity: classification.severity,
          classificationReason: classification.reason,
          rawPayload: JSON.stringify({ source: item.source, body: item.body?.slice(0, 2000) }),
        });
      }
    } catch (err: any) {
      errors.push(`news "${item.headline.slice(0, 60)}": ${err.message}`);
    }
  }

  // Batch upsert using ON CONFLICT DO NOTHING (eliminates N+1 SELECT queries)
  const BATCH_SIZE = 50;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const e = batch[j];
      const offset = j * 14;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6},
          $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
          $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
      );
      values.push(
        e.ticker, e.source, e.headline, e.url,
        e.catalystType, e.catalystSubtype,
        e.eventTimestampUtc, e.eventTimestampEt,
        e.session, e.anchorTimestampEt,
        e.confidence, e.severity, e.classificationReason, e.rawPayload,
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
      // Fall back to single inserts for this batch
      for (const e of batch) {
        try {
          const res = await q(
            `INSERT INTO catalyst_events (
              ticker, source, headline, url, catalyst_type, catalyst_subtype,
              event_timestamp_utc, event_timestamp_et, session, anchor_timestamp_et,
              confidence, severity, classification_reason, raw_payload
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (ticker, source, event_timestamp_utc) DO NOTHING`,
            [
              e.ticker, e.source, e.headline, e.url,
              e.catalystType, e.catalystSubtype,
              e.eventTimestampUtc, e.eventTimestampEt,
              e.session, e.anchorTimestampEt,
              e.confidence, e.severity, e.classificationReason, e.rawPayload,
            ]
          );
          const inserted = (res as any)?.rowCount ?? 0;
          if (inserted > 0) ingested++; else skipped++;
        } catch (innerErr: any) {
          errors.push(`news "${e.headline.slice(0, 60)}": ${innerErr.message}`);
        }
      }
    }
  }

  return { source: `NEWS:${provider.name}`, ingested, skipped, errors, durationMs: Date.now() - start };
}
