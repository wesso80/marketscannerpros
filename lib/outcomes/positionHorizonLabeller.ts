/**
 * 6-week / 12-week labelling for ai_signal_log (migration 105). Called by /api/cron/label-ai-outcomes after the 4h
 * and 24h horizons. Maths: lib/outcomes/positionHorizon.ts.
 *
 * - Migration not run: the columns are detected at runtime; without them this logs one line and does nothing.
 * - Candidates: LONG/SHORT rows with an entry price and a supported asset whose horizon (42 / 84 calendar days) has
 *   passed and that are not labelled for it yet, oldest first, POSITION_MAX_ROWS per horizon per run.
 * - Bars (DAILY only, one load per symbol per run, shared by both horizons):
 *     equities: the shared lib/marketData daily cache (Redis → Postgres → AV compact, the series everything else
 *               already uses) merged with the longer stored history in ohlcv_bars (a DB read, no API call);
 *     crypto:   one Alpha Vantage DIGITAL_CURRENCY_DAILY call per coin per run (rate-governed; no CoinGecko).
 * - Rows whose horizon bar is not there yet stay pending (NULL). Rows that can never be measured (history does not
 *   reach back to the call, a split in the window, no bars 30 days past the horizon) get outcome 'no_data' + a note.
 * - Every UPDATE is guarded on "still NULL for this horizon": overlapping runs cannot relabel a row.
 */
import { q } from '@/lib/db';
import { avFetch } from '@/lib/avRateGovernor';
import { getBars } from '@/lib/marketData';
import { pgReadBars } from '@/lib/marketData/store';
import { normalizeAssetClass, normalizeCryptoSymbol, normalizeDirection, type OutcomeAssetClass } from './aiOutcomeLabel';
import {
  POSITION_HORIZONS,
  POSITION_HORIZON_DAYS,
  equityDailyToOhlcBars,
  measurePositionHorizon,
  mergeDailyBars,
  parseAvCryptoDailyOhlc,
  type DailyOhlcBar,
  type PositionHorizon,
} from './positionHorizon';

export const POSITION_MIGRATION_FILE = 'migrations/105_ai_signal_outcome_6w_12w.sql';

const SUPPORTED_ASSET_SQL = `LOWER(TRIM(asset_type)) IN ('equity','equities','stock','stocks','etf','crypto')`;
const DIRECTIONAL_SQL = `UPPER(TRIM(COALESCE(trade_bias, ''))) IN ('LONG','SHORT')`;
/** Stored equity daily history read from ohlcv_bars (~2 years of sessions). */
const STORED_DAILY_BARS = 520;

/** Columns migration 105 adds, per horizon. */
export function positionHorizonColumns(h: PositionHorizon): string[] {
  return [
    `outcome_${h}`, `price_after_${h}`, `price_after_${h}_at`, `pct_move_${h}`, `max_price_${h}`, `min_price_${h}`,
    `mfe_pct_${h}`, `mae_pct_${h}`, `first_hit_${h}`, `first_hit_${h}_date`, `r_multiple_${h}`, `bars_${h}`,
    `outcome_${h}_note`, `outcome_${h}_measured_at`,
  ];
}

/** Rows per horizon per run (oldest first). AI_OUTCOME_POSITION_MAX_ROWS overrides (1..1000). */
export function positionMaxRows(): number {
  const n = Number(process.env.AI_OUTCOME_POSITION_MAX_ROWS);
  return Number.isFinite(n) && n >= 1 ? Math.min(1000, Math.floor(n)) : 200;
}

/** Which horizons have ALL their columns (i.e. migration 105 has been run). Empty on any error. */
export async function detectPositionHorizons(): Promise<PositionHorizon[]> {
  const wanted = POSITION_HORIZONS.flatMap(positionHorizonColumns);
  try {
    const rows = await q<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ai_signal_log'
         AND column_name = ANY($1::text[])`,
      [wanted],
    );
    const have = new Set(rows.map((r) => r.column_name));
    return POSITION_HORIZONS.filter((h) => positionHorizonColumns(h).every((c) => have.has(c)));
  } catch {
    return [];
  }
}

export interface PositionCandidate {
  id: number;
  symbol: string;
  asset_type: string | null;
  trade_bias: string | null;
  price_at_signal: string | number | null;
  stop_loss: string | number | null;
  target_1: string | number | null;
  signal_at: string | Date;
}

export function positionCandidateSql(h: PositionHorizon, limit = positionMaxRows()): string {
  return `
      SELECT id, symbol, asset_type, trade_bias, price_at_signal, stop_loss, target_1, signal_at
      FROM ai_signal_log
      WHERE outcome_${h} IS NULL
        AND signal_at <= NOW() - INTERVAL '${POSITION_HORIZON_DAYS[h]} days'
        AND ${DIRECTIONAL_SQL}
        AND price_at_signal IS NOT NULL AND price_at_signal > 0
        AND ${SUPPORTED_ASSET_SQL}
      ORDER BY signal_at ASC
      LIMIT ${limit}`;
}

export interface DailyBarLoaders {
  equity: (symbol: string) => Promise<DailyOhlcBar[] | null>;
  crypto: (symbol: string) => Promise<DailyOhlcBar[] | null>;
}

/** Equity daily bars: the shared cache series, plus the longer stored history (DB read only). */
export async function loadEquityDailyOhlc(symbol: string): Promise<DailyOhlcBar[] | null> {
  let cached: DailyOhlcBar[] = [];
  let stored: DailyOhlcBar[] = [];
  try {
    const env = await getBars(symbol, 'daily');
    cached = env.data ? equityDailyToOhlcBars(env.data) : [];
  } catch (err) {
    console.warn(`[label-ai-outcomes] 6w/12w daily cache read failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const pg = await pgReadBars(symbol, 'daily', STORED_DAILY_BARS);
    stored = pg ? equityDailyToOhlcBars(pg.bars) : [];
  } catch {
    // ohlcv_bars unavailable: the cached series alone is used.
  }
  const merged = mergeDailyBars(cached, stored);
  return merged.length ? merged : null;
}

/** Crypto daily bars: one AV DIGITAL_CURRENCY_DAILY call (rate-governed). */
export async function loadCryptoDailyOhlc(symbol: string): Promise<DailyOhlcBar[] | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const sym = normalizeCryptoSymbol(symbol);
  try {
    const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${encodeURIComponent(sym)}&market=USD&apikey=${encodeURIComponent(key)}`;
    const json = await avFetch(url, `OUTCOME 6W/12W CRYPTO_DAILY ${sym}`);
    const bars = json ? parseAvCryptoDailyOhlc(json) : [];
    return bars.length ? bars : null;
  } catch (err) {
    console.warn(`[label-ai-outcomes] 6w/12w crypto daily fetch failed for ${sym}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export const defaultDailyBarLoaders: DailyBarLoaders = { equity: loadEquityDailyOhlc, crypto: loadCryptoDailyOhlc };

export interface PositionHorizonTally {
  candidates: number;
  labeled: number;
  correct: number;
  wrong: number;
  neutral: number;
  noData: number;
  stillPending: number;
  alreadyLabeled: number;
  skipped: number;
}

export interface PositionHorizonRunResult {
  enabled: boolean;
  horizons: Partial<Record<PositionHorizon, PositionHorizonTally>>;
  barLoads: { equity: number; crypto: number };
  deferredOverBudget: number;
  note?: string;
}

const tally = (): PositionHorizonTally => ({
  candidates: 0, labeled: 0, correct: 0, wrong: 0, neutral: 0, noData: 0, stillPending: 0, alreadyLabeled: 0, skipped: 0,
});

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function labelPositionHorizons(opts: {
  nowMs: number;
  budgetMs: number;
  loaders?: DailyBarLoaders;
}): Promise<PositionHorizonRunResult> {
  const loaders = opts.loaders ?? defaultDailyBarLoaders;
  const horizons = await detectPositionHorizons();
  if (!horizons.length) {
    const note = `6w/12w outcome columns missing (run ${POSITION_MIGRATION_FILE}); 6w/12w labelling skipped`;
    console.warn(`[label-ai-outcomes] ${note}`);
    return { enabled: false, horizons: {}, barLoads: { equity: 0, crypto: 0 }, deferredOverBudget: 0, note };
  }

  const started = Date.now();
  const memo = new Map<string, Promise<DailyOhlcBar[] | null>>();
  const barLoads = { equity: 0, crypto: 0 };
  const load = (symbol: string, asset: OutcomeAssetClass) => {
    const k = `${asset}:${symbol.toUpperCase()}`;
    let p = memo.get(k);
    if (!p) {
      barLoads[asset] += 1;
      p = loaders[asset](symbol).catch(() => null);
      memo.set(k, p);
    }
    return p;
  };

  const result: PositionHorizonRunResult = { enabled: true, horizons: {}, barLoads, deferredOverBudget: 0 };
  for (const h of horizons) {
    const t = tally();
    result.horizons[h] = t;
    let rows: PositionCandidate[] = [];
    try {
      rows = await q<PositionCandidate>(positionCandidateSql(h));
    } catch (err) {
      console.warn(`[label-ai-outcomes] ${h} candidate query failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    t.candidates = rows.length;
    for (const row of rows) {
      const direction = normalizeDirection(row.trade_bias);
      const asset = normalizeAssetClass(row.asset_type);
      const entry = Number(row.price_at_signal);
      const signalAtMs = new Date(row.signal_at).getTime();
      if (!direction || !asset || !(entry > 0) || !Number.isFinite(signalAtMs)) { t.skipped++; continue; }
      const k = `${asset}:${row.symbol.toUpperCase()}`;
      if (Date.now() - started > opts.budgetMs && !memo.has(k)) { result.deferredOverBudget++; continue; }

      const bars = await load(row.symbol, asset);
      const m = measurePositionHorizon({
        direction, entry, signalAtMs, horizon: h, nowMs: opts.nowMs,
        stop: numOrNull(row.stop_loss), target: numOrNull(row.target_1), bars: bars ?? [],
      });
      if (m.status === 'pending') { t.stillPending++; continue; }

      let updated: { id: number }[] = [];
      try {
        updated = m.status === 'no_data'
          ? await q<{ id: number }>(
              `UPDATE ai_signal_log
               SET outcome_${h} = 'no_data', outcome_${h}_note = $2, outcome_${h}_measured_at = NOW()
               WHERE id = $1 AND outcome_${h} IS NULL
               RETURNING id`,
              [row.id, m.reason.slice(0, 120)],
            )
          : await q<{ id: number }>(
              `UPDATE ai_signal_log
               SET outcome_${h} = $2, price_after_${h} = $3, price_after_${h}_at = $4, pct_move_${h} = $5,
                   max_price_${h} = $6, min_price_${h} = $7, mfe_pct_${h} = $8, mae_pct_${h} = $9,
                   first_hit_${h} = $10, first_hit_${h}_date = $11::date, r_multiple_${h} = $12, bars_${h} = $13,
                   outcome_${h}_note = NULL, outcome_${h}_measured_at = NOW()
               WHERE id = $1 AND outcome_${h} IS NULL
               RETURNING id`,
              [
                row.id, m.outcome, m.exitPrice, new Date(m.exitAt).toISOString(), m.pctMove,
                m.maxPrice, m.minPrice, m.mfePct, m.maePct,
                m.firstHit, m.firstHitDay, m.rMultiple, m.bars,
              ],
            );
      } catch (err) {
        console.warn(`[label-ai-outcomes] ${h} update failed for signal ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
        t.skipped++;
        continue;
      }
      if (!updated.length) { t.alreadyLabeled++; continue; }
      if (m.status === 'no_data') { t.noData++; continue; }
      t.labeled++;
      t[m.outcome]++;
    }
  }
  return result;
}
