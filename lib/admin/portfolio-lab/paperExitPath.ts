import type { Bar } from '@/types/operator';
import type { ArcaPosition, PaperExitCheckpoint, PaperExitRules } from './types';

const STEP = 15 * 60_000, HOUR = 3_600_000;
export interface PaperExitCandle {
  openAt: number; closeAt: number;
  open: number; high: number; low: number; close: number;
}
export interface PaperExitPath {
  symbol: string; market: 'CRYPTO'; timeframe: '15m';
  source: 'admin_scan_bars'|'crypto_exchange'; candles: PaperExitCandle[];
  /** Flat no-trade candles inserted between real candles (crypto exchange paths only). */
  filledBars?: number;
}

/** Reuses the scanner's AV bar-start contract. Never accepts CoinGecko close timestamps here. */
export function savePaperExitPath(bars: Bar[], symbol: string, market: string, timeframe: string, now = Date.now()): PaperExitPath | undefined {
  if (market !== 'CRYPTO' || timeframe !== '15m') return undefined;
  const candles = bars.filter(b => b.symbol === symbol && b.market === market && b.timeframe === timeframe)
    .map(b => ({ openAt: Date.parse(b.timestamp), closeAt: Date.parse(b.timestamp) + STEP,
      open: b.open, high: b.high, low: b.low, close: b.close }))
    .filter(b => Number.isFinite(b.closeAt) && b.closeAt <= now)
    .sort((a, b) => a.openAt - b.openAt).slice(-96);
  return { symbol, market, timeframe, source: 'admin_scan_bars', candles };
}

export function nearestPaperTarget(position: ArcaPosition): number | undefined {
  const direction = position.side === 'LONG' ? 1 : -1;
  return [position.takeProfit1, position.takeProfit2, position.takeProfit3]
    .filter((tp): tp is number => tp != null && Number.isFinite(tp) && tp > 0
      && direction * (tp - position.averageEntry) > 0)
    .sort((a, b) => direction * (a - b))[0];
}

export interface PaperPathResult {
  status: string;
  entryCandleExcluded?: boolean;
  checkedThrough?: string;
  checkpoint?: PaperExitCheckpoint;
  exit?: { reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT' | 'RULE_EXIT'; price: number; at: string; ambiguous: boolean };
}

/**
 * Resume from a validated journal checkpoint, never last_mark_at (a quote is not a candle check).
 * Any missing prefix/gap prevents a later target being credited after an unknown earlier stop.
 * The entry-containing candle cannot be replayed: its extremes may predate the fill.
 * Coverage explicitly excludes that partial entry candle; do not label it complete.
 * `rules` must match the rules the checkpoint was written under; a position opened without rules never gains them.
 */
export function evaluatePaperExitPath(position: ArcaPosition, path: PaperExitPath | undefined, now = Date.now(), rules?: PaperExitRules | null): PaperPathResult {
  const reject = (status: string): PaperPathResult => ({ status });
  if (!path) return reject('candle_path_unavailable');
  if (position.assetClass !== 'crypto' || path.market !== 'CRYPTO' || path.symbol !== position.symbol ||
      path.timeframe !== '15m' || !['admin_scan_bars','crypto_exchange'].includes(path.source) || !Array.isArray(path.candles)) return reject('candle_path_scope_mismatch');
  const entry = Date.parse(position.openedAt);
  if (!Number.isFinite(entry) || entry > now) return reject('candle_path_entry_invalid');
  // Fixed levels only. Replaying changed stops over old bars would introduce hindsight.
  if (position.initialStopLoss == null || position.stopLoss !== position.initialStopLoss) return reject('candle_path_original_stop_unavailable_or_changed');
  const conservativeEntry=path.source==='crypto_exchange';
  const entryOpen = (conservativeEntry?Math.floor(entry/STEP):Math.ceil(entry/STEP))*STEP;
  const entryCandleExcluded = !conservativeEntry && entryOpen !== entry;
  const target = nearestPaperTarget(position);
  const rule = rules ?? null;
  if (rule && !(Number.isFinite(rule.timeStopHours) && rule.timeStopHours > 0 && Number.isFinite(rule.timeStopMinR) && rule.timeStopMinR > 0)) return reject('candle_path_rules_invalid');
  const trail = rule?.trail ?? null;
  if (trail && !(Number.isFinite(trail.atr) && trail.atr > 0 && Number.isFinite(trail.atrMultiple) && trail.atrMultiple > 0)) return reject('candle_path_rules_invalid');
  let firstOpen = entryOpen;
  let best: number | null = null;
  const checkpoint = position.exitCheckpoint;
  if (checkpoint != null) {
    const through = Date.parse(checkpoint.through);
    const sameRules = JSON.stringify(checkpoint.rules ?? null) === JSON.stringify(rule);
    if (checkpoint.version !== 1 || checkpoint.entryAt !== position.openedAt ||
        checkpoint.side !== position.side || checkpoint.stop !== position.stopLoss ||
        checkpoint.target !== (target ?? null) || !sameRules || (rule && checkpoint.best === undefined) ||
        !Number.isFinite(through) || through < entryOpen || through > now || through % STEP !== 0) return reject('candle_checkpoint_invalid_or_rules_changed');
    firstOpen = through;
    best = checkpoint.best ?? null;
  }
  const bars = path.candles.filter(b => b.openAt >= firstOpen && b.closeAt <= now).sort((a, b) => a.openAt - b.openAt);
  if (!bars.length) return reject('candle_path_no_closed_bars');
  if (new Set(bars.map(b => b.openAt)).size !== bars.length) return reject('candle_path_duplicate_bar');
  if (bars[0].openAt !== firstOpen) return reject('candle_path_entry_prefix_unresolved');
  const long = position.side === 'LONG';
  let expected = firstOpen;
  for (const b of bars) {
    if (![b.openAt, b.closeAt, b.open, b.high, b.low, b.close].every(Number.isFinite) ||
        b.openAt !== expected || b.closeAt - b.openAt !== STEP || b.low <= 0 ||
        b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close)) return reject('candle_path_gap_or_invalid_bar');
    const partialEntry=conservativeEntry && b.openAt<entry;
    // The trail is ratcheted from candles already completed; this bar only tests it. Long-only: a short never gains a trail here.
    const trailStop = trail && long && best != null ? Math.max(position.stopLoss!, best - trail.atrMultiple * trail.atr) : position.stopLoss!;
    const trailed = trailStop > position.stopLoss!;
    const stopHit = long ? b.low <= trailStop : b.high >= position.stopLoss!;
    const targetHit = !partialEntry && target != null && (long ? b.high >= target : b.low <= target);
    if (stopHit || targetHit) {
      const gapStop = long ? b.open <= trailStop : b.open >= position.stopLoss!;
      // Stop first on unresolved OHLC ordering; gap losses fill at the adverse open.
      return { status: 'candle_path_exit', entryCandleExcluded, exit: {
        reason: stopHit ? (trailed ? 'RULE_EXIT' : 'STOP_LOSS') : 'TAKE_PROFIT',
        price: stopHit ? (gapStop && !partialEntry ? b.open : trailStop) : target!,
        at: new Date(b.closeAt).toISOString(), ambiguous: (stopHit && targetHit) || (partialEntry && stopHit),
      } };
    }
    if (rule && !partialEntry) {
      // Best excursion uses only completed candles after entry; the time stop never sees a later price.
      best = best == null ? (long ? b.high : b.low) : long ? Math.max(best, b.high) : Math.min(best, b.low);
      const risk = Math.abs(position.averageEntry - position.stopLoss!);
      const reached = long ? best - position.averageEntry : position.averageEntry - best;
      if (b.closeAt >= entry + rule.timeStopHours * HOUR && reached < rule.timeStopMinR * risk) {
        return { status: 'candle_path_exit', entryCandleExcluded, exit: {
          reason: 'TIME_EXIT', price: b.close, at: new Date(b.closeAt).toISOString(), ambiguous: false,
        } };
      }
    }
    expected = b.closeAt;
  }
  const checkedThrough = new Date(expected).toISOString();
  return { status: 'candle_path_checked', entryCandleExcluded, checkedThrough, checkpoint: {
    version: 1, through: checkedThrough, entryAt: position.openedAt, side: position.side,
    stop: position.stopLoss!, target: target ?? null, ...(rule ? { rules: rule, best } : {}),
  } };
}
