import { partialBarDate } from '@/lib/research/priceEvidence';

/** Same window the Symbol chart asked `/api/bars` for. */
export const PUBLIC_DAILY_CHART_LIMIT = 140;

export type PublicDailyBar = { t: string; h: number; l: number; c: number };
/** Completed daily candles for a signed-in reader. Signed-out readers receive a picture instead. */
export type PublicDailyChart = { basis: string; bars: PublicDailyBar[] };

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Cents from $100, four places from $1, eight below that. Drops binary float noise. */
export function roundChartPrice(v: number): number {
  const abs = Math.abs(v);
  const dp = abs >= 100 ? 2 : abs >= 1 ? 4 : 8;
  return Number(v.toFixed(dp));
}

/**
 * Chart bars from the daily series the report already fetched.
 * The unfinished session bar is left off, matching price evidence, so the last
 * candle is the same completed session the source line names.
 */
export function publicDailyChart(input: {
  assetClass: 'equity' | 'crypto' | 'forex';
  timeframeKey: string;
  source?: string | null;
  nowMs: number;
  dates?: string[] | null;
  closes?: number[] | null;
  highs?: number[] | null;
  lows?: number[] | null;
}): PublicDailyChart | null {
  if (input.timeframeKey !== 'daily' || input.assetClass === 'forex') return null;
  const dates = input.dates ?? [];
  const closes = input.closes ?? [];
  if (!dates.length || dates.length !== closes.length) return null;
  const highs = input.highs ?? [];
  const lows = input.lows ?? [];
  const alignedHigh = highs.length === dates.length;
  const alignedLow = lows.length === dates.length;
  const rows: PublicDailyBar[] = [];
  for (let i = 0; i < dates.length; i++) {
    const t = String(dates[i] ?? '').slice(0, 10);
    const c = closes[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !positive(c)) continue;
    rows.push({
      t,
      c: roundChartPrice(c),
      h: roundChartPrice(alignedHigh && positive(highs[i]) ? highs[i] : c),
      l: roundChartPrice(alignedLow && positive(lows[i]) ? lows[i] : c),
    });
  }
  rows.sort((a, b) => a.t.localeCompare(b.t));
  const partial = rows.length ? partialBarDate(rows[rows.length - 1].t, input.assetClass, input.nowMs) : null;
  const done = partial && rows[rows.length - 1].t === partial ? rows.slice(0, -1) : rows;
  const bars = done.slice(-PUBLIC_DAILY_CHART_LIMIT);
  if (bars.length < 2) return null;
  return { basis: input.source?.trim() || 'Daily bars', bars };
}

function xmlText(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&apos;'
  ));
}

function axisLabel(v: number): string {
  const abs = Math.abs(v);
  const dp = abs >= 100 ? 2 : abs >= 1 ? 4 : 8;
  return v.toFixed(dp);
}

/** Server-drawn chart. Pixel coordinates only: no OHLC array and no data attributes. */
export function dailyChartSvg(chart: { basis: string; bars: PublicDailyBar[] }): string {
  const bars = chart.bars;
  const closes = bars.map((b) => b.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const width = 640;
  const height = 180;
  const left = 48;
  const right = 624;
  const top = 22;
  const bottom = 150;
  const x = (i: number) => left + (i / Math.max(1, bars.length - 1)) * (right - left);
  const y = (v: number) => bottom - ((v - min) / span) * (bottom - top);
  const points = closes.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const first = bars[0]?.t ?? '';
  const last = bars[bars.length - 1]?.t ?? '';
  const label = xmlText(`${bars.length} daily closes, last bar ${last}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" viewBox="0 0 ${width} ${height}" width="100%" height="${height}"><title>${label}</title><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="4" y="24" font-size="10">${xmlText(axisLabel(max))}</text><text x="4" y="${bottom}" font-size="10">${xmlText(axisLabel(min))}</text><text x="${left}" y="172" font-size="10">${xmlText(first)}</text><text x="${width - 8}" y="172" text-anchor="end" font-size="10">${xmlText(last)}</text><text x="${left}" y="14" font-size="10">${xmlText(chart.basis)}</text></svg>`;
}

/** Picture for a signed-out reader. Null when there is no series to draw. */
export function signedOutChartImage(chart: PublicDailyChart | null | undefined): string | null {
  const bars = chart?.bars;
  if (!chart || !bars || bars.length < 2) return null;
  return dailyChartSvg(chart);
}

/** Accept only the SVG this module draws. Rejects scripts and series data attributes. */
export function dailyChartSvgMarkup(image: string | null | undefined): string | null {
  if (!image) return null;
  const svg = image.trim();
  if (!svg.startsWith('<svg ') || !svg.endsWith('</svg>')) return null;
  if (/<script|on[a-z]+\s*=|javascript:|data-(?:bars|ohlc|candles|series)\s*=/i.test(svg)) return null;
  return svg;
}
