/**
 * Crypto leverage / participation state (Stage 6).
 *
 * Fuses price, open interest, funding and liquidation data into ONE
 * interpretable, educational state rather than forcing the user to read five
 * independent numbers. States describe observable market structure (e.g.
 * leverage building, crowded positioning, short-covering) — they are not
 * predictions and never imply a guaranteed outcome.
 *
 * Pure and dependency-light (imports types only) for easy testing/reuse.
 */

import type { FreshnessLevel } from './terminology';
import { assessEvidenceQuality, type EvidenceQualityResult } from './evidenceQuality';
import type { VolatilityState } from './buildingEngine';

export type LeverageState =
  | 'HEALTHY_TREND_PARTICIPATION'
  | 'LEVERAGE_BUILDING'
  | 'CROWDED_LONG'
  | 'CROWDED_SHORT'
  | 'SHORT_COVERING'
  | 'LONG_LIQUIDATION'
  | 'DELEVERAGING'
  | 'COMPRESSION'
  | 'EXPANSION'
  | 'MIXED';

export interface LeverageStateInput {
  /** 24h price change (%). */
  priceChangePct?: number;
  /** 24h open-interest change (%). */
  openInterestChangePct?: number;
  /** Current funding rate (%), e.g. 0.01 = 0.01%. */
  fundingRate?: number;
  /** Long liquidations over the window (USD). */
  longLiquidations?: number;
  /** Short liquidations over the window (USD). */
  shortLiquidations?: number;
  /** Volatility phase, if available. */
  volatilityState?: VolatilityState;
  freshness?: FreshnessLevel;
}

export interface LeverageAssessment {
  state: LeverageState;
  label: string;
  interpretation: string;
  /** The observed drivers behind the classification. */
  signals: string[];
  evidence: EvidenceQualityResult;
}

const STATE_LABEL: Record<LeverageState, string> = {
  HEALTHY_TREND_PARTICIPATION: 'Healthy trend participation',
  LEVERAGE_BUILDING: 'Leverage building',
  CROWDED_LONG: 'Crowded long positioning',
  CROWDED_SHORT: 'Crowded short positioning',
  SHORT_COVERING: 'Short-covering conditions',
  LONG_LIQUIDATION: 'Long-liquidation conditions',
  DELEVERAGING: 'Deleveraging',
  COMPRESSION: 'Volatility compression',
  EXPANSION: 'Volatility expansion',
  MIXED: 'Mixed / unclear conditions',
};

const STATE_INTERPRETATION: Record<LeverageState, string> = {
  HEALTHY_TREND_PARTICIPATION: 'Price and open interest are advancing together with funding near balanced levels — consistent with participation-supported movement rather than crowded leverage.',
  LEVERAGE_BUILDING: 'Open interest is rising alongside price, indicating new positioning is being added. This can precede larger moves but also raises the risk of a sharp unwind.',
  CROWDED_LONG: 'Rising price, rising open interest and elevated positive funding are consistent with crowded long positioning. Crowded conditions can be associated with squeeze risk, though timing is unknowable.',
  CROWDED_SHORT: 'Falling price, rising open interest and negative funding are consistent with crowded short positioning, which can be associated with short-squeeze potential.',
  SHORT_COVERING: 'Price is advancing while open interest declines (or short liquidations dominate) — consistent with short-covering or position-closing rather than fresh directional leverage.',
  LONG_LIQUIDATION: 'Long liquidations dominate — leveraged longs are being forced out. This is consistent with a deleveraging flush rather than orderly distribution.',
  DELEVERAGING: 'Price and open interest are declining together — positioning is being reduced across the board.',
  COMPRESSION: 'Volatility is compressed with limited positioning change — a quiet phase that can precede expansion.',
  EXPANSION: 'Volatility is expanding — positioning and price are moving more energetically.',
  MIXED: 'The available derivatives signals do not currently point to a single coherent structure.',
};

// Thresholds (documented, deliberately conservative).
const PRICE_UP = 0.5;
const PRICE_DOWN = -0.5;
const OI_UP = 2;
const OI_DOWN = -2;
const FUNDING_ELEVATED = 0.03;
const FUNDING_HIGH = 0.05;
const FUNDING_LOW = -0.05;

function availableFactors(i: LeverageStateInput): number {
  let n = 0;
  if (typeof i.priceChangePct === 'number') n++;
  if (typeof i.openInterestChangePct === 'number') n++;
  if (typeof i.fundingRate === 'number') n++;
  if (typeof i.longLiquidations === 'number' || typeof i.shortLiquidations === 'number') n++;
  if (i.volatilityState && i.volatilityState !== 'unknown') n++;
  return n;
}

export function classifyLeverageState(input: LeverageStateInput): LeverageAssessment {
  const price = input.priceChangePct;
  const oi = input.openInterestChangePct;
  const funding = input.fundingRate;
  const longLiq = input.longLiquidations ?? 0;
  const shortLiq = input.shortLiquidations ?? 0;

  const priceUp = typeof price === 'number' && price >= PRICE_UP;
  const priceDown = typeof price === 'number' && price <= PRICE_DOWN;
  const oiUp = typeof oi === 'number' && oi >= OI_UP;
  const oiDown = typeof oi === 'number' && oi <= OI_DOWN;
  const fundingHigh = typeof funding === 'number' && funding >= FUNDING_HIGH;
  const fundingElevated = typeof funding === 'number' && funding >= FUNDING_ELEVATED;
  const fundingLow = typeof funding === 'number' && funding <= FUNDING_LOW;
  const liqLongSkew = longLiq > 0 && longLiq >= shortLiq * 2;
  const liqShortSkew = shortLiq > 0 && shortLiq >= longLiq * 2;

  const signals: string[] = [];
  if (typeof price === 'number') signals.push(`Price ${price >= 0 ? '+' : ''}${price.toFixed(1)}%`);
  if (typeof oi === 'number') signals.push(`Open interest ${oi >= 0 ? '+' : ''}${oi.toFixed(1)}%`);
  if (typeof funding === 'number') signals.push(`Funding ${funding >= 0 ? '+' : ''}${funding.toFixed(3)}%`);
  if (longLiq || shortLiq) signals.push(`Liquidations L/S ${Math.round(longLiq)}/${Math.round(shortLiq)}`);
  if (input.volatilityState && input.volatilityState !== 'unknown') signals.push(`Volatility ${input.volatilityState}`);

  let state: LeverageState;
  if (liqLongSkew) {
    state = 'LONG_LIQUIDATION';
  } else if (liqShortSkew) {
    state = 'SHORT_COVERING';
  } else if (priceUp && oiUp && fundingHigh) {
    state = 'CROWDED_LONG';
  } else if (priceDown && oiUp && fundingLow) {
    state = 'CROWDED_SHORT';
  } else if (priceUp && oiUp) {
    state = fundingElevated ? 'LEVERAGE_BUILDING' : 'HEALTHY_TREND_PARTICIPATION';
  } else if (priceUp && oiDown) {
    state = 'SHORT_COVERING';
  } else if (priceDown && oiDown) {
    state = 'DELEVERAGING';
  } else if (priceDown && oiUp) {
    state = 'CROWDED_SHORT';
  } else if (priceUp && fundingHigh) {
    // OI unavailable/flat — funding + price still evidence crowded longs.
    state = 'CROWDED_LONG';
  } else if (priceDown && fundingLow) {
    state = 'CROWDED_SHORT';
  } else if (fundingHigh) {
    state = 'CROWDED_LONG';
  } else if (fundingLow) {
    state = 'CROWDED_SHORT';
  } else if (input.volatilityState === 'compression' || input.volatilityState === 'emerging') {
    state = 'COMPRESSION';
  } else if (input.volatilityState === 'expansion' || input.volatilityState === 'climax') {
    state = 'EXPANSION';
  } else {
    state = 'MIXED';
  }

  const evidence = assessEvidenceQuality({
    availableFactors: availableFactors(input),
    totalFactors: 5,
    freshness: input.freshness ?? 'unknown',
  });

  return {
    state,
    label: STATE_LABEL[state],
    interpretation: STATE_INTERPRETATION[state],
    signals,
    evidence,
  };
}
