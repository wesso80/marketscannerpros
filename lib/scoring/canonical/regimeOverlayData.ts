/**
 * Server-side loader for the regime overlay inputs, from data the app already stores (no new paid dependencies):
 *   - macro_series (FRED ingest): VIX (VIXCLS), CREDIT_HY_OAS (BAMLH0A0HYM2), US_M2 (M2SL)
 *   - ohlcv_bars (worker bar store): SPY and QQQ daily closes → SMA50 / SMA200
 *   - optional macro risk state from the Golden Egg macro regime (caller passes it; it costs AV calls)
 * Every part fails soft: a missing input is just not counted by evaluateRegimeOverlay. Cached 15 minutes.
 */
import { q } from '@/lib/db';
import type { IndexTrend, RegimeOverlayInputs } from './regimeOverlay';

const TTL_MS = 15 * 60 * 1000;
let cache: { at: number; data: RegimeOverlayInputs } | null = null;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function macroSeries(key: string, limit: number): Promise<Array<{ on: string; value: number }>> {
  const rows = await q<{ observed_on: Date | string; value: string | number | null }>(
    `SELECT observed_on, value FROM macro_series WHERE series_key = $1 AND value IS NOT NULL ORDER BY observed_on DESC LIMIT $2`, [key, limit]);
  return rows.map((r) => ({ on: String(r.observed_on instanceof Date ? r.observed_on.toISOString().slice(0, 10) : r.observed_on).slice(0, 10), value: num(r.value) }))
    .filter((r): r is { on: string; value: number } => r.value !== null);
}

async function indexTrend(symbol: string): Promise<IndexTrend | null> {
  const rows = await q<{ close: string | number }>(`SELECT close FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT 200`, [symbol]);
  const closes = rows.map((r) => num(r.close)).filter((v): v is number => v !== null);
  if (closes.length < 200) return null;
  const avg = (k: number) => closes.slice(0, k).reduce((a, b) => a + b, 0) / k;
  return { close: closes[0], sma50: avg(50), sma200: avg(200) };
}

export async function loadRegimeOverlayInputs(opts: { macroRiskState?: RegimeOverlayInputs['macroRiskState'] } = {}): Promise<RegimeOverlayInputs> {
  if (cache && Date.now() - cache.at < TTL_MS) return { ...cache.data, macroRiskState: opts.macroRiskState ?? cache.data.macroRiskState ?? null };
  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };
  const [vix, hy, m2, spy, qqq] = await Promise.all([
    safe(() => macroSeries('VIX', 6)),
    safe(() => macroSeries('CREDIT_HY_OAS', 21)),
    safe(() => macroSeries('US_M2', 4)),
    safe(() => indexTrend('SPY')),
    safe(() => indexTrend('QQQ')),
  ]);
  const data: RegimeOverlayInputs = {
    asOf: vix?.[0]?.on ?? null,
    vix: vix && vix.length ? { level: vix[0].value, change5dPct: vix.length >= 6 ? (vix[0].value / vix[5].value - 1) * 100 : null } : null,
    hyOas: hy && hy.length ? { level: hy[0].value, change20dPp: hy.length >= 21 ? hy[0].value - hy[20].value : null } : null,
    m2: m2 && m2.length >= 4 ? { change3mPct: (m2[0].value / m2[3].value - 1) * 100 } : null,
    spy, qqq,
    macroRiskState: opts.macroRiskState ?? null,
    // Fragility stays unavailable (reported as such by the overlay). The only source is lib/intelligence/fragilityService,
    // which needs INTELLIGENCE_LIVE_DATA + provider keys, fetches ~20 Alpha Vantage / FRED / CoinGecko daily series
    // (competing with the scan crons' Alpha Vantage quota) and falls back to a MOCK fixture; there is also no
    // historical fragility series to validate a cap against (Phase 3). Wire it only after both are solved.
    fragility: null,
  };
  cache = { at: Date.now(), data };
  return data;
}
