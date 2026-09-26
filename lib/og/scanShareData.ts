/**
 * Share-snapshot data for one symbol (daily_picks + company_overview), shared by /share/scan/[symbol] and the
 * /api/og/scan image so the image text is derived server-side from stored data. Moved verbatim from the page.
 */
import { q } from '@/lib/db';
import { pickView } from '@/lib/scoring/canonical/dailyPick';
import { toYmd } from '@/lib/time/usSession';

export type Side = 'LONG' | 'SHORT' | 'WATCH';

export interface ShareData {
  symbol: string;
  side: Side;
  score: number | null;
  price: number | null;
  changePct: number | null;
  float: string | null;
  shortPct: number | null;
  sector: string | null;
  headline: string;
  /** Canonical verdict label and what the score means (null without a daily-pick row). */
  verdict: string | null;
  basisNote: string | null;
  /** Score in the share card's wording ("95th pct"); null/absent for legacy rows. */
  scoreText?: string | null;
  fetchedAt: string;
  source: 'daily_picks' | 'company_overview' | 'symbol_only';
}

export function formatShareFloat(shares: number | null): string | null {
  if (shares == null) return null;
  if (shares >= 1_000_000_000) return `${(shares / 1_000_000_000).toFixed(1)}B`;
  if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`;
  if (shares >= 1_000) return `${(shares / 1_000).toFixed(1)}K`;
  return String(shares);
}

export async function loadShare(rawSymbol: string): Promise<ShareData | null> {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  if (!symbol) return null;

  // Prefer a freshly scored daily_picks row
  const picks = await q<{
    symbol: string;
    score: number;
    direction: string;
    price: string | null;
    change_percent: string | null;
    scan_date: Date | string;
    asset_class: string;
    canonical: unknown;
  }>(
    `SELECT symbol, score, direction, price, change_percent, scan_date, asset_class, indicators->'canonical' AS canonical
     FROM daily_picks
     WHERE symbol = $1
     ORDER BY scan_date DESC
     LIMIT 1`,
    [symbol],
  );

  // Fundamentals overlay (low-float context, sector). Schema tolerant: if
  // migration 097 hasn't been applied yet, shares_float / short_pct_float
  // columns won't exist — the catch falls back to symbol-only metadata so
  // the page still renders.
  let fund: Array<{
    sector: string | null;
    shares_float: string | null;
    short_pct_float: string | null;
    fetched_at: Date | string | null;
    name: string | null;
  }> = [];
  try {
    fund = await q<{
      sector: string | null;
      shares_float: string | null;
      short_pct_float: string | null;
      fetched_at: Date | string | null;
      name: string | null;
    }>(
      `SELECT sector, shares_float, short_pct_float, fetched_at, name
         FROM company_overview
        WHERE symbol = $1`,
      [symbol],
    );
  } catch (err) {
    console.warn(`[share/scan] company_overview lookup failed for ${symbol}:`, err);
  }

  const pick = picks[0];
  const f = fund[0];
  if (!pick && !f) return null;

  // Canonical verdict first (legacy signal-count fallback for rows written before the canonical engine).
  const view = pick ? pickView(pick) : null;
  const side: Side = view ? view.side : 'WATCH';

  const sharesFloat = f?.shares_float ? Number(f.shares_float) : null;
  const shortPct = f?.short_pct_float ? Number(f.short_pct_float) : null;

  let headline = `${symbol} — research snapshot`;
  if (sharesFloat && sharesFloat < 20_000_000) {
    headline = `${symbol} flagged as low-float (${formatShareFloat(sharesFloat)} shares${shortPct ? `, ${shortPct.toFixed(1)}% short` : ''})`;
  } else if (pick) {
    const when = toYmd(pick.scan_date) ?? String(pick.scan_date).slice(0, 10);
    headline = view?.label
      ? `${symbol}: ${view.label} (${side.toLowerCase()} side) on ${when}`
      : `${symbol} scored ${pick.score}/100 ${side === 'LONG' ? 'long' : side === 'SHORT' ? 'short' : 'watch'} on ${when}`;
  } else if (f?.name) {
    headline = `${f.name} — fundamentals snapshot`;
  }

  const rawFetched = f?.fetched_at ?? pick?.scan_date ?? new Date();
  const fetchedAt =
    rawFetched instanceof Date
      ? rawFetched.toISOString()
      : String(rawFetched);

  return {
    symbol,
    side,
    score: view ? view.score : null,
    verdict: view?.label ?? null,
    basisNote: view?.basisNote ?? null,
    scoreText: view?.scoreText ?? null,
    price: pick?.price ? Number(pick.price) : null,
    changePct: pick?.change_percent ? Number(pick.change_percent) : null,
    float: formatShareFloat(sharesFloat),
    shortPct,
    sector: f?.sector ?? null,
    headline,
    fetchedAt,
    source: pick ? 'daily_picks' : f ? 'company_overview' : 'symbol_only',
  };
}
