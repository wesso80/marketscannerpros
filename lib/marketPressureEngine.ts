/**
 * Market Pressure Engine (MPE)
 *
 * Unifies four orthogonal pressure dimensions into a single composite
 * reading per symbol: Time, Volatility, Liquidity, Options.
 *
 * MPE ≥ 75  → High pressure — volatility expansion likely, full sizing
 * MPE 50–74 → Building pressure — watch for trigger, reduced sizing
 * MPE 25–49 → Low pressure — range-bound or dissipating, probe only
 * MPE < 25  → No pressure — no trade
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TimePressureInput {
  confluenceScore: number;           // 0-100 from time confluence engine
  activeTFCount: number;             // Number of TFs closing/in-window
  decompressionActiveCount: number;  // TFs in decompression window
  midpointDebtCount: number;         // Unfilled 50% levels
  hotZoneActive: boolean;            // ≥3 concurrent closes
}

export interface VolatilityPressureInput {
  regimeState: string;               // TREND_UP | TREND_DOWN | RANGE_NEUTRAL | VOL_EXPANSION | VOL_CONTRACTION | RISK_OFF_STRESS
  regimeConfidence: number;          // 0-100
  atrPercent: number;                // Volatility as % of price
  adx: number;                       // Trend strength 0-100
  inSqueeze: boolean;                // Bollinger squeeze active
  squeezeStrength: number;           // 0-1 (1 = maximum squeeze)
  ivRank?: number;                   // 0-100 options IV rank
}

export interface LiquidityPressureInput {
  fundingRatePercent: number;        // e.g. 0.01 (%)
  fundingAnnualized: number;         // Annualized funding
  fundingSentiment: string;          // Bullish | Bearish | Neutral
  oiTotalUsd: number;               // Total open interest in USD
  oi24hChangePct: number;            // OI % change last 24h
  oiSignal: string;                  // longs_building | shorts_building | deleveraging | neutral
  longShortRatio: number;            // ~1.0 balanced, >1.2 long-heavy
  gammaState: string;                // Positive | Negative | Mixed
  marketMode: string;                // pin | launch | chop
}

export interface OptionsPressureInput {
  gexRegime: string;                 // LONG_GAMMA | SHORT_GAMMA | NEUTRAL
  netGexUsd: number;                 // Net dealer gamma USD
  gammaFlipPrice?: number;           // Price where hedging flips
  gammaFlipDistancePct?: number;     // % distance to flip
  putCallRatio: number;              // OI P/C ratio
  maxPainStrike?: number;            // Max pain price level
  unusualActivityDetected: boolean;  // Smart money signal
  smartMoneyBias: string;            // bullish | bearish | neutral | mixed
  ivRank?: number;                   // 0-100 IV rank
}

export interface PressureComponent {
  score: number;        // 0-100
  weight: number;       // 0-1
  components: string[]; // Human-readable breakdown
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface MarketPressureReading {
  symbol: string;
  timestamp: number;
  assetClass: 'equity' | 'crypto';
  pressures: {
    time: PressureComponent;
    volatility: PressureComponent;
    liquidity: PressureComponent;
    options: PressureComponent;
  };
  composite: number;                  // 0-100 weighted sum
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  regime: string;
  alignment: number;                  // 0-1 (how aligned all 4 dims are)
  label: 'HIGH_PRESSURE' | 'BUILDING' | 'LOW_PRESSURE' | 'NO_PRESSURE';
  summary: string;
}

export interface MarketPressureInput {
  symbol: string;
  assetClass: 'equity' | 'crypto';
  time?: Partial<TimePressureInput>;
  volatility?: Partial<VolatilityPressureInput>;
  liquidity?: Partial<LiquidityPressureInput>;
  options?: Partial<OptionsPressureInput>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTS — crypto has heavier liquidity, equity has heavier options
// ═══════════════════════════════════════════════════════════════════════════

const WEIGHTS = {
  crypto: { time: 0.25, volatility: 0.25, liquidity: 0.30, options: 0.20 },
  equity: { time: 0.20, volatility: 0.25, liquidity: 0.20, options: 0.35 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// PRESSURE SCORERS
// ═══════════════════════════════════════════════════════════════════════════

function scoreTimePressure(t: Partial<TimePressureInput>): PressureComponent {
  let score = 0;
  const components: string[] = [];

  const conf = t.confluenceScore ?? 0;
  if (conf > 0) {
    score += Math.min(40, conf * 0.4);
    components.push(`Confluence ${Math.round(conf)}`);
  }

  const tfCount = t.activeTFCount ?? 0;
  if (tfCount >= 5) { score += 25; components.push(`${tfCount} TFs active (high)`); }
  else if (tfCount >= 3) { score += 15; components.push(`${tfCount} TFs active`); }
  else if (tfCount >= 1) { score += 5; components.push(`${tfCount} TF active`); }

  const decompCount = t.decompressionActiveCount ?? 0;
  if (decompCount >= 3) { score += 20; components.push(`${decompCount} decompressing`); }
  else if (decompCount >= 1) { score += 10; components.push(`${decompCount} decompressing`); }

  const debt = t.midpointDebtCount ?? 0;
  if (debt >= 5) { score += 10; components.push(`${debt} midpoint debt`); }
  else if (debt >= 2) { score += 5; components.push(`${debt} midpoint debt`); }

  if (t.hotZoneActive) { score += 5; components.push('Hot zone active'); }

  score = Math.min(100, score);
  return { score, weight: 0, components, direction: 'neutral' };
}

function scoreVolatilityPressure(v: Partial<VolatilityPressureInput>): PressureComponent {
  let score = 0;
  const components: string[] = [];
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  // Regime scoring
  const regime = v.regimeState ?? '';
  const regimeConf = (v.regimeConfidence ?? 50) / 100;
  switch (regime) {
    case 'VOL_EXPANSION':   score += 30 * regimeConf; components.push('Vol expanding'); break;
    case 'VOL_CONTRACTION': score += 25 * regimeConf; components.push('Vol compressing (coiled)'); break;
    case 'TREND_UP':        score += 20 * regimeConf; direction = 'bullish'; components.push('Trending up'); break;
    case 'TREND_DOWN':      score += 20 * regimeConf; direction = 'bearish'; components.push('Trending down'); break;
    case 'RISK_OFF_STRESS': score += 15 * regimeConf; direction = 'bearish'; components.push('Risk-off'); break;
    case 'RANGE_NEUTRAL':   score += 5 * regimeConf; components.push('Ranging'); break;
  }

  // ADX trending
  const adx = v.adx ?? 0;
  if (adx >= 40) { score += 20; components.push(`ADX ${Math.round(adx)} (strong trend)`); }
  else if (adx >= 25) { score += 12; components.push(`ADX ${Math.round(adx)} (trending)`); }
  else if (adx < 15) { score += 5; components.push(`ADX ${Math.round(adx)} (flat)`); }

  // Squeeze = stored energy
  if (v.inSqueeze) {
    const str = v.squeezeStrength ?? 0.5;
    score += 10 + Math.round(str * 15);
    components.push(`Squeeze (${Math.round(str * 100)}% strength)`);
  }

  // ATR % — high ATR = volatility
  const atrPct = v.atrPercent ?? 0;
  if (atrPct > 5) { score += 10; components.push(`ATR ${atrPct.toFixed(1)}% (elevated)`); }
  else if (atrPct > 3) { score += 5; components.push(`ATR ${atrPct.toFixed(1)}%`); }

  // IV rank if available
  if (v.ivRank != null) {
    if (v.ivRank >= 70) { score += 10; components.push(`IV rank ${v.ivRank} (high)`); }
    else if (v.ivRank <= 20) { score += 8; components.push(`IV rank ${v.ivRank} (low = coiled)`); }
  }

  score = Math.min(100, score);
  return { score, weight: 0, components, direction };
}

function scoreLiquidityPressure(l: Partial<LiquidityPressureInput>): PressureComponent {
  let score = 0;
  const components: string[] = [];
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  // Funding rate (crypto only)
  const fr = l.fundingRatePercent ?? 0;
  if (Math.abs(fr) > 0.05) {
    score += 20;
    direction = fr > 0 ? 'bullish' : 'bearish';
    components.push(`Funding ${fr > 0 ? '+' : ''}${fr.toFixed(3)}% (extreme)`);
  } else if (Math.abs(fr) > 0.02) {
    score += 12;
    direction = fr > 0 ? 'bullish' : 'bearish';
    components.push(`Funding ${fr > 0 ? '+' : ''}${fr.toFixed(3)}%`);
  } else if (Math.abs(fr) > 0.005) {
    score += 5;
    components.push(`Funding ${fr > 0 ? '+' : ''}${fr.toFixed(3)}%`);
  }

  // OI change
  const oiChg = l.oi24hChangePct ?? 0;
  if (Math.abs(oiChg) > 10) {
    score += 20;
    components.push(`OI ${oiChg > 0 ? '+' : ''}${oiChg.toFixed(1)}% 24h (large shift)`);
  } else if (Math.abs(oiChg) > 5) {
    score += 12;
    components.push(`OI ${oiChg > 0 ? '+' : ''}${oiChg.toFixed(1)}% 24h`);
  } else if (Math.abs(oiChg) > 2) {
    score += 5;
    components.push(`OI ${oiChg > 0 ? '+' : ''}${oiChg.toFixed(1)}% 24h`);
  }

  // OI signal
  const sig = l.oiSignal ?? 'neutral';
  if (sig === 'longs_building') { score += 10; direction = 'bullish'; components.push('Longs building'); }
  else if (sig === 'shorts_building') { score += 10; direction = 'bearish'; components.push('Shorts building'); }
  else if (sig === 'deleveraging') { score += 8; components.push('Deleveraging'); }

  // L/S ratio skew
  const lsr = l.longShortRatio ?? 1.0;
  if (lsr > 1.3) { score += 10; direction = 'bullish'; components.push(`L/S ${lsr.toFixed(2)} (long-heavy)`); }
  else if (lsr < 0.7) { score += 10; direction = 'bearish'; components.push(`L/S ${lsr.toFixed(2)} (short-heavy)`); }

  // Market mode from capital flow
  const mode = l.marketMode ?? '';
  if (mode === 'launch') { score += 15; components.push('Launch mode (trending)'); }
  else if (mode === 'pin') { score += 5; components.push('Pin mode (range)'); }
  else if (mode === 'chop') { score += 3; components.push('Chop mode'); }

  // Gamma state
  const gs = l.gammaState ?? '';
  if (gs === 'Negative') { score += 10; components.push('Negative gamma (volatile)'); }
  else if (gs === 'Positive') { score += 5; components.push('Positive gamma (dampened)'); }

  score = Math.min(100, score);
  return { score, weight: 0, components, direction };
}

function scoreOptionsPressure(o: Partial<OptionsPressureInput>): PressureComponent {
  let score = 0;
  const components: string[] = [];
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  // GEX regime
  const gex = o.gexRegime ?? 'NEUTRAL';
  if (gex === 'SHORT_GAMMA') {
    score += 25;
    components.push('Short gamma (amplified moves)');
  } else if (gex === 'LONG_GAMMA') {
    score += 10;
    components.push('Long gamma (dampened moves)');
  }

  // Gamma flip proximity
  const flipDist = o.gammaFlipDistancePct ?? null;
  if (flipDist != null && Math.abs(flipDist) < 1) {
    score += 20;
    components.push(`Near gamma flip (${flipDist.toFixed(1)}%)`);
  } else if (flipDist != null && Math.abs(flipDist) < 3) {
    score += 10;
    components.push(`Gamma flip ${flipDist.toFixed(1)}% away`);
  }

  // P/C ratio
  const pcr = o.putCallRatio ?? 1.0;
  if (pcr > 1.5) {
    score += 15; direction = 'bearish';
    components.push(`P/C ${pcr.toFixed(2)} (high put demand)`);
  } else if (pcr > 1.2) {
    score += 8; direction = 'bearish';
    components.push(`P/C ${pcr.toFixed(2)} (put bias)`);
  } else if (pcr < 0.6) {
    score += 15; direction = 'bullish';
    components.push(`P/C ${pcr.toFixed(2)} (high call demand)`);
  } else if (pcr < 0.8) {
    score += 8; direction = 'bullish';
    components.push(`P/C ${pcr.toFixed(2)} (call bias)`);
  }

  // Unusual activity
  if (o.unusualActivityDetected) {
    score += 15;
    const bias = o.smartMoneyBias ?? 'neutral';
    if (bias === 'bullish') direction = 'bullish';
    else if (bias === 'bearish') direction = 'bearish';
    components.push(`Unusual activity (${bias})`);
  }

  // IV rank
  if (o.ivRank != null) {
    if (o.ivRank >= 80) { score += 10; components.push(`IV rank ${o.ivRank} (premium)`); }
    else if (o.ivRank <= 15) { score += 8; components.push(`IV rank ${o.ivRank} (quiet → coiled)`); }
  }

  score = Math.min(100, score);
  return { score, weight: 0, components, direction };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function resolveDirection(
  pressures: MarketPressureReading['pressures'],
  weights: { time: number; volatility: number; liquidity: number; options: number }
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  const dirMap = { bullish: 1, bearish: -1, neutral: 0 } as const;
  let weighted = 0;
  for (const [key, p] of Object.entries(pressures) as [keyof typeof weights, PressureComponent][]) {
    weighted += dirMap[p.direction] * p.score * weights[key];
  }
  if (weighted > 10) return 'LONG';
  if (weighted < -10) return 'SHORT';
  return 'NEUTRAL';
}

function computeAlignment(pressures: MarketPressureReading['pressures']): number {
  const dirs = Object.values(pressures).map(p => p.direction);
  const nonNeutral = dirs.filter(d => d !== 'neutral');
  if (nonNeutral.length === 0) return 0;
  const bullCount = nonNeutral.filter(d => d === 'bullish').length;
  const bearCount = nonNeutral.filter(d => d === 'bearish').length;
  const dominant = Math.max(bullCount, bearCount);
  return dominant / nonNeutral.length;
}

function getLabel(composite: number): MarketPressureReading['label'] {
  if (composite >= 75) return 'HIGH_PRESSURE';
  if (composite >= 50) return 'BUILDING';
  if (composite >= 25) return 'LOW_PRESSURE';
  return 'NO_PRESSURE';
}

function buildSummary(reading: MarketPressureReading): string {
  const parts: string[] = [];
  const { pressures, composite, direction, label } = reading;

  parts.push(`MPE ${Math.round(composite)}/100 — ${label.replace('_', ' ')}`);
  if (direction !== 'NEUTRAL') parts.push(`Direction: ${direction}`);

  // Top pressure contributor
  const sorted = Object.entries(pressures)
    .map(([k, v]) => ({ name: k, weighted: v.score * v.weight }))
    .sort((a, b) => b.weighted - a.weighted);

  if (sorted[0] && sorted[0].weighted > 0) {
    parts.push(`Strongest: ${sorted[0].name} (${Math.round(pressures[sorted[0].name as keyof typeof pressures].score)})`);
  }

  return parts.join(' • ');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export function computeMarketPressure(input: MarketPressureInput): MarketPressureReading {
  const w = WEIGHTS[input.assetClass];

  const time = scoreTimePressure(input.time ?? {});
  time.weight = w.time;

  const volatility = scoreVolatilityPressure(input.volatility ?? {});
  volatility.weight = w.volatility;

  const liquidity = scoreLiquidityPressure(input.liquidity ?? {});
  liquidity.weight = w.liquidity;

  const options = scoreOptionsPressure(input.options ?? {});
  options.weight = w.options;

  const pressures = { time, volatility, liquidity, options };

  const composite = Math.min(100, Math.round(
    time.score * w.time +
    volatility.score * w.volatility +
    liquidity.score * w.liquidity +
    options.score * w.options
  ));

  const direction = resolveDirection(pressures, w);
  const alignment = computeAlignment(pressures);
  const label = getLabel(composite);

  const reading: MarketPressureReading = {
    symbol: input.symbol,
    timestamp: Date.now(),
    assetClass: input.assetClass,
    pressures,
    composite,
    direction,
    regime: (input.volatility?.regimeState ?? 'UNKNOWN'),
    alignment,
    label,
    summary: '',
  };

  reading.summary = buildSummary(reading);
  return reading;
}
