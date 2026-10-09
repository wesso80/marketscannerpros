// Frontend types for Volatility Engine — the public /api/dve contract (lib/research/publicDve, W3).
// The engine's full DVEReading stays on the server.

export type {
  PublicDveReading,
  PublicVolatility,
  PublicPhase,
  PublicSignal,
  PublicInvalidation,
  PublicProjection,
  PublicBreakout,
  PublicPinnedCompression,
  PublicStretch,
  InputAvailability,
  SignalConditionGroup,
  SignalCondition,
  BreakoutConditionId,
  Tri,
} from '@/lib/research/publicDve';
export type { ZoneDurationStats, DVESignalType, DVESignalState, VolRegime, RateDirection } from '@/lib/directionalVolatilityEngine.types';

export interface DVEApiResponse {
  success: boolean;
  data?: import('@/lib/research/publicDve').PublicDveReading;
  price?: number;
  cached?: boolean;
  /** When this reading was computed (a cache hit returns the original time). */
  computedAt?: string;
  /** Time of the last completed price bar behind the reading. */
  dataAsOf?: string | null;
  /** Session-aware age of that bar (same rule as the scanner's data trust). */
  dataFreshness?: 'fresh' | 'delayed' | 'stale' | 'unknown';
  /** Symbol page's measured values from the same bars (completed daily bars only); null off the daily timeframe. */
  priceEvidence?: import('@/lib/research/priceEvidence').PriceEvidence | null;
  error?: string;
}
