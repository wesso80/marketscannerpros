/**
 * Indicator semantics shared by Golden Egg and Deep Analyst.
 *  - ADX is trend STRENGTH, never direction.
 *  - RSI/stochastic extremes are momentum AND extension risk at the same time.
 *  - DVE signal strength is a 0–100 score.
 *  - Setup type must not say "mean reversion" while the trend read says ADX confirms a trend.
 */

export type IndicatorState = 'bull' | 'bear' | 'neutral' | 'strength' | 'extended';

export function adxStrength(adx: number | null | undefined): { label: string; state: IndicatorState; strong: boolean } {
  if (adx == null || !Number.isFinite(adx)) return { label: 'n/a', state: 'neutral', strong: false };
  if (adx >= 40) return { label: `${adx.toFixed(0)} · very strong trend`, state: 'strength', strong: true };
  if (adx >= 25) return { label: `${adx.toFixed(0)} · trending`, state: 'strength', strong: true };
  if (adx >= 18) return { label: `${adx.toFixed(0)} · developing`, state: 'neutral', strong: false };
  return { label: `${adx.toFixed(0)} · weak / ranging`, state: 'neutral', strong: false };
}

export function rsiRead(rsi: number | null | undefined): { label: string; state: IndicatorState; extended: boolean; momentum: 'bullish' | 'bearish' | 'neutral' } {
  if (rsi == null || !Number.isFinite(rsi)) return { label: 'n/a', state: 'neutral', extended: false, momentum: 'neutral' };
  if (rsi >= 80) return { label: `${rsi.toFixed(1)} · strong momentum, extension risk high`, state: 'extended', extended: true, momentum: 'bullish' };
  if (rsi >= 70) return { label: `${rsi.toFixed(1)} · strong momentum, overbought`, state: 'extended', extended: true, momentum: 'bullish' };
  if (rsi > 55) return { label: `${rsi.toFixed(1)} · bullish momentum`, state: 'bull', extended: false, momentum: 'bullish' };
  if (rsi >= 45) return { label: `${rsi.toFixed(1)} · neutral`, state: 'neutral', extended: false, momentum: 'neutral' };
  if (rsi > 30) return { label: `${rsi.toFixed(1)} · bearish momentum`, state: 'bear', extended: false, momentum: 'bearish' };
  if (rsi > 20) return { label: `${rsi.toFixed(1)} · bearish momentum, oversold`, state: 'extended', extended: true, momentum: 'bearish' };
  return { label: `${rsi.toFixed(1)} · washed out, extension risk high`, state: 'extended', extended: true, momentum: 'bearish' };
}

export function stochasticRead(k: number | null | undefined): { label: string; state: IndicatorState; extended: boolean } {
  if (k == null || !Number.isFinite(k)) return { label: 'n/a', state: 'neutral', extended: false };
  if (k >= 80) return { label: `${k.toFixed(0)} · overbought zone`, state: 'extended', extended: true };
  if (k <= 20) return { label: `${k.toFixed(0)} · oversold zone`, state: 'extended', extended: true };
  return { label: `${k.toFixed(0)}`, state: 'neutral', extended: false };
}

/** DVE `signal.strength` is 0–100 (see computeSignalStrength). Never multiply by 100. */
export function dveStrengthLabel(strength: number | null | undefined): string {
  if (strength == null || !Number.isFinite(strength)) return 'n/a';
  const s = Math.max(0, Math.min(100, Math.round(strength)));
  return `${s}/100`;
}

export type SetupType = 'trend' | 'breakout' | 'mean_reversion' | 'reversal' | 'squeeze' | 'range';

export interface SetupInput {
  rsi: number | null;
  adx: number | null;
  bbWidthPct: number | null;
  changePct: number;
  atrPct: number;
  /** Setup direction; a breakout is only declared when the session move agrees with it. */
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
}

/**
 * Setup family. An overbought RSI inside a strong trend is an EXTENDED TREND, not mean reversion; mean reversion is
 * only declared when trend strength is absent.
 */
export function classifySetup(i: SetupInput): { setupType: SetupType; extended: boolean; note: string } {
  const strongTrend = i.adx != null && i.adx >= 25;
  const rsiExtreme = i.rsi != null && (i.rsi >= 70 || i.rsi <= 30);
  if (i.bbWidthPct != null && i.bbWidthPct < 6) return { setupType: 'squeeze', extended: false, note: `Bollinger width ${i.bbWidthPct.toFixed(1)}% — compression` };
  if (rsiExtreme && strongTrend) {
    return { setupType: 'trend', extended: true, note: `extended trend — RSI ${i.rsi!.toFixed(0)} with ADX ${i.adx!.toFixed(0)}; continuation with extension risk` };
  }
  if (rsiExtreme && !strongTrend) {
    return { setupType: 'mean_reversion', extended: true, note: `RSI ${i.rsi!.toFixed(0)} extreme without trend strength (ADX ${i.adx?.toFixed(0) ?? 'n/a'})` };
  }
  const moveAgrees = i.direction == null || i.direction === 'NEUTRAL' || (i.direction === 'LONG' ? i.changePct > 0 : i.changePct < 0);
  if (i.adx != null && i.adx > 30 && Math.abs(i.changePct) > 2 && moveAgrees) return { setupType: 'breakout', extended: false, note: `ADX ${i.adx.toFixed(0)} with a ${i.changePct > 0 ? '+' : ''}${i.changePct.toFixed(1)}% session move in the setup direction` };
  if (strongTrend) return { setupType: 'trend', extended: false, note: `ADX ${i.adx!.toFixed(0)} confirms trend strength` };
  if (i.atrPct < 1.5) return { setupType: 'range', extended: false, note: `low ATR (${i.atrPct.toFixed(1)}%) and no trend strength` };
  return { setupType: 'range', extended: false, note: `no trend strength (ADX ${i.adx?.toFixed(0) ?? 'n/a'})` };
}

export interface StructureInput {
  price: number;
  sma20: number | null;
  sma50: number | null;
  ema200: number | null;
  bbMiddle: number | null;
  adx: number | null;
  atr: number | null;
  /** Dollar volume per bar (price × avg volume); null when unknown. */
  advUsd: number | null;
  assetClass: 'equity' | 'crypto' | 'forex';
}

/**
 * Structure quality 0–100. Trend alignment earns points; extension beyond 2.5 ATR from the 20-bar mean, thin
 * liquidity and a missing long-term anchor cost points so a blow-off micro-cap cannot tie a clean large-cap trend.
 */
export function computeStructureQuality(s: StructureInput): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 50;
  const p = s.price;
  if (s.sma20 != null) score += p > s.sma20 ? 10 : -10;
  if (s.sma50 != null) score += p > s.sma50 ? 10 : -10;
  if (s.sma20 != null && s.sma50 != null) score += s.sma20 > s.sma50 ? 8 : -8;
  if (s.bbMiddle != null) score += p > s.bbMiddle ? 5 : -5;
  if (s.adx != null) score += s.adx > 25 ? 7 : -3;
  if (s.ema200 != null) {
    // Long-term anchor agreement (or disagreement) — only awarded when we actually have 200 bars.
    const above = p > s.ema200;
    const aboveShort = s.sma50 != null ? p > s.sma50 : above;
    if (above === aboveShort) { score += 5; notes.push(`EMA200 ${above ? 'below' : 'above'} price — long-term anchor agrees`); }
    else { score -= 8; notes.push('EMA200 disagrees with short-term structure'); }
  } else {
    notes.push('EMA200 unavailable — long-term anchor unknown');
  }
  if (s.atr != null && s.atr > 0 && s.sma20 != null) {
    const ext = Math.abs(p - s.sma20) / s.atr;
    if (ext > 4) { score -= 15; notes.push(`price ${ext.toFixed(1)} ATR from the 20-bar mean — blow-off extension`); }
    else if (ext > 2.5) { score -= 8; notes.push(`price ${ext.toFixed(1)} ATR from the 20-bar mean — extended`); }
  }
  if (s.assetClass !== 'forex' && s.advUsd != null) {
    if (s.advUsd < 5_000_000) { score -= 12; notes.push(`thin liquidity — avg dollar volume ${formatUsdShort(s.advUsd)}`); }
    else if (s.advUsd < 25_000_000) { score -= 5; notes.push(`modest liquidity — avg dollar volume ${formatUsdShort(s.advUsd)}`); }
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), notes };
}

export interface RiskInput {
  atrPct: number | null;
  /** Requested timeframe so ATR% is judged on a daily-equivalent basis. */
  barsPerDay: number;
  rsi: number | null;
  stochK: number | null;
  exhaustionRisk: number | null; // DVE 0–100
  trapDetected: boolean;
  advUsd: number | null;
  dataTrustLevel: 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT_DATA';
  fundingRatePercent: number | null; // per ~8h
  eventWithinDays: number | null; // e.g. earnings in N days
  stopDistanceAtr: number | null;
  assetClass: 'equity' | 'crypto' | 'forex';
}

/**
 * Risk QUALITY 0–100: how acceptable the risk conditions are for research (100 = clean). It is never a bullish
 * driver; the payload only uses it as a gate and reports its reasons.
 */
export function computeRiskQuality(r: RiskInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 75;
  if (r.atrPct != null) {
    const dailyEq = r.atrPct * Math.sqrt(Math.max(1, r.barsPerDay));
    const cryptoScale = r.assetClass === 'crypto' ? 1.6 : 1; // crypto baseline vol is structurally higher
    const hi = 6 * cryptoScale, mid = 4 * cryptoScale, lo = 1.5 * cryptoScale;
    if (dailyEq > hi) { score -= 20; reasons.push(`volatility high — daily-equivalent ATR ${dailyEq.toFixed(1)}%`); }
    else if (dailyEq > mid) { score -= 10; reasons.push(`volatility elevated — daily-equivalent ATR ${dailyEq.toFixed(1)}%`); }
    else if (dailyEq < lo) { score += 5; }
  }
  const rsiExt = r.rsi != null && (r.rsi >= 70 || r.rsi <= 30);
  const stochExt = r.stochK != null && (r.stochK >= 80 || r.stochK <= 20);
  if (rsiExt && stochExt) { score -= 15; reasons.push(`extension — RSI ${r.rsi!.toFixed(0)} and stochastic ${r.stochK!.toFixed(0)} both at extremes`); }
  else if (rsiExt || stochExt) { score -= 8; reasons.push('extension — momentum oscillator at an extreme'); }
  if (r.exhaustionRisk != null && r.exhaustionRisk >= 60) { score -= 12; reasons.push(`DVE exhaustion risk ${Math.round(r.exhaustionRisk)}/100`); }
  if (r.trapDetected) { score -= 10; reasons.push('DVE volatility trap detected'); }
  if (r.assetClass !== 'forex' && r.advUsd != null && r.advUsd < 5_000_000) { score -= 15; reasons.push(`thin liquidity — ${formatUsdShort(r.advUsd)} average dollar volume`); }
  if (r.dataTrustLevel === 'DEGRADED') { score -= 8; reasons.push('data trust degraded'); }
  if (r.dataTrustLevel === 'STALE' || r.dataTrustLevel === 'INSUFFICIENT_DATA') { score -= 25; reasons.push(`data trust ${r.dataTrustLevel.toLowerCase().replace('_', ' ')}`); }
  if (r.fundingRatePercent != null && Math.abs(r.fundingRatePercent) > 0.03) { score -= 10; reasons.push(`crowded positioning — funding ${r.fundingRatePercent > 0 ? '+' : ''}${r.fundingRatePercent.toFixed(4)}% per interval`); }
  if (r.eventWithinDays != null && r.eventWithinDays >= 0 && r.eventWithinDays <= 7) { score -= 12; reasons.push(`scheduled event risk in ${r.eventWithinDays} day${r.eventWithinDays === 1 ? '' : 's'}`); }
  if (r.stopDistanceAtr != null) {
    if (r.stopDistanceAtr < 0.8) { score -= 6; reasons.push(`invalidation only ${r.stopDistanceAtr.toFixed(1)} ATR away — noise risk`); }
    else if (r.stopDistanceAtr > 2.5) { score -= 6; reasons.push(`invalidation ${r.stopDistanceAtr.toFixed(1)} ATR away — wide stop`); }
  }
  if (reasons.length === 0) reasons.push('no material risk flags — volatility, extension and liquidity within normal ranges');
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function formatUsdShort(v: number): string {
  if (!Number.isFinite(v)) return 'n/a';
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
