/**
 * Share-snapshot data for one symbol (daily_picks + company_overview), shared by /share/scan/[symbol] and the
 * /api/og/scan image so the image text is derived server-side from stored data. Moved verbatim from the page.
 */
import { q } from '@/lib/db';
import { toYmd } from '@/lib/time/usSession';

/**
 * Public share snapshot (W3, 8 Oct): measured values only (price, session change, float, short interest, sector) from
 * the latest stored daily-scan row and company overview. No side, verdict, grade or score.
 */
export interface ShareData {
  symbol: string;
  price: number | null;
  changePct: number | null;
  float: string | null;
  shortPct: number | null;
  sector: string | null;
  headline: string;
  /** Session date of the stored daily-scan row, when there is one. */
  scanDate: string | null;
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

  const picks = await q<{ symbol: string; price: string | null; change_percent: string | null; scan_date: Date | string }>(
    `SELECT symbol, price, change_percent, scan_date
     FROM daily_picks
     WHERE symbol = $1
     ORDER BY scan_date DESC
     LIMIT 1`,
    [symbol],
  );

  // Fundamentals overlay (sector, float, short interest). Schema tolerant: before migration 097 the float columns do
  // not exist, so the catch falls back to the scan row only.
  let fund: Array<{ sector: string | null; shares_float: string | null; short_pct_float: string | null; fetched_at: Date | string | null; name: string | null }> = [];
  try {
    fund = await q(
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

  const sharesFloat = f?.shares_float ? Number(f.shares_float) : null;
  const shortPct = f?.short_pct_float ? Number(f.short_pct_float) : null;
  const scanDate = pick ? (toYmd(pick.scan_date) ?? String(pick.scan_date).slice(0, 10)) : null;

  const headline = pick
    ? `${symbol}: daily scan snapshot for ${scanDate}`
    : f?.name ? `${f.name}: fundamentals snapshot` : `${symbol}: research snapshot`;

  const rawFetched = f?.fetched_at ?? pick?.scan_date ?? new Date();
  const fetchedAt = rawFetched instanceof Date ? rawFetched.toISOString() : String(rawFetched);

  return {
    symbol,
    price: pick?.price ? Number(pick.price) : null,
    changePct: pick?.change_percent ? Number(pick.change_percent) : null,
    float: formatShareFloat(sharesFloat),
    shortPct,
    sector: f?.sector ?? null,
    headline,
    scanDate,
    fetchedAt,
    source: pick ? 'daily_picks' : f ? 'company_overview' : 'symbol_only',
  };
}
