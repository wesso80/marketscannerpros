/**
 * Live inputs for the Cross-Asset Correlation Regime (/api/correlation-regime), from helpers the app already has.
 * Before RS-14 the route used fixed placeholders (BTC 67,000, SPY 540, VIX 18, DXY 103, all changes 0, corr 0.5),
 * which always produced "RISK ON 55/100".
 *
 *   BTC price + 24h change      CoinGecko /simple/price (lib/coingecko getSimplePrices)
 *   SPY / GLD / XLK / XLU / XLF  quote cascade (lib/marketData getQuote: Redis → Postgres → Alpha Vantage)
 *   VIX                          regime overlay inputs (macro_series, FRED CSV fallback when stale — PR #107)
 *   DXY (broad USD, DTWEXBGS)    macro_series with the same FRED CSV fallback; change = last two observations
 *   BTC↔SPY correlation          20 daily returns: SPY closes from ohlcv_bars, BTC 00:00 UTC closes from CoinGecko
 *
 * BTC and SPY are required (the regime is built from their moves). Every other input is optional: when it is missing
 * or stale it is reported as unavailable and not scored — never replaced by a default.
 */
import { getSimplePrices, getMarketChartHistory } from '@/lib/coingecko';
import { getQuote } from '@/lib/marketData';
import { loadRegimeOverlayInputs, macroWithFallback } from '@/lib/scoring/canonical/regimeOverlayData';
import { loadStoredDailyBars } from '@/lib/scoring/canonical/barStore';
import type { AssetSnapshot, CorrelationRegimeInput } from '@/lib/correlation-regime-engine';

const DAY_MS = 86_400_000;
/** Quotes / daily bars older than this are treated as unavailable (covers a long weekend). */
export const CROSS_ASSET_QUOTE_MAX_AGE_DAYS = 5;
/** VIXCLS is published with a one-day lag; a long weekend plus the lag can reach ~6 days. */
export const CROSS_ASSET_VIX_MAX_AGE_DAYS = 7;
/** DTWEXBGS is published weekly with a lag, so a daily value can be ~a week old. */
export const CROSS_ASSET_DXY_MAX_AGE_DAYS = 10;
export const CORRELATION_RETURNS = 20;
export const CORRELATION_MIN_RETURNS = 15;

export interface CrossAssetInputInfo {
  label: string;
  available: boolean;
  value: number | null;
  /** Percent change used by the model (24h for BTC, session for quotes, last observation for DXY). */
  changePct: number | null;
  asOf: string | null;
  source: string | null;
  note?: string;
}

export interface CrossAssetQuote { price: number; changePct: number; asOf: string | null; source: string }
export interface CrossAssetDeps {
  now: () => number;
  btc: () => Promise<CrossAssetQuote | null>;
  quote: (symbol: string) => Promise<CrossAssetQuote | null>;
  vix: () => Promise<{ level: number; asOf: string | null; source: string } | null>;
  dxy: () => Promise<{ level: number; changePct: number | null; asOf: string | null; source: string } | null>;
  spyDaily: () => Promise<Array<{ date: string; close: number }>>;
  btcDaily: () => Promise<Array<{ date: string; close: number }>>;
}

export interface CrossAssetLoadResult {
  /** null when a required input (BTC or SPY) is unavailable — the route then reports the regime as unavailable. */
  input: CorrelationRegimeInput | null;
  inputs: Record<'btc' | 'spy' | 'vix' | 'dxy' | 'gold' | 'btcSpyCorrelation' | 'sectors', CrossAssetInputInfo>;
  missingRequired: string[];
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function ageDays(asOf: string | null, now: number): number | null {
  if (!asOf) return null;
  const t = Date.parse(asOf.length === 10 ? `${asOf}T00:00:00Z` : asOf);
  return Number.isFinite(t) ? (now - t) / DAY_MS : null;
}

/** Pearson correlation of the last `n` daily returns on SPY session dates where both series have a close. */
export function btcSpyReturnCorrelation(spy: Array<{ date: string; close: number }>, btc: Array<{ date: string; close: number }>, n = CORRELATION_RETURNS): { value: number; returns: number; asOf: string } | null {
  const btcBy = new Map(btc.filter((b) => fin(b.close) && b.close > 0).map((b) => [b.date, b.close]));
  const pts = spy.filter((s) => fin(s.close) && s.close > 0 && btcBy.has(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const rs: number[] = [], rb: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    rs.push(pts[i].close / pts[i - 1].close - 1);
    rb.push(btcBy.get(pts[i].date)! / btcBy.get(pts[i - 1].date)! - 1);
  }
  const xs = rs.slice(-n), ys = rb.slice(-n);
  if (xs.length < CORRELATION_MIN_RETURNS) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return { value: sxy / Math.sqrt(sxx * syy), returns: xs.length, asOf: pts[pts.length - 1].date };
}

const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };

export const defaultCrossAssetDeps: CrossAssetDeps = {
  now: () => Date.now(),
  btc: async () => {
    const p = (await getSimplePrices(['bitcoin'], { include_24h_change: true }))?.bitcoin;
    if (!p || !fin(p.usd) || !fin(p.usd_24h_change)) return null;
    return { price: p.usd, changePct: p.usd_24h_change, asOf: new Date(p.last_updated_at ? p.last_updated_at * 1000 : Date.now()).toISOString(), source: 'CoinGecko (24h change)' };
  },
  quote: async (symbol) => {
    const env = await getQuote(symbol);
    const d = env?.data;
    if (!d || !fin(d.price) || !fin(d.changePercent)) return null;
    return { price: d.price, changePct: d.changePercent, asOf: d.latestTradingDay ?? env.fetchedAt ?? null, source: `Alpha Vantage quote (${env.fromCache})` };
  },
  vix: async () => {
    const v = (await loadRegimeOverlayInputs()).vix;
    return v && fin(v.level) ? { level: v.level, asOf: v.asOf ?? null, source: v.source === 'fred-csv' ? 'FRED CSV (VIXCLS)' : 'FRED (VIXCLS, stored)' } : null;
  },
  dxy: async () => {
    const r = await macroWithFallback('DXY', 2, Date.now());
    const rows = r?.rows ?? [];
    if (!rows.length || !fin(rows[0].value)) return null;
    const changePct = rows.length >= 2 && fin(rows[1].value) && rows[1].value > 0 ? (rows[0].value / rows[1].value - 1) * 100 : null;
    return { level: rows[0].value, changePct, asOf: rows[0].on, source: r!.source === 'fred-csv' ? 'FRED CSV (DTWEXBGS)' : 'FRED (DTWEXBGS, stored)' };
  },
  spyDaily: async () => (await loadStoredDailyBars('SPY', 40)).map((b) => ({ date: b.t.slice(0, 10), close: b.close })),
  btcDaily: async () => {
    const prices = (await getMarketChartHistory('bitcoin', 45))?.prices ?? [];
    // Daily points sit at 00:00 UTC: the price at 00:00 UTC on D+1 is day D's close. Skip the trailing "now" point.
    return prices
      .filter(([t, v]) => fin(t) && fin(v) && Math.abs(t - Math.round(t / DAY_MS) * DAY_MS) <= 3_600_000)
      .map(([t, v]) => ({ date: isoDate(Math.round(t / DAY_MS) * DAY_MS - DAY_MS), close: v }));
  },
};

function snap(symbol: string, price: number, changePct: number, asOf: string | null): AssetSnapshot {
  return { symbol, price, change24h: changePct, timestamp: asOf ?? new Date().toISOString() };
}

const info = (label: string, extra: Partial<CrossAssetInputInfo> = {}): CrossAssetInputInfo =>
  ({ label, available: false, value: null, changePct: null, asOf: null, source: null, ...extra });

export async function loadCrossAssetInputs(deps: CrossAssetDeps = defaultCrossAssetDeps): Promise<CrossAssetLoadResult> {
  const now = deps.now();
  const fresh = (q: { asOf: string | null } | null, maxDays: number) => {
    if (!q) return false;
    const a = ageDays(q.asOf, now);
    return a !== null && a <= maxDays;
  };
  const [btc, spyQ, gld, xlk, xlu, xlf, vix, dxy, spyDaily, btcDaily] = await Promise.all([
    safe(deps.btc), safe(() => deps.quote('SPY')), safe(() => deps.quote('GLD')),
    safe(() => deps.quote('XLK')), safe(() => deps.quote('XLU')), safe(() => deps.quote('XLF')),
    safe(deps.vix), safe(deps.dxy), safe(deps.spyDaily), safe(deps.btcDaily),
  ]);
  const inputs: CrossAssetLoadResult['inputs'] = {
    btc: info('BTC'), spy: info('SPY'), vix: info('VIX'), dxy: info('USD (DXY broad)'), gold: info('Gold (GLD)'),
    btcSpyCorrelation: info('BTC↔SPY 20-day correlation'), sectors: info('Sectors (XLK/XLU/XLF)'),
  };
  const missingRequired: string[] = [];

  const btcOk = btc && fresh(btc, 1) ? btc : null;
  if (btcOk) inputs.btc = { label: 'BTC', available: true, value: btcOk.price, changePct: btcOk.changePct, asOf: btcOk.asOf, source: btcOk.source };
  else { missingRequired.push('BTC'); inputs.btc.note = btc ? `quote is stale (as of ${btc.asOf ?? 'unknown'})` : 'quote unavailable'; }

  const spyOk = spyQ && fresh(spyQ, CROSS_ASSET_QUOTE_MAX_AGE_DAYS) ? spyQ : null;
  if (spyOk) inputs.spy = { label: 'SPY', available: true, value: spyOk.price, changePct: spyOk.changePct, asOf: spyOk.asOf, source: spyOk.source };
  else { missingRequired.push('SPY'); inputs.spy.note = spyQ ? `quote is stale (as of ${spyQ.asOf ?? 'unknown'})` : 'quote unavailable'; }

  const vixOk = vix && fresh(vix, CROSS_ASSET_VIX_MAX_AGE_DAYS) ? vix : null;
  if (vixOk) inputs.vix = { label: 'VIX', available: true, value: vixOk.level, changePct: null, asOf: vixOk.asOf, source: vixOk.source };
  else inputs.vix.note = vix ? `latest VIX is stale (as of ${vix.asOf ?? 'unknown'})` : 'VIX unavailable';

  const dxyOk = dxy && fin(dxy.changePct) && fresh(dxy, CROSS_ASSET_DXY_MAX_AGE_DAYS) ? dxy : null;
  if (dxyOk) inputs.dxy = { label: 'USD (DXY broad)', available: true, value: dxyOk.level, changePct: dxyOk.changePct, asOf: dxyOk.asOf, source: dxyOk.source };
  else inputs.dxy.note = dxy ? `latest USD index is stale or has no prior observation (as of ${dxy.asOf ?? 'unknown'})` : 'USD index unavailable';

  const gldOk = gld && fresh(gld, CROSS_ASSET_QUOTE_MAX_AGE_DAYS) ? gld : null;
  if (gldOk) inputs.gold = { label: 'Gold (GLD)', available: true, value: gldOk.price, changePct: gldOk.changePct, asOf: gldOk.asOf, source: gldOk.source };
  else inputs.gold.note = 'GLD quote unavailable or stale';

  const secOk = [xlk, xlu, xlf].every((q) => q && fresh(q, CROSS_ASSET_QUOTE_MAX_AGE_DAYS));
  if (secOk) inputs.sectors = { label: 'Sectors (XLK/XLU/XLF)', available: true, value: null, changePct: null, asOf: xlk!.asOf, source: xlk!.source };
  else inputs.sectors.note = 'one or more sector ETF quotes unavailable or stale';

  const spyBarsFresh = !!spyDaily?.length && (ageDays(spyDaily[spyDaily.length - 1].date, now) ?? Infinity) <= CROSS_ASSET_QUOTE_MAX_AGE_DAYS;
  const corr = spyBarsFresh && btcDaily?.length ? btcSpyReturnCorrelation(spyDaily!, btcDaily) : null;
  if (corr) inputs.btcSpyCorrelation = { label: 'BTC↔SPY 20-day correlation', available: true, value: Number(corr.value.toFixed(3)), changePct: null, asOf: corr.asOf, source: `${corr.returns} daily returns (SPY stored bars, BTC CoinGecko)` };
  else inputs.btcSpyCorrelation.note = !spyBarsFresh ? 'SPY daily bars unavailable or stale' : 'not enough overlapping daily returns';

  if (!btcOk || !spyOk) return { input: null, inputs, missingRequired };
  const input: CorrelationRegimeInput = {
    btc: snap('BTC', btcOk.price, btcOk.changePct, btcOk.asOf),
    spy: snap('SPY', spyOk.price, spyOk.changePct, spyOk.asOf),
    ...(vixOk ? { vix: snap('VIX', vixOk.level, 0, vixOk.asOf) } : {}),
    ...(dxyOk ? { dxy: snap('DXY', dxyOk.level, dxyOk.changePct!, dxyOk.asOf) } : {}),
    ...(gldOk ? { gold: snap('GLD', gldOk.price, gldOk.changePct, gldOk.asOf) } : {}),
    btcSpyCorrelation: corr ? corr.value : null,
    ...(secOk ? { sectors: { xlk: snap('XLK', xlk!.price, xlk!.changePct, xlk!.asOf), xlu: snap('XLU', xlu!.price, xlu!.changePct, xlu!.asOf), xlf: snap('XLF', xlf!.price, xlf!.changePct, xlf!.asOf) } } : {}),
  };
  return { input, inputs, missingRequired };
}
