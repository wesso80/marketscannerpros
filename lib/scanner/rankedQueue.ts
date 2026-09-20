/**
 * Canonical research queue — ONE ranking used by Scanner (ranked mode) and Command Center.
 *
 * Source: POST /api/scanner/run (equity + crypto) → MSP composite score, regime-gated → sorted desc.
 * Anything that calls itself a "research queue" in the customer UI must derive from this module.
 */
import type { ScanResult } from '@/app/v2/_lib/api';
import { REGIME_WEIGHTS } from '@/app/v2/_lib/constants';
import type { LifecycleState, RegimePriority } from '@/app/v2/_lib/types';

export const REGIME_SETUP_MAP: Record<string, string[]> = {
  trend: ['breakout', 'trend_continuation', 'pullback', 'expansion_continuation'],
  range: ['mean_reversion', 'range_fade', 'liquidity_sweep'],
  compression: ['volatility_expansion', 'squeeze', 'gamma_trap', 'compression_release'],
  transition: ['breakout', 'gamma_squeeze', 'volatility_expansion', 'compression_release'],
  expansion: ['breakout', 'trend_continuation', 'gamma_squeeze', 'expansion_continuation'],
  risk_off: ['mean_reversion', 'hedge', 'range_fade'],
  risk_on: ['breakout', 'trend_continuation', 'pullback', 'expansion_continuation'],
};

export function normalizeRegimeKey(regime?: string | null): RegimePriority {
  const value = String(regime || '').toLowerCase();
  if (value.includes('risk_off') || value.includes('risk-off') || value.includes('defensive')) return 'risk_off';
  if (value.includes('risk_on') || value.includes('risk-on')) return 'risk_on';
  if (value.includes('compress') || value.includes('squeeze')) return 'compression';
  if (value.includes('transition') || value.includes('neutral')) return value.includes('range') ? 'range' : 'transition';
  if (value.includes('expand')) return 'expansion';
  if (value.includes('range')) return 'range';
  if (value.includes('trend')) return 'trend';
  return 'trend';
}

export function setupTypeForRegime(r: ScanResult): string {
  const dveSignal = r.dveSignalType && r.dveSignalType !== 'none' ? r.dveSignalType : '';
  const setup = String(r.setup || '').replace(/^Local demo:\s*/i, '');
  return String(dveSignal || setup).toLowerCase().replace(/\s+/g, '_');
}

export function isRegimeCompatibleForRegime(r: ScanResult, regime: string): boolean {
  const regimeKey = normalizeRegimeKey(regime);
  const setupType = setupTypeForRegime(r);
  const compatible = REGIME_SETUP_MAP[regimeKey] || [];
  if (!setupType || setupType === 'none') {
    if (regimeKey === 'risk_off') return r.direction === 'bearish';
    if (regimeKey === 'risk_on' || regimeKey === 'trend' || regimeKey === 'expansion') return r.direction === 'bullish';
    return true;
  }
  return compatible.some((c) => setupType.includes(c));
}

/** Regime-weighted MSP score (0–100). Composite v2 from the route when present; legacy blend otherwise. */
export function computeMspScore(r: ScanResult, regime: string): number {
  if (r.compositeV2 && Number.isFinite(r.compositeV2.composite)) {
    const base = Math.min(100, Math.max(0, r.compositeV2.composite));
    if (r.scoreV2?.regimeScore?.gated) return Math.round(Math.max(0, base * 0.4));
    return Math.round(base);
  }
  const regimeKey = normalizeRegimeKey(regime);
  const w = REGIME_WEIGHTS[regimeKey] || REGIME_WEIGHTS.trend;
  const structure = Math.min(100, Math.max(0, r.score ?? 0));
  const momentum = Math.min(100, Math.max(0, r.confidence ?? (Math.abs(r.score ?? 0) * 8)));
  const volatility = r.dveBbwp != null
    ? (r.dveBbwp < 20 ? 80 + (20 - r.dveBbwp) : r.dveBbwp > 80 ? 70 + (r.dveBbwp - 80) : 30 + r.dveBbwp * 0.3)
    : 40;
  const options = r.derivatives ? Math.min(100, 50 + Math.abs(r.derivatives.fundingRate ?? 0) * 500) : 30;
  const time = r.scoreV2?.acl?.confidence ?? 50;
  const raw = (structure * w.structure + momentum * w.momentum + volatility * w.volatility + options * w.options + time * w.time) / 100;
  if (r.scoreV2?.regimeScore?.gated) return Math.round(Math.max(0, raw * 0.4));
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function deriveLifecycleState(r: ScanResult, regime: string): LifecycleState {
  const msp = computeMspScore(r, regime);
  const conf = r.confidence ?? 0;
  if (r.scoreV2?.regimeScore?.gated) return 'INVALIDATED';
  if (msp >= 75 && conf >= 65) return 'READY';
  if (msp >= 55 && conf >= 45) return 'SETTING_UP';
  if (msp >= 35) return 'WATCHING';
  return 'DISCOVERED';
}

export type RankedAssetClass = 'equity' | 'crypto';
export type RankedResult = ScanResult & { _assetClass: RankedAssetClass };

export interface RankedQueueRow {
  symbol: string;
  assetClass: RankedAssetClass;
  mspScore: number;
  direction: string;
  price: number | null;
  /** Last-bar % change (bar = the interval the row was scanned on). Null when unavailable — never a fabricated 0. */
  changePct: number | null;
  adx: number | null;
  rsi: number | null;
  lifecycle: LifecycleState;
  confidence: number | null;
  setup: string | null;
}

/** Tag results with their asset class exactly as Scanner does. */
export function mergeScanResults(equity: ScanResult[] | undefined, crypto: ScanResult[] | undefined): RankedResult[] {
  const eq = (equity || []).map((r) => ({ ...r, _assetClass: 'equity' as const }));
  const cr = (crypto || []).map((r) => ({ ...r, _assetClass: 'crypto' as const }));
  return [...eq, ...cr];
}

/** Explicit change field when the API provides one; otherwise the last-bar close-to-close change from chartData; else null. */
function lastBarChangePct(r: RankedResult): number | null {
  const explicit = (r as any).changePct ?? (r as any).changePercent;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const candles = (r as any).chartData?.candles as Array<{ c: number }> | undefined;
  if (Array.isArray(candles) && candles.length >= 2) {
    const last = Number(candles[candles.length - 1]?.c);
    const prev = Number(candles[candles.length - 2]?.c);
    if (Number.isFinite(last) && Number.isFinite(prev) && prev > 0) return ((last - prev) / prev) * 100;
  }
  return null;
}

/** Scanner's default ranked view: all results, sorted by MSP score desc. Deterministic tiebreak on symbol. */
export function buildRankedQueue(results: RankedResult[], regime: string): RankedQueueRow[] {
  return results
    .filter((r) => r && typeof r.symbol === 'string' && r.symbol.trim().length > 0)
    .map((r) => ({
      symbol: r.symbol,
      assetClass: r._assetClass,
      mspScore: computeMspScore(r, regime),
      direction: r.direction ?? 'neutral',
      price: typeof r.price === 'number' ? r.price : null,
      changePct: lastBarChangePct(r),
      adx: typeof r.adx === 'number' && Number.isFinite(r.adx) ? r.adx : null,
      rsi: typeof r.rsi === 'number' && Number.isFinite(r.rsi) ? r.rsi : null,
      lifecycle: deriveLifecycleState(r, regime),
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
      setup: r.setup ?? null,
    }))
    .sort((a, b) => b.mspScore - a.mspScore || a.symbol.localeCompare(b.symbol));
}
