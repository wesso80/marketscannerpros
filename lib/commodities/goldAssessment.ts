/**
 * Gold's role in the commodity assessment.
 * When gold's change is missing it is left out. A present gold change, including 0,
 * uses the same comparisons as before.
 */

export type GoldTrend = 'UP' | 'FLAT' | 'DOWN';
export type GoldImpulse = 'INFLATION' | 'GROWTH' | 'DEFLATION' | 'MIXED';

export interface GoldAssessmentInput {
  copperChange: number;
  energyChange: number;
  goldChange: number | null;
  usdTrend: GoldTrend;
  realRatesTrend: GoldTrend;
  energyLead: boolean;
  metalsLead: boolean;
  agLead: boolean;
}

export interface GoldAssessment {
  impulseType: GoldImpulse;
  growthTrend: GoldTrend | null;
  growthSupport: 'SUPPORTIVE' | 'NEUTRAL' | 'FADING' | null;
  copperVsGold: number | null;
}

export function goldAssessment(input: GoldAssessmentInput): GoldAssessment {
  const goldKnown = typeof input.goldChange === 'number' && Number.isFinite(input.goldChange);
  const goldChange = goldKnown ? input.goldChange : null;
  const growthProxyRaw = goldChange == null ? null : input.copperChange + input.energyChange - goldChange;
  const growthTrend: GoldTrend | null = growthProxyRaw == null
    ? null
    : growthProxyRaw > 0.8
      ? 'UP'
      : growthProxyRaw < -0.8
        ? 'DOWN'
        : 'FLAT';
  const growthSupport = growthTrend == null
    ? null
    : growthTrend === 'UP'
      ? 'SUPPORTIVE'
      : growthTrend === 'DOWN'
        ? 'FADING'
        : 'NEUTRAL';

  let impulseType: GoldImpulse = 'MIXED';
  if (input.energyLead && input.copperChange > 0 && input.usdTrend !== 'UP' && input.realRatesTrend !== 'UP') {
    impulseType = 'GROWTH';
  } else if (goldChange != null && goldChange > 0.25 && input.usdTrend === 'DOWN' && input.realRatesTrend === 'DOWN') {
    impulseType = 'INFLATION';
  } else if (!input.energyLead && !input.metalsLead && !input.agLead && input.usdTrend === 'UP' && input.realRatesTrend === 'UP') {
    impulseType = 'DEFLATION';
  }

  return {
    impulseType,
    growthTrend,
    growthSupport,
    copperVsGold: goldChange == null ? null : input.copperChange - goldChange,
  };
}
