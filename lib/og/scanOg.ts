/**
 * /api/og/scan: the Open Graph / X image for /share/scan/[symbol] and /daily-pick.
 *
 * The route used to print `headline`, `sub`, `score`, `price`, `sector` and so on straight from the query string
 * under the MSP brand, so anyone could mint an MSP-branded image saying anything (including a fake score or
 * verdict). Now the only inputs are a validated symbol (or DAILY) and an optional date that just makes the URL change
 * daily. Every word on the image is built here from stored data: the same loaders the two pages use.
 */
import { proDisplaySymbol } from '@/lib/scanner/proDisplay';
import type { ShareData } from './scanShareData';
import type { DayData } from './dailyPicksLatest';

export const OG_SCAN_WIDTH = 1200;
export const OG_SCAN_HEIGHT = 630;
export const OG_SCAN_DISCLAIMER = 'Educational research only. Not financial advice.';
const SITE_ORIGIN = 'https://marketscannerpros.app';

export type OgSide = 'LONG' | 'SHORT' | 'WATCH';

export interface ScanOgModel {
  symbol: string;
  side: OgSide;
  headline: string;
  sub: string;
  stats: Array<{ label: string; value: string }>;
}

const SYMBOL_RE = /^(?:[A-Z0-9]{1,12}|[A-Z0-9]{1,10}[.-][A-Z0-9]{1,5})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type OgScanParams = { symbol: string; date: string | null };

/** Reads only `symbol` and `date`. Anything else in the query (headline, sub, score, price…) is ignored. */
export function parseOgScanParams(sp: URLSearchParams): { ok: true; params: OgScanParams } | { ok: false; error: string } {
  const symbol = (sp.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol || symbol.length > 16 || !SYMBOL_RE.test(symbol)) return { ok: false, error: 'invalid symbol' };
  const rawDate = sp.get('date');
  if (rawDate != null) {
    const ms = Date.parse(`${rawDate}T00:00:00Z`);
    if (!DATE_RE.test(rawDate) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== rawDate) {
      return { ok: false, error: 'invalid date (YYYY-MM-DD)' };
    }
  }
  return { ok: true, params: { symbol, date: rawDate ?? null } };
}

/** The image URL the pages put in openGraph/twitter metadata. */
export function scanOgImageUrl(symbol: string, date?: string | null): string {
  const sp = new URLSearchParams({ symbol });
  if (date && DATE_RE.test(date)) sp.set('date', date);
  return `${SITE_ORIGIN}/api/og/scan?${sp.toString()}`;
}

/**
 * Characters the bundled Noto Sans subset can draw (anything else makes next/og fetch a Google font at render time),
 * control characters removed, clipped to `max`.
 */
export function ogSafeText(value: unknown, max: number): string {
  const s = String(value ?? '')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/←/g, '<-').replace(/≈/g, '~').replace(/−/g, '-')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u2010-\u2027\u2030-\u205E€™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function scanOgModelFromShare(d: ShareData): ScanOgModel {
  const stats: ScanOgModel['stats'] = [];
  if (d.score != null && Number.isFinite(d.score)) stats.push({ label: d.verdict ? 'Setup score' : 'Opp score', value: `${Math.round(d.score)}/100` });
  if (d.price != null && Number.isFinite(d.price)) stats.push({ label: 'Price', value: `$${d.price.toFixed(2)}` });
  if (d.float) stats.push({ label: 'Float', value: ogSafeText(d.float, 10) });
  if (d.shortPct != null && Number.isFinite(d.shortPct)) stats.push({ label: 'Short %', value: `${d.shortPct.toFixed(1)}%` });
  if (d.sector) stats.push({ label: 'Sector', value: ogSafeText(d.sector, 22) });
  const asOf = /^\d{4}-\d{2}-\d{2}/.test(d.fetchedAt) ? d.fetchedAt.slice(0, 10) : null;
  return {
    symbol: ogSafeText(d.symbol, 16),
    side: d.side,
    headline: ogSafeText(d.headline, 110),
    sub: asOf ? `Snapshot ${asOf} · ${OG_SCAN_DISCLAIMER}` : OG_SCAN_DISCLAIMER,
    stats: stats.slice(0, 4),
  };
}

export function dailyOgModel(day: DayData): ScanOgModel {
  const top = day.picks.slice(0, 3).map((p) => ogSafeText(proDisplaySymbol(p.symbol, p.asset_class), 16)).filter(Boolean);
  return {
    symbol: 'DAILY',
    side: 'WATCH',
    headline: ogSafeText(`Top picks for ${day.scan_date}`, 60),
    sub: top.length ? `${top.join(', ')} · ${OG_SCAN_DISCLAIMER}` : OG_SCAN_DISCLAIMER,
    stats: [],
  };
}

export interface OgScanLoaders {
  loadShare: (symbol: string) => Promise<ShareData | null>;
  loadLatestDailyPicks: () => Promise<DayData | null>;
}

export type OgScanResult =
  | { status: 200; model: ScanOgModel; key: string }
  | { status: 400 | 404 | 503; error: string };

/** Validates the query and builds the image text from stored data only. */
export async function buildScanOgModel(sp: URLSearchParams, loaders: OgScanLoaders): Promise<OgScanResult> {
  const parsed = parseOgScanParams(sp);
  if (!parsed.ok) return { status: 400, error: parsed.error };
  const { symbol } = parsed.params;
  try {
    if (symbol === 'DAILY') {
      const day = await loaders.loadLatestDailyPicks();
      if (!day || day.picks.length === 0) return { status: 404, error: 'no daily picks yet' };
      return { status: 200, model: dailyOgModel(day), key: `DAILY:${day.scan_date}` };
    }
    const data = await loaders.loadShare(symbol);
    if (!data) return { status: 404, error: 'symbol not found' };
    return { status: 200, model: scanOgModelFromShare(data), key: `S:${data.symbol}` };
  } catch (err) {
    console.error('[og/scan] data unavailable:', err);
    return { status: 503, error: 'data unavailable' };
  }
}
