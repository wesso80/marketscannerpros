import { evaluateDailyPickTrust } from '@/lib/scanner/dailyPickTrust';
import { dailyPickPriceBasis } from '@/lib/scanner/dailyPickPriceBasis';
import { dailyPickHeader } from '@/lib/scanner/dailyPickSession';
/**
 * Latest daily-scan observations, shared by the public /daily-pick page and the /api/og/scan DAILY card so the card
 * always shows the same symbols as the page.
 *
 * Public (W3, 8 Oct): no grade, verdict, direction, score, levels or ranking. Every stored row of the latest scan per
 * market, sorted by symbol A–Z (SORT_NOTE / SELECTION_NOTE are shown with the list).
 */
import { q } from '@/lib/db';
import { readStoredCanonical } from '@/lib/scoring/canonical/dailyPick';
import { SELECTION_NOTE, SORT_NOTE } from '@/lib/research/publicDailyObservations';
import { toYmd } from '@/lib/time/usSession';

export { SELECTION_NOTE, SORT_NOTE };

export interface DailyPickRow {
  dataAsOf?: string | null;
  stale?: boolean;
  priceLabel?: string;
  asset_class: string;
  symbol: string;
  price: number | null;
  change_percent: number | null;
  sector: string | null;
  shares_float: number | null;
  short_pct_float: number | null;
}

export interface DayData {
  /** Newest equity bar date on this page, or the newest row date when there are no equities. Not the wall clock. */
  scan_date: string;
  /** Set when an equity price is older than the last completed US session. */
  pricesAsOfNote?: string | null;
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

type Row = {
  asset_class: string; symbol: string; price: string | null; change_percent: string | null;
  sector: string | null; shares_float: string | null; short_pct_float: string | null;
  indicators?: Record<string, any>; scan_date?: string; created_at?: string;
};

export async function loadLatestDailyPicks(nowMs: number = Date.now()): Promise<DayData | null> {
  // Each asset class keeps its own latest scan. A later crypto candle must not become the equity header date.
  const LATEST = `dp.scan_date = (SELECT MAX(d.scan_date) FROM daily_picks d WHERE d.asset_class = dp.asset_class)`;
  let rows: Row[];
  try {
    rows = await q<Row>(
      `SELECT DISTINCT ON (dp.symbol, dp.asset_class) dp.asset_class, dp.symbol, dp.price, dp.change_percent, dp.indicators, dp.scan_date, dp.created_at,
              co.sector, co.shares_float, co.short_pct_float
         FROM daily_picks dp
         LEFT JOIN company_overview co ON co.symbol = dp.symbol
        WHERE ${LATEST}
        ORDER BY dp.symbol, dp.asset_class
        LIMIT 120`,
    );
  } catch (err) {
    console.warn('[daily-pick] enriched query failed, falling back:', err);
    const fallback = await q<Row>(
      `SELECT DISTINCT ON (dp.symbol, dp.asset_class) dp.asset_class, dp.symbol, dp.price, dp.change_percent, dp.indicators, dp.scan_date, dp.created_at
         FROM daily_picks dp
        WHERE ${LATEST}
        ORDER BY dp.symbol, dp.asset_class
        LIMIT 120`,
    );
    rows = fallback.map((r) => ({ ...r, sector: null, shares_float: null, short_pct_float: null }));
  }
  if (rows.length === 0) return null;

  const visible = rows.filter((r) => r.asset_class === 'equity' || r.asset_class === 'crypto');
  visible.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.asset_class.localeCompare(b.asset_class));
  const picks = visible.map((r) => {
    const trust = evaluateDailyPickTrust(r, nowMs);
    const basis = dailyPickPriceBasis(r.price, readStoredCanonical(r.indicators), r.asset_class);
    return {
      dataAsOf: trust.dataAsOf,
      stale: trust.freshness !== 'fresh',
      priceLabel: basis.priceBasisLabel,
      barDate: basis.canonicalBarDate ?? trust.dataTimestamp,
      scanDate: toDateString(r.scan_date),
      asset_class: r.asset_class,
      symbol: r.symbol,
      price: r.price ? Number(r.price) : null,
      change_percent: r.change_percent ? Number(r.change_percent) : null,
      sector: r.sector,
      shares_float: r.shares_float ? Number(r.shares_float) : null,
      short_pct_float: r.short_pct_float ? Number(r.short_pct_float) : null,
    };
  });
  const header = dailyPickHeader(picks.map((pick) => ({
    asset_class: pick.asset_class,
    barDate: pick.barDate,
    dataAsOf: pick.dataAsOf,
    scan_date: pick.scanDate,
  })), nowMs);
  const scan_date = header?.sessionDate || toDateString(rows[0]?.scan_date);
  return {
    scan_date,
    pricesAsOfNote: header?.pricesAsOfNote ?? null,
    picks: picks.map(({ barDate: _barDate, scanDate: _scanDate, ...pick }) => pick),
  };
}
