/**
 * MSP Brain Layer — Phase 2 barrel.
 *
 * Architecture:
 *   L1 events    →  recordBrainEvent
 *   L2 features  →  recordBrainFeatures
 *   L3 outcomes  →  labelBrainOutcome / computeOutcome
 *   L4 edge      →  scoreEdge / persistEdgeScore
 *
 * See migrations/073_brain_layer.sql for schema.
 * See LEARNING_ENGINE_PHASE1_INVENTORY.md for the wider learning landscape.
 */

export * from './types';
export { recordBrainEvent, hashInputs, publicSafeEventView } from './eventRecorder';
export { recordBrainFeatures, type BrainFeatureInput } from './featureStore';
export {
  labelBrainOutcome,
  computeOutcome,
  type LabelOutcomeParams,
  type LabelOutcomeResult,
} from './outcomeLabeller';
export {
  scoreEdge,
  persistEdgeScore,
  wilsonLowerBound,
  wilsonUpperBound,
  shrunkRate,
  sampleSizePenalty,
  recencyWeight,
  type EdgeScoreInputs,
} from './edgeScorer';
export {
  computeFinalEdgeScore,
  applyRiskFloors,
  sampleConfidenceMultiplier,
  regimeFitMultiplier,
  historicalEdgeMultiplier,
  riskPenaltyMultiplier,
  overfittingPenaltyMultiplier,
  mapBrainFreshness,
  mapBrainEvidenceQuality,
  mapBrainEdgeToHistorical,
  EVIDENCE_QUALITY_MULTIPLIER,
  DATA_FRESHNESS_MULTIPLIER,
  SAMPLE_SIZE_TIERS,
  type EvidenceQuality,
  type DataFreshnessTier,
  type FinalEdgeInputs,
  type FinalEdgeResult,
  type RegimeFitInputs,
  type HistoricalEdgeInputs,
  type RiskInputs,
  type OverfittingInputs,
  type RiskFloorResult,
} from './finalEdgeScore';

// Phase 5 — learning memory rules
export {
  evaluateMemoryEligibility,
  pickDimension,
  buildSetupKey,
  loadEligibleMemoryPool,
  MEMORY_RULE_VERSION,
  MEMORY_DIMENSION_DESCRIPTIONS,
  INELIGIBILITY_REASON_DESCRIPTIONS,
  type MemoryDimension,
  type IneligibilityReason,
  type MemoryEligibilityInput,
  type MemoryEligibilityResult,
  type SetupKeyParts,
  type MemoryPoolRow,
  type MemoryPoolFilter,
} from './memoryRules';

// Phase 6 — admin / public surface separation
export {
  ADMIN_CAPABILITIES,
  FORBIDDEN_ADMIN_ACTIONS,
  PUBLIC_CAPABILITIES,
  FORBIDDEN_PUBLIC_EXPOSURES,
  ADMIN_ONLY_KEYS,
  sanitizeForPublic,
  assertPublicSafe,
  downgradeToPublic,
  assertAdminSurface,
  assertAdminCapability,
  assertPublicCapability,
  assertPortfolioContextAllowed,
  assertPublicLanguageSafe,
  assertNoBrokerExecution,
  assertNoOutcomeGuarantee,
  visibilityFlagsForSurface,
  BrainSurfaceViolation,
  type Surface,
  type AdminCapability,
  type ForbiddenAdminAction,
  type PublicCapability,
  type ForbiddenPublicExposure,
  type AdminMode,
  type SanitizeOptions,
} from './visibility';

// Phase 8 — model / rules version registry
export {
  registerModelVersion,
  getActiveModelVersion,
  listModelVersions,
  hashRulesBody,
  type RegisterModelVersionParams,
  type ModelVersionRow,
} from './modelVersions';
