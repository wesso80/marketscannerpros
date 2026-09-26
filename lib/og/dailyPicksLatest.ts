/**
 * Latest daily-picks snapshot (top 10, canonical-first), shared by the /daily-pick page and the /api/og/scan DAILY
 * card so the card always shows the same symbols as the page. Moved verbatim from app/daily-pick/page.tsx.
 */
import { q } from '@/lib/db';
import { rankDailyPicks, readStoredCanonical } from '@/lib/scoring/canonical/dailyPick';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';
import { toYmd } from '@/lib/time/usSession';

export interface DailyPickRow {
  rank: number;
  asset_class: string;
  symbol: string;
  score: number;
  direction: string;
  price: number | null;
  change_percent: number | null;
  sector: string | null;
  shares_float: number | null;
  short_pct_float: number | null;
  /** Canonical engine verdict (primary). Null for scans written before the canonical engine. */
  canonical: CanonicalResult | null;
  /** Legacy signal-count score (secondary). */
  legacyScore: number;
}

export interface DayData {
  scan_date: string;
  picks: DailyPickRow[];
}

export function formatFloat(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// DATE column → YYYY-MM-DD without a time-zone shift (see lib/time/usSession).
function toDateString(v: unknown): string {
  return toYmd(v) ?? '';
}

export async function loadLatestDailyPicks(): Promise<DayData | null> {
  const latest = await q<{ scan_date: unknown }>(
    `SELECT scan_date FROM daily_picks ORDER BY scan_date DESC LIMIT 1`,
  );
  if (latest.length === 0) return null;
  const scan_date = toDateString(latest[0].scan_date);

  // Try the enriched query first (requires migration 097). If shares_float /
  // short_pct_float columns don't exist yet, fall back to the picks-only
  // query so the page still renders during phased rollout.
  let rows: Array<{
    asset_class: string;
    symbol: string;
    score: number;
    direction: string;
    price: string | null;
    change_percent: string | null;
    sector: string | null;
    shares_float: string | null;
    short_pct_float: string | null;
    canonical?: unknown;
    legacy_score?: string | null;
  }>;
  try {
    rows = await q(
      `SELECT dp.asset_class, dp.symbol, dp.score, dp.direction,
              dp.price, dp.change_percent, dp.indicators->'canonical' AS canonical, dp.indicators->'legacy'->>'score' AS legacy_score,
              co.sector, co.shares_float, co.short_pct_float
         FROM daily_picks dp
         LEFT JOIN company_overview co ON co.symbol = dp.symbol
        WHERE dp.scan_date = $1
        ORDER BY dp.score DESC
        LIMIT 60`,
      [scan_date],
    );
  } catch (err) {
    console.warn('[daily-pick] enriched query failed, falling back:', err);
    const fallback = await q<{
      asset_class: string;
      symbol: string;
      score: number;
      direction: string;
      price: string | null;
      change_percent: string | null;
      canonical?: unknown;
      legacy_score?: string | null;
    }>(
      `SELECT asset_class, symbol, score, direction, price, change_percent, indicators->'canonical' AS canonical, indicators->'legacy'->>'score' AS legacy_score
         FROM daily_picks
        WHERE scan_date = $1
        ORDER BY score DESC
        LIMIT 60`,
      [scan_date],
    );
    rows = fallback.map((r) => ({
      ...r,
      sector: null,
      shares_float: null,
      short_pct_float: null,
    }));
  }

  // Canonical verdict first (permission → grade → score); older rows without one fall back to the legacy score.
  const ranked = rankDailyPicks(rows.map((r) => ({ ...r, canonical: readStoredCanonical({ canonical: r.canonical }) }))).slice(0, 10);
  return {
    scan_date,
    picks: ranked.map((r, i) => ({
      rank: i + 1,
      asset_class: r.asset_class,
      symbol: r.symbol,
      score: r.canonical ? r.canonical.score : r.score,
      legacyScore: r.legacy_score != null ? Number(r.legacy_score) : r.score, // columns hold canonical values from Phase 3
      canonical: r.canonical,
      direction: r.canonical
        ? (r.canonical.direction === 'long' ? 'bullish' : r.canonical.direction === 'short' ? 'bearish' : 'neutral')
        : r.direction,
      price: r.price ? Number(r.price) : null,
      change_percent: r.change_percent ? Number(r.change_percent) : null,
      sector: r.sector,
      shares_float: r.shares_float ? Number(r.shares_float) : null,
      short_pct_float: r.short_pct_float ? Number(r.short_pct_float) : null,
    })),
  };
}
