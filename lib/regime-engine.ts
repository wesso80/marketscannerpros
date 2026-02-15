export type MarketRegime = 'TREND_DAY' | 'MEAN_REVERT_DAY' | 'VOL_EXPANSION' | 'VOL_COMPRESSION' | 'LIQUIDITY_VACUUM' | 'NEWS_SHOCK';
export type RiskOnOff = 'risk_on' | 'risk_off';
export type VolState = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
export type LiquidityState = 'THIN' | 'NORMAL' | 'RICH';

export interface RegimeEngineInput {
  marketMode: 'pin' | 'launch' | 'chop';
  gammaState: 'Positive' | 'Negative' | 'Mixed';
  atrPercent: number;
  expansionProbability: number;
  dataHealthScore: number;
}

export interface RegimeEngineOutput {
  regime: MarketRegime;
  riskMode: RiskOnOff;
  volState: VolState;
  liquidityState: LiquidityState;
  score: number;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function computeRegimeEngine(input: RegimeEngineInput): RegimeEngineOutput {
  const volState: VolState = input.atrPercent >= 3.5 || input.expansionProbability >= 75
    ? 'EXTREME'
    : input.atrPercent >= 2.2 || input.expansionProbability >= 62
      ? 'HIGH'
      : input.atrPercent <= 0.9 && input.expansionProbability <= 40
        ? 'LOW'
        : 'NORMAL';

  const liquidityState: LiquidityState = input.dataHealthScore < 55
    ? 'THIN'
    : input.marketMode === 'chop'
      ? 'NORMAL'
      : 'RICH';

  const regime: MarketRegime = input.marketMode === 'launch'
    ? (volState === 'EXTREME' ? 'VOL_EXPANSION' : 'TREND_DAY')
    : input.marketMode === 'pin'
      ? 'MEAN_REVERT_DAY'
      : volState === 'LOW'
        ? 'VOL_COMPRESSION'
        : liquidityState === 'THIN'
          ? 'LIQUIDITY_VACUUM'
          : 'MEAN_REVERT_DAY';

  const riskMode: RiskOnOff = input.gammaState === 'Negative' || volState === 'EXTREME' ? 'risk_off' : 'risk_on';

  const score = clamp(
    (riskMode === 'risk_on' ? 30 : 18) +
    (volState === 'NORMAL' ? 30 : volState === 'HIGH' ? 22 : volState === 'LOW' ? 20 : 10) +
    (liquidityState === 'RICH' ? 25 : liquidityState === 'NORMAL' ? 18 : 10) +
    (input.marketMode === 'launch' ? 15 : 10),
    0,
    100
  );

  return { regime, riskMode, volState, liquidityState, score };
}
