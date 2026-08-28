/**
 * Command Center — educational interpretation helpers (Stage 2).
 *
 * Pure transforms that turn the platform's EXISTING data (regime, sectors,
 * movers, crypto overview, economic calendar) into probability-honest,
 * educational descriptors for the 30-second market-intelligence overview.
 *
 * No new data sources. No buy/sell language. No probabilities. Correlation is
 * described as association, never causation. Everything here is descriptive of
 * observable conditions.
 *
 * Pure and dependency-light (imports types only) so it can be unit-tested.
 */

import type { AnalyticalStance } from './terminology';

/* ── Structural input shapes (subset of the v2 API responses we rely on) ── */

export interface RegimeLike {
  regime: string;
  riskLevel?: string;
  permission?: string;
  updatedAt?: string;
  signals?: Array<{ stale: boolean }>;
}

export interface MoverLike {
  ticker: string;
  change_percentage: string | number;
  volume?: string | number;
  asset_class?: 'equity' | 'crypto';
}

export interface SectorLike {
  name: string;
  changePercent: number;
}

export interface CryptoOverviewLike {
  totalMarketCapFormatted?: string;
  marketCapChange24h?: number;
  btcDominance?: number;
  ethDominance?: number;
}

export interface EventLike {
  event: string;
  impact?: string;
  date?: string;
  time?: string;
  country?: string;
  category?: string;
}

/* ── Parsing ── */

/** Parse a percentage that may arrive as "+1.2%", "-0.5", 1.2, or "N/A". */
export function parsePct(v: string | number | undefined | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[%+\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/* ── Regime ── */

/** Human-readable labels for the governor regime taxonomy (from /api/regime). */
export const REGIME_LABEL: Record<string, string> = {
  TREND_UP: 'Trending — risk-on',
  TREND_DOWN: 'Trending — risk-off',
  RANGE_NEUTRAL: 'Range / mean-reversion',
  VOL_EXPANSION: 'Volatility expansion',
  VOL_CONTRACTION: 'Volatility contraction',
  RISK_OFF_STRESS: 'Risk-off / stress',
};

/** Map a regime to an educational directional stance. Unknown → 'unknown'. */
export function regimeToStance(regime?: string): AnalyticalStance {
  switch (regime) {
    case 'TREND_UP': return 'bullish';
    case 'TREND_DOWN':
    case 'RISK_OFF_STRESS': return 'bearish';
    case 'RANGE_NEUTRAL':
    case 'VOL_CONTRACTION': return 'neutral';
    case 'VOL_EXPANSION': return 'mixed';
    default: return 'unknown';
  }
}

export interface RegimeDescription {
  regimeLabel: string;
  stance: AnalyticalStance;
  riskLabel: string;
  /** True when the regime differs from the previously observed regime. */
  changed: boolean;
  previousLabel: string | null;
  /** True when any contributing signal is stale. */
  stale: boolean;
  summary: string;
}

const RISK_LEVEL_LABEL: Record<string, string> = {
  low: 'Low risk environment',
  moderate: 'Moderate risk environment',
  elevated: 'Elevated risk environment',
  extreme: 'Extreme risk environment',
};

export function describeRegime(current: RegimeLike | null, previousRegime?: string | null): RegimeDescription {
  if (!current || !current.regime) {
    return {
      regimeLabel: 'Unknown',
      stance: 'unknown',
      riskLabel: 'Risk environment unavailable',
      changed: false,
      previousLabel: null,
      stale: true,
      summary: 'Insufficient evidence to classify the current market regime.',
    };
  }
  const regimeLabel = REGIME_LABEL[current.regime] ?? current.regime;
  const stance = regimeToStance(current.regime);
  const riskLabel = RISK_LEVEL_LABEL[(current.riskLevel ?? '').toLowerCase()] ?? 'Risk environment unclassified';
  const changed = Boolean(previousRegime && previousRegime !== current.regime);
  const previousLabel = previousRegime ? (REGIME_LABEL[previousRegime] ?? previousRegime) : null;
  const stale = Boolean(current.signals?.some((s) => s.stale));
  const changeNote = changed && previousLabel ? ` Recently shifted from ${previousLabel.toLowerCase()}.` : '';
  const staleNote = stale ? ' Some contributing signals are stale — interpret with caution.' : '';
  const summary = `Conditions are consistent with a ${regimeLabel.toLowerCase()} environment. ${riskLabel}.${changeNote}${staleNote}`;
  return { regimeLabel, stance, riskLabel, changed, previousLabel, stale, summary };
}

/* ── Strength / weakness ── */

export interface StrengthRanking {
  strongest: Array<{ name: string; changePercent: number }>;
  weakest: Array<{ name: string; changePercent: number }>;
  /** Fraction of areas with a positive change (0–1). */
  greenRatio: number;
  total: number;
}

/** Rank the strongest/weakest areas. Ranking is by observed % change — labelled
 *  as such; this is a relative read, not a forecast. */
export function rankSectorStrength(sectors: SectorLike[], limit = 3): StrengthRanking {
  const valid = sectors.filter((s) => Number.isFinite(s.changePercent));
  const sorted = [...valid].sort((a, b) => b.changePercent - a.changePercent);
  const green = valid.filter((s) => s.changePercent > 0).length;
  return {
    strongest: sorted.slice(0, limit).map((s) => ({ name: s.name, changePercent: s.changePercent })),
    weakest: sorted.slice(-limit).reverse().map((s) => ({ name: s.name, changePercent: s.changePercent })),
    greenRatio: valid.length ? green / valid.length : 0,
    total: valid.length,
  };
}

/** Top movers of an asset class, ranked by absolute % change. */
export function topMovers(movers: MoverLike[], assetClass: 'equity' | 'crypto' | 'all', limit = 5): MoverLike[] {
  const filtered = assetClass === 'all' ? movers : movers.filter((m) => m.asset_class === assetClass);
  return [...filtered]
    .sort((a, b) => Math.abs(parsePct(b.change_percentage)) - Math.abs(parsePct(a.change_percentage)))
    .slice(0, limit);
}

/* ── Risk tone (breadth + crypto participation) ── */

export interface RiskToneResult {
  tone: 'risk_on' | 'risk_off' | 'mixed';
  label: string;
  note: string;
}

export function deriveRiskTone(greenRatio: number, cryptoChange24h: number | undefined): RiskToneResult {
  const cryptoUp = (cryptoChange24h ?? 0) > 0.5;
  const cryptoDown = (cryptoChange24h ?? 0) < -0.5;
  const breadthOn = greenRatio >= 0.6;
  const breadthOff = greenRatio <= 0.4;

  if (breadthOn && !cryptoDown) {
    return { tone: 'risk_on', label: 'Risk-on conditions', note: 'Broad participation is positive across sampled markets.' };
  }
  if (breadthOff && !cryptoUp) {
    return { tone: 'risk_off', label: 'Risk-off conditions', note: 'Breadth is skewed negative across sampled markets.' };
  }
  return { tone: 'mixed', label: 'Mixed conditions', note: 'Cross-market signals are currently conflicting.' };
}

/* ── Crypto participation (light — full leverage state arrives in Stage 6) ── */

export interface FlowInterpretation {
  label: string;
  stance: AnalyticalStance;
  note: string;
}

export function interpretCryptoParticipation(c: CryptoOverviewLike | null): FlowInterpretation {
  if (!c || typeof c.marketCapChange24h !== 'number') {
    return { label: 'Crypto participation unavailable', stance: 'unknown', note: 'Insufficient crypto market data.' };
  }
  const chg = c.marketCapChange24h;
  const dom = typeof c.btcDominance === 'number' ? c.btcDominance : null;
  const domNote = dom != null
    ? ` BTC dominance ${dom.toFixed(1)}% — ${dom >= 55 ? 'capital concentrated in majors' : dom <= 45 ? 'capital broadening into alternatives' : 'balanced between majors and alternatives'}.`
    : '';
  if (chg > 1.5) return { label: 'Expanding participation', stance: 'bullish', note: `Total crypto market cap +${chg.toFixed(1)}% (24h).${domNote}` };
  if (chg < -1.5) return { label: 'Contracting participation', stance: 'bearish', note: `Total crypto market cap ${chg.toFixed(1)}% (24h).${domNote}` };
  return { label: 'Stable participation', stance: 'neutral', note: `Total crypto market cap ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% (24h).${domNote}` };
}

/* ── Event / risk clock ── */

export interface EventClockItem {
  event: string;
  when: string;
  importance: 'high' | 'medium' | 'low';
  market: string;
}

function normalizeImpact(impact?: string): 'high' | 'medium' | 'low' {
  const i = (impact ?? '').toLowerCase();
  if (i.includes('high') || i === '3') return 'high';
  if (i.includes('med') || i === '2') return 'medium';
  return 'low';
}

export function summarizeEventClock(events: EventLike[], limit = 5): EventClockItem[] {
  return events.slice(0, limit).map((e) => ({
    event: e.event,
    when: [e.date, e.time].filter(Boolean).join(' ').trim() || 'Scheduled',
    importance: normalizeImpact(e.impact),
    market: e.country || e.category || '—',
  }));
}
