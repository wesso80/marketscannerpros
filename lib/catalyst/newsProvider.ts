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

  for (const item of items) {
    try {
      const classification = classifyNews(item);
      if (!classification) { skipped++; continue; }

      for (const ticker of item.tickers) {
        // Dedup check
        const existing = await q(
          `SELECT id FROM catalyst_events WHERE ticker = $1 AND source = $2 AND event_timestamp_utc = $3 AND headline = $4 LIMIT 1`,
          [ticker.toUpperCase(), provider.name, item.timestamp, item.headline]
        );
        if (existing && existing.length > 0) { skipped++; continue; }

        const anchor = computeAnchor(item.timestamp);
        const sessionInfo = classifySession(item.timestamp);

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
            ticker.toUpperCase(), provider.name, item.headline, item.url,
            CatalystType.NEWS, classification.subtype,
            item.timestamp, sessionInfo.inputTimestampET,
            anchor.session, anchor.anchorTimestampET,
            classification.confidence, classification.severity,
            classification.reason,
            JSON.stringify({ source: item.source, body: item.body?.slice(0, 2000) }),
          ]
        );
        ingested++;
      }
    } catch (err: any) {
      errors.push(`news "${item.headline.slice(0, 60)}": ${err.message}`);
    }
  }

  return { source: `NEWS:${provider.name}`, ingested, skipped, errors, durationMs: Date.now() - start };
}
