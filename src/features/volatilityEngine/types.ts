// Frontend types for Volatility Engine — mirrors /api/dve response
// Re-exports relevant types from the engine for UI component props.

export type {
  DVEReading,
  VolatilityState,
  DirectionalPressure,
  DirectionalBias,
  PhasePersistence,
  ZoneDurationStats,
  DVESignal,
  DVESignalType,
  DVESignalState,
  DVEInvalidation,
  SignalProjection,
  BreakoutReadiness,
  VolatilityTrap,
  ExhaustionRisk,
  StateTransition,
  DVEDataQuality,
  DVEFlag,
  VolRegime,
  RateDirection,
} from '@/lib/directionalVolatilityEngine.types';

export interface DVEApiResponse {
  success: boolean;
  data?: import('@/lib/directionalVolatilityEngine.types').DVEReading;
  price?: number;
  cached?: boolean;
  /** When this reading was computed (a cache hit returns the original time). */
  computedAt?: string;
  /** Time of the last completed price bar behind the reading. */
  dataAsOf?: string | null;
  /** Session-aware age of that bar (same rule as the scanner's data trust). */
  dataFreshness?: 'fresh' | 'delayed' | 'stale' | 'unknown';
  error?: string;
}
