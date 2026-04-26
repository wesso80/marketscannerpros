/**
 * MSP Operator — Playbook Engine
 * Detects valid trade structures (playbooks) from feature vectors + regime.
 * Returns sorted TradeCandidate[] that pass initial structural checks.
 * @internal
 */

import type {
  PlaybookDetectRequest, TradeCandidate, Playbook, Direction,
  FeatureVector, RegimeDecision, KeyLevel, EntryZone, Bar,
} from '@/types/operator';
import { generateId, nowISO } from './shared';

/* ── ATR helper for entry zone computation ──────────────────── */

function computeATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const recent = bars.slice(-(period + 1));
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low - recent[i - 1].close),
    );
    atrSum += tr;
  }
  return atrSum / period;
}

function computeEntryZone(
  bars: Bar[] | undefined,
  direction: Direction,
  refPrice: number,
  levels: KeyLevel[],
): { entryZone: EntryZone; invalidationPrice: number; targets: number[] } {
  const lastClose = bars?.length ? bars[bars.length - 1].close : refPrice;
  const atr = bars?.length ? computeATR(bars) : lastClose * 0.015;
  const base = refPrice > 0 ? refPrice : lastClose;

  if (direction === 'LONG') {
    return {
      entryZone: { min: base - atr * 0.3, max: base + atr * 0.1 },
      invalidationPrice: base - atr * 1.5,
      targets: [base + atr * 1.5, base + atr * 3],
    };
  }
  return {
    entryZone: { min: base - atr * 0.1, max: base + atr * 0.3 },
    invalidationPrice: base + atr * 1.5,
    targets: [base - atr * 1.5, base - atr * 3],
  };
}

interface PlaybookDetector {
  playbook: Playbook;
  detect(f: FeatureVector['features'], r: RegimeDecision, levels: KeyLevel[], bars?: Bar[]): DetectionResult | null;
}

interface DetectionResult {
  direction: Direction;
  entryZone: EntryZone;
  invalidationPrice: number;
  targets: number[];
  notes: string[];
}

function directionalConsensus(
  f: FeatureVector['features'],
  fallback: Direction = 'LONG',
): Direction {
  const votes: Direction[] = [];
  if (f.trendDirection && f.trendDirection !== 'NEUTRAL') votes.push(f.trendDirection);
  if (f.momentumDirection && f.momentumDirection !== 'NEUTRAL') votes.push(f.momentumDirection);
  if (f.levelReclaimDirection && f.levelReclaimDirection !== 'NEUTRAL') votes.push(f.levelReclaimDirection);
  const longs = votes.filter((v) => v === 'LONG').length;
  const shorts = votes.filter((v) => v === 'SHORT').length;
  if (longs > shorts) return 'LONG';
  if (shorts > longs) return 'SHORT';
  return fallback;
}

/* ── Individual playbook detectors ──────────────────────────── */

const detectors: PlaybookDetector[] = [
  {
    playbook: 'BREAKOUT_CONTINUATION',
    detect(f, r, levels) {
      if (f.trendScore < 0.55 || f.volExpansionScore < 0.45) return null;
      if (f.structureScore < 0.4) return null;

      // Look for resistance key-level to break
      const resistanceLevels = levels.filter(l =>
        l.category === 'SUPPLY' || l.category === 'WEEKLY_HIGH' || l.category === 'MONTHLY_HIGH'
      );
      const supportLevels = levels.filter(l =>
        l.category === 'DEMAND' || l.category === 'WEEKLY_LOW' || l.category === 'MONTHLY_LOW'
      );

      // Default entry zone — actual prices will come from live data
      const direction: Direction = f.breakoutDirection && f.breakoutDirection !== 'NEUTRAL'
        ? f.breakoutDirection
        : directionalConsensus(f, f.momentumScore >= 0.5 ? 'LONG' : 'SHORT');
      const refLevel = direction === 'LONG' ? resistanceLevels[0] : supportLevels[0];
      const refPrice = refLevel?.price ?? 0;

      return {
        direction,
        entryZone: { min: refPrice * 0.998, max: refPrice * 1.002 },
        invalidationPrice: direction === 'LONG' ? refPrice * 0.985 : refPrice * 1.015,
        targets: [refPrice * (direction === 'LONG' ? 1.015 : 0.985), refPrice * (direction === 'LONG' ? 1.03 : 0.97)],
        notes: [`Breakout near ${refLevel?.name ?? 'key level'}`],
      };
    },
  },
  {
    playbook: 'PULLBACK_CONTINUATION',
    detect(f, r, levels, bars) {
      if (f.trendScore < 0.5) return null;
      if (f.extensionScore > 0.7) return null;
      if (f.emaAlignmentScore < 0.4) return null;

      const direction: Direction = directionalConsensus(f, 'LONG');
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Pullback in trend with EMA alignment'],
      };
    },
  },
  {
    playbook: 'FAILED_BREAKOUT_REVERSAL',
    detect(f, r, levels, bars) {
      if (r.regime !== 'FAILED_BREAKOUT_TRAP' && r.regime !== 'TREND_EXHAUSTION') return null;
      if (f.structureScore < 0.4) return null;

      const direction: Direction = f.sweepDirection && f.sweepDirection !== 'NEUTRAL'
        ? f.sweepDirection
        : f.momentumDirection === 'LONG' ? 'SHORT' : 'LONG';
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Failed breakout trap detected'],
      };
    },
  },
  {
    playbook: 'RANGE_MEAN_REVERSION',
    detect(f, r, levels, bars) {
      if (r.regime !== 'ROTATIONAL_RANGE' && r.regime !== 'TREND_EXHAUSTION') return null;
      if (f.extensionScore < 0.55) return null;

      const direction: Direction = f.sweepDirection && f.sweepDirection !== 'NEUTRAL'
        ? f.sweepDirection
        : f.momentumDirection === 'LONG' ? 'SHORT' : 'LONG';
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Extended within range, mean reversion setup'],
      };
    },
  },
  {
    playbook: 'SQUEEZE_EXPANSION',
    detect(f, r, levels, bars) {
      if (r.regime !== 'COMPRESSION_COIL' && f.bbwpPercentile > 0.2) return null;
      if (f.atrPercentile > 0.3) return null;

      const direction: Direction = f.breakoutDirection && f.breakoutDirection !== 'NEUTRAL'
        ? f.breakoutDirection
        : directionalConsensus(f, f.emaAlignmentScore >= 0.5 ? 'LONG' : 'SHORT');
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Squeeze/compression coil, expansion imminent'],
      };
    },
  },
  {
    playbook: 'POST_EVENT_RECLAIM',
    detect(f, r, levels, bars) {
      if (r.regime !== 'EVENT_SHOCK' && r.regime !== 'POST_NEWS_PRICE_DISCOVERY') return null;
      if (f.structureScore < 0.3) return null;

      const direction: Direction = 'LONG';
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Post-event reclaim setup'],
      };
    },
  },
  {
    playbook: 'LIQUIDITY_SWEEP_REVERSAL',
    detect(f, r, levels, bars) {
      if (r.regime !== 'FAILED_BREAKOUT_TRAP') return null;
      if (f.liquidityScore > 0.5) return null;

      const direction: Direction = f.sweepDirection && f.sweepDirection !== 'NEUTRAL'
        ? f.sweepDirection
        : f.momentumDirection === 'SHORT' ? 'LONG' : 'SHORT';
      const { entryZone, invalidationPrice, targets } = computeEntryZone(bars, direction, 0, levels);
      return {
        direction,
        entryZone,
        invalidationPrice,
        targets,
        notes: ['Liquidity sweep below key level'],
      };
    },
  },
];

/* ── Main Detection ─────────────────────────────────────────── */

export function detectPlaybooks(req: PlaybookDetectRequest): TradeCandidate[] {
  const { symbol, market, timeframe, featureVector, regimeDecision, keyLevels, bars } = req;
  const candidates: TradeCandidate[] = [];

  for (const detector of detectors) {
    // Skip if this playbook is blocked by regime
    if (regimeDecision.blockedPlaybooks.includes(detector.playbook)) continue;

    const result = detector.detect(featureVector.features, regimeDecision, keyLevels, bars);
    if (!result) continue;

    candidates.push({
      candidateId: generateId('cand'),
      symbol,
      market,
      timeframe,
      timestamp: nowISO(),
      playbook: detector.playbook,
      direction: result.direction,
      entryZone: result.entryZone,
      triggerPrice: null,
      invalidationPrice: result.invalidationPrice,
      targets: result.targets,
      candidateState: 'DISCOVERED',
      notes: result.notes,
    });
  }

  return candidates;
}
