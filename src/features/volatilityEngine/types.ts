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
  error?: string;
}
