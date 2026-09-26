/**
 * Cross-Asset Correlation Regime Engine
 *
 * Provides real-time correlation and regime context by tracking:
 *   1. BTC ↔ SPY correlation (risk-on/risk-off)
 *   2. VIX regime classification (LOW / NORMAL / ELEVATED / EXTREME)
 *   3. DXY trend (USD strength → headwind for risk assets)
 *   4. Sector rotation signals (growth → value, crypto → equities, etc.)
 *   5. Cross-asset divergence alerts
 *
 * Used by the risk governor and state machine to:
 *   - Block correlated trades during regime stress
 *   - Adjust position sizing based on correlation regime
 *   - Detect macro shifts early before they hit individual symbols
 */

export type CorrelationRegime =
  | 'RISK_ON'        // BTC+SPY rising, VIX low, correlations normal
  | 'RISK_OFF'       // BTC+SPY falling, VIX elevated, flight to safety
  | 'DIVERGENT'      // BTC and SPY moving opposite (unusual, often transitional)
  | 'DECORRELATED'   // BTC and SPY uncorrelated (crypto doing its own thing)
  | 'STRESS';        // VIX extreme, all correlations go to 1, everything drops

export type VIXRegime = 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME' | 'UNAVAILABLE';

export type SectorRotation = 'GROWTH_LEADING' | 'VALUE_LEADING' | 'DEFENSIVE' | 'MIXED' | 'UNAVAILABLE';

export interface AssetSnapshot {
  symbol: string;
  price: number;
  change24h: number; // percent
  timestamp: string;
}

export interface CorrelationRegimeInput {
  btc: AssetSnapshot;
  spy: AssetSnapshot;
  vix?: AssetSnapshot;
  dxy?: AssetSnapshot;
  gold?: AssetSnapshot;
  /** Rolling 20-day correlation between BTC and SPY returns. -1 to +1. Omit (or null) when unavailable — no default. */
  btcSpyCorrelation?: number | null;
  /** Extra sector ETFs for rotation detection */
  sectors?: {
    xlk?: AssetSnapshot; // Tech
    xlv?: AssetSnapshot; // Healthcare
    xle?: AssetSnapshot; // Energy
    xlf?: AssetSnapshot; // Financials
    xlu?: AssetSnapshot; // Utilities
  };
}

export interface CorrelationRegimeOutput {
  regime: CorrelationRegime;
  vixRegime: VIXRegime;
  sectorRotation: SectorRotation;
  /** null when the correlation input was unavailable. */
  btcSpyCorrelation: number | null;
  dxyTrend: 'strengthening' | 'weakening' | 'neutral' | 'unavailable';
  riskScore: number; // 0 (max risk-off) to 100 (max risk-on)
  sizeMultiplier: number; // 0.0 to 1.0 — scale position sizes
  warnings: string[];
  recommendation: string;
  /** Optional inputs that were missing (not scored, never replaced by a default): 'vix' | 'dxy' | 'gold' | 'btcSpyCorrelation' | 'sectors'. */
  unavailable: string[];
  components: {
    btcMomentum: number;
    spyMomentum: number;
    vixLevel: number | null;
    dxyLevel: number | null;
    goldSafeHaven: boolean | null;
  };
}

/**
 * Classify VIX level into regime buckets.
 */
function classifyVIX(vixPrice: number): VIXRegime {
  if (vixPrice <= 14) return 'LOW';
  if (vixPrice <= 20) return 'NORMAL';
  if (vixPrice <= 30) return 'ELEVATED';
  return 'EXTREME';
}

/**
 * Detect sector rotation pattern from relative performance.
 */
function detectSectorRotation(input: CorrelationRegimeInput): SectorRotation {
  const sectors = input.sectors;
  if (!sectors?.xlk || !sectors?.xlu || !sectors?.xlf) return 'UNAVAILABLE';

  const techChange = sectors.xlk.change24h;
  const utilitiesChange = sectors.xlu.change24h;
  const financialsChange = sectors.xlf.change24h;

  // Growth leading: tech outperforming utilities + financials
  if (techChange > utilitiesChange + 0.3 && techChange > financialsChange) {
    return 'GROWTH_LEADING';
  }

  // Defensive: utilities outperforming tech
  if (utilitiesChange > techChange + 0.3) {
    return 'DEFENSIVE';
  }

  // Value leading: financials + energy outperforming tech
  if (financialsChange > techChange + 0.3) {
    return 'VALUE_LEADING';
  }

  return 'MIXED';
}

/**
 * Compute the cross-asset correlation regime.
 */
export function computeCorrelationRegime(input: CorrelationRegimeInput): CorrelationRegimeOutput {
  const warnings: string[] = [];

  // Core momentum
  const btcMomentum = input.btc.change24h;
  const spyMomentum = input.spy.change24h;
  // Optional inputs are used only when present. A missing input is reported in `unavailable` and simply not scored;
  // it is never replaced by a placeholder (the old defaults VIX 18 / DXY 103 / corr 0.5 always read "RISK ON 55").
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const unavailable: string[] = [];
  const vixLevel = fin(input.vix?.price) ? input.vix!.price : null;
  const dxyLevel = fin(input.dxy?.price) ? input.dxy!.price : null;
  const dxyChange = fin(input.dxy?.change24h) ? input.dxy!.change24h : null;
  const goldChange = fin(input.gold?.change24h) ? input.gold!.change24h : null;
  const btcSpyCorr = fin(input.btcSpyCorrelation) ? input.btcSpyCorrelation : null;
  if (vixLevel === null) unavailable.push('vix');
  if (dxyChange === null) unavailable.push('dxy');
  if (goldChange === null) unavailable.push('gold');
  if (btcSpyCorr === null) unavailable.push('btcSpyCorrelation');

  // VIX regime
  const vixRegime: VIXRegime = vixLevel === null ? 'UNAVAILABLE' : classifyVIX(vixLevel);
  if (vixRegime === 'EXTREME') warnings.push('VIX EXTREME (>30): all-correlations-to-1 risk');
  if (vixRegime === 'ELEVATED') warnings.push('VIX elevated: reduce position sizes');

  // DXY trend
  const dxyTrend: CorrelationRegimeOutput['dxyTrend'] =
    dxyChange === null ? 'unavailable'
    : dxyChange > 0.15 ? 'strengthening'
    : dxyChange < -0.15 ? 'weakening'
    : 'neutral';

  if (dxyTrend === 'strengthening') warnings.push('USD strengthening: headwind for risk assets');

  // Gold safe-haven signal
  const goldSafeHaven = goldChange === null ? null : goldChange > 0.5 && spyMomentum < -0.3;
  if (goldSafeHaven) warnings.push('Gold rallying while equities drop: flight to safety');

  // Sector rotation
  const sectorRotation = detectSectorRotation(input);
  if (sectorRotation === 'UNAVAILABLE') unavailable.push('sectors');

  // ─── Regime classification ───

  let regime: CorrelationRegime;

  if (vixRegime === 'EXTREME') {
    regime = 'STRESS';
  } else if (btcMomentum > 0.5 && spyMomentum > 0.3 && vixRegime !== 'ELEVATED') {
    regime = 'RISK_ON';
  } else if (btcMomentum < -0.5 && spyMomentum < -0.3) {
    regime = 'RISK_OFF';
  } else if (btcSpyCorr !== null && Math.abs(btcSpyCorr) < 0.2) {
    regime = 'DECORRELATED';
  } else if ((btcMomentum > 0.5 && spyMomentum < -0.3) || (btcMomentum < -0.5 && spyMomentum > 0.3)) {
    regime = 'DIVERGENT';
  } else if (vixRegime === 'ELEVATED' && (btcMomentum < -0.3 || spyMomentum < -0.3)) {
    regime = 'RISK_OFF';
  } else {
    regime = 'RISK_ON';
  }

  // ─── Risk score (0-100) ───

  let riskScore = 50;

  // BTC momentum contribution (±15)
  riskScore += Math.max(-15, Math.min(15, btcMomentum * 5));

  // SPY momentum contribution (±15)
  riskScore += Math.max(-15, Math.min(15, spyMomentum * 5));

  // VIX contribution (±20)
  const vixContrib = vixLevel === null ? 0 : vixLevel < 14 ? 15 : vixLevel < 20 ? 5 : vixLevel < 25 ? -5 : vixLevel < 30 ? -12 : -20;
  riskScore += vixContrib;

  // DXY contribution (±5)
  if (dxyTrend === 'weakening') riskScore += 5;
  if (dxyTrend === 'strengthening') riskScore -= 5;

  // Correlation contribution
  if (regime === 'STRESS') riskScore -= 15;
  if (regime === 'RISK_OFF') riskScore -= 10;

  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  // ─── Size multiplier ───

  let sizeMultiplier: number;
  if (regime === 'STRESS') sizeMultiplier = 0.25;
  else if (regime === 'RISK_OFF') sizeMultiplier = 0.6;
  else if (regime === 'DIVERGENT') sizeMultiplier = 0.8;
  else if (regime === 'DECORRELATED') sizeMultiplier = 0.9;
  else sizeMultiplier = 1.0;

  // VIX overlay
  if (vixRegime === 'ELEVATED') sizeMultiplier = Math.min(sizeMultiplier, 0.75);
  if (vixRegime === 'EXTREME') sizeMultiplier = Math.min(sizeMultiplier, 0.3);

  sizeMultiplier = Number(sizeMultiplier.toFixed(2));

  // ─── Recommendation ───

  const recommendation =
    regime === 'STRESS'  ? 'VIX stress regime detected. Historically associated with elevated risk and choppy price action.'
    : regime === 'RISK_OFF' ? 'Risk-off regime detected. Historically favors cash, defensive sectors, or hedged positioning.'
    : regime === 'DIVERGENT' ? 'BTC/SPY diverging — check which asset is leading. Divergence often resolves toward the leader.'
    : regime === 'DECORRELATED' ? 'Crypto and equities decorrelated. Each asset class showing independent behavior.'
    : riskScore > 70 ? 'Strong risk-on conditions. Momentum setups historically perform well in this regime.'
    : 'Normal conditions. No significant regime signal detected.';

  return {
    regime,
    vixRegime,
    sectorRotation,
    btcSpyCorrelation: btcSpyCorr === null ? null : Number(btcSpyCorr.toFixed(3)),
    dxyTrend,
    riskScore,
    sizeMultiplier,
    warnings,
    recommendation,
    unavailable,
    components: {
      btcMomentum: Number(btcMomentum.toFixed(2)),
      spyMomentum: Number(spyMomentum.toFixed(2)),
      vixLevel: vixLevel === null ? null : Number(vixLevel.toFixed(2)),
      dxyLevel: dxyLevel === null ? null : Number(dxyLevel.toFixed(2)),
      goldSafeHaven,
    },
  };
}
