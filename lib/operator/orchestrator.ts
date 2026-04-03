/**
 * MSP Operator — Orchestrator §7
 * Chains all service engines in sequence per spec:
 *   MarketData → FeatureEngine → RegimeEngine → PlaybookEngine
 *   → (for each candidate) → DoctrineEngine → ScoringEngine
 *   → GovernanceEngine → ExecutionEngine
 *
 * Includes:
 *   - Decision replay capture §13.1
 *   - Engine version stamping §13.2
 *   - Symbol trust integration §13.3
 *   - Environment mode awareness §13.6
 *   - Meta-health throttle §13.7
 *
 * Returns the full pipeline result: radar opportunities + execution plans.
 * @internal
 */

import type {
  Market, FeatureVector, RegimeDecision, TradeCandidate, Verdict,
  GovernanceDecision, ExecutionPlan, RadarOpportunity, PortfolioState,
  RiskPolicy, ExecutionEnvironment, AccountState, InstrumentMeta,
  HealthContext, DoctrineEvaluation, Bar, KeyLevel,
  CrossMarketState, EventWindow, EnvironmentMode, DecisionSnapshot,
  MetaHealthState,
} from '@/types/operator';
import { generateId, nowISO, makeEnvelope, ENVIRONMENT_MODE } from './shared';
import { ENGINE_VERSIONS } from './version-registry';
import { computeFeatureVector } from './feature-engine';
import { classifyRegime } from './regime-engine';
import { evaluateDoctrine } from './doctrine-engine';
import { detectPlaybooks } from './playbook-engine';
import { scoreCandidate } from './scoring-engine';
import { checkGovernance } from './governance-engine';
import { buildExecutionPlan } from './execution-engine';
import { computeSymbolTrust } from './symbol-trust';
import { captureDecisionSnapshot, type SnapshotCaptureInput } from './decision-replay';
import { loadActiveWeights } from './learning-engine';

/* ── Pipeline Types ─────────────────────────────────────────── */

export interface ScanRequest {
  symbols: string[];
  market: Market;
  timeframe: string;
}

export interface ScanContext {
  portfolioState: PortfolioState;
  riskPolicy: RiskPolicy;
  executionEnvironment: ExecutionEnvironment;
  accountState: AccountState;
  instrumentMeta: Record<string, InstrumentMeta>;
  healthContext: HealthContext;
  /** §13.7 meta-health throttle multiplier */
  metaHealthThrottle?: number;
  /** Adaptive scoring weights loaded from DB (populated by orchestrator) */
  scoringWeights?: Record<string, number>;
}

export interface CandidatePipeline {
  candidate: TradeCandidate;
  doctrine: DoctrineEvaluation;
  verdict: Verdict;
  governance: GovernanceDecision;
  executionPlan: ExecutionPlan | null;
  keyLevels?: KeyLevel[];
  /** Last bar close price — the actual market price at scan time */
  lastPrice?: number;
}

export interface ScanResult {
  requestId: string;
  timestamp: string;
  environmentMode: EnvironmentMode;
  engineVersions: typeof ENGINE_VERSIONS;
  symbolsScanned: number;
  radar: RadarOpportunity[];
  pipelines: CandidatePipeline[];
  snapshots: DecisionSnapshot[];
  errors: { symbol: string; error: string }[];
}

/* ── Data Provider Interface ────────────────────────────────── */

export interface MarketDataProvider {
  getBars(symbol: string, market: Market, timeframe: string): Promise<Bar[]>;
  getKeyLevels(symbol: string, market: Market): Promise<KeyLevel[]>;
  getCrossMarketState(): Promise<CrossMarketState>;
  getEventWindow(symbol: string): Promise<EventWindow>;
}

/* ── Pipeline for a single symbol ───────────────────────────── */

async function runSymbolPipeline(
  symbol: string,
  market: Market,
  timeframe: string,
  requestId: string,
  dataProvider: MarketDataProvider,
  context: ScanContext,
): Promise<{ candidates: CandidatePipeline[]; snapshot: DecisionSnapshot | null; errors: string[] }> {
  const startTime = Date.now();
  const errors: string[] = [];

  // 1. Market Data
  const [bars, keyLevels, crossMarket, eventWindow] = await Promise.all([
    dataProvider.getBars(symbol, market, timeframe),
    dataProvider.getKeyLevels(symbol, market),
    dataProvider.getCrossMarketState(),
    dataProvider.getEventWindow(symbol),
  ]);

  if (bars.length === 0) {
    return { candidates: [], snapshot: null, errors: ['NO_BAR_DATA'] };
  }

  // §13.3 — compute symbol trust from bar history
  const trustProfile = computeSymbolTrust(symbol, market, bars);
  const healthContext: HealthContext = {
    ...context.healthContext,
    symbolTrustScore: trustProfile.compositeTrust,
  };

  // 2. Feature Engine
  const featureVector = computeFeatureVector({
    symbol,
    market,
    timeframe,
    bars,
    keyLevels,
    optionsSnapshot: null,
    crossMarketSnapshot: crossMarket,
    eventSnapshot: eventWindow,
  });

  // Inject symbol trust into feature vector
  featureVector.features.symbolTrustScore = trustProfile.compositeTrust;

  // 3. Regime Engine
  const regimeDecision = classifyRegime({
    symbol,
    market,
    timeframe,
    featureVector,
  });

  // 4. Playbook Engine — detect all valid structures
  const tradeCandidates = detectPlaybooks({
    symbol,
    market,
    timeframe,
    featureVector,
    regimeDecision,
    keyLevels,
    bars,
  });

  // 5–8. For each candidate: Doctrine → Scoring → Governance → Execution
  const pipelines: CandidatePipeline[] = [];
  const doctrineEvals: DoctrineEvaluation[] = [];
  const verdicts: Verdict[] = [];
  const govDecisions: GovernanceDecision[] = [];
  const execPlans: (ExecutionPlan | null)[] = [];

  for (const candidate of tradeCandidates) {
    // 5. Doctrine Engine
    const doctrine = evaluateDoctrine({
      symbol,
      market,
      timeframe,
      regimeDecision,
      featureVector,
      candidateContext: {
        playbook: candidate.playbook,
        direction: candidate.direction,
        entryZone: candidate.entryZone,
        invalidationPrice: candidate.invalidationPrice,
      },
    });
    doctrineEvals.push(doctrine);

    // 6. Scoring Engine (uses persisted adaptive weights if available)
    const verdict = scoreCandidate({
      candidate,
      featureVector,
      regimeDecision,
      doctrineEvaluation: doctrine,
      healthContext,
    }, context.scoringWeights);
    verdicts.push(verdict);

    // §13.7 — apply meta-health throttle to size multiplier
    if (context.metaHealthThrottle !== undefined && context.metaHealthThrottle < 1) {
      verdict.sizeMultiplier *= context.metaHealthThrottle;
      if (context.metaHealthThrottle === 0) {
        verdict.permission = 'BLOCK';
        verdict.reasonCodes.push('META_HEALTH_THROTTLED');
      }
    }

    // 7. Governance Engine
    const governance = checkGovernance({
      verdict,
      portfolioState: context.portfolioState,
      riskPolicy: context.riskPolicy,
      executionEnvironment: context.executionEnvironment,
    });
    govDecisions.push(governance);

    // 8. Execution Engine (only if approved and not in RESEARCH mode)
    let executionPlan: ExecutionPlan | null = null;
    if (
      (governance.finalPermission === 'ALLOW' || governance.finalPermission === 'ALLOW_REDUCED') &&
      ENVIRONMENT_MODE !== 'RESEARCH'
    ) {
      const meta = context.instrumentMeta[symbol] ?? {
        lotSize: 1,
        tickSize: 0.01,
        supportsBrackets: true,
      };
      executionPlan = buildExecutionPlan({
        verdict,
        governanceDecision: governance,
        accountState: context.accountState,
        instrumentMeta: meta,
      });
    }
    execPlans.push(executionPlan);

    pipelines.push({ candidate, doctrine, verdict, governance, executionPlan, keyLevels, lastPrice: bars[bars.length - 1]?.close });
  }

  // §13.1 — capture decision snapshot for replay
  const snapshot = captureDecisionSnapshot({
    requestId,
    symbol,
    inputs: { bars, keyLevels, crossMarket, eventWindow },
    featureVector,
    regimeDecision,
    candidates: tradeCandidates,
    doctrineEvaluations: doctrineEvals,
    verdicts,
    governanceDecisions: govDecisions,
    executionPlans: execPlans,
    startTime,
  });

  return { candidates: pipelines, snapshot, errors };
}

/* ── Main Orchestrator Entry Point ──────────────────────────── */

export async function runScan(
  request: ScanRequest,
  context: ScanContext,
  dataProvider: MarketDataProvider,
): Promise<ScanResult> {
  const requestId = generateId('scan');
  const allPipelines: CandidatePipeline[] = [];
  const allSnapshots: DecisionSnapshot[] = [];
  const allErrors: { symbol: string; error: string }[] = [];

  // Load persisted adaptive weights (falls back to defaults if no DB rows)
  if (!context.scoringWeights) {
    context.scoringWeights = await loadActiveWeights();
  }

  // Process each symbol
  for (const symbol of request.symbols) {
    try {
      const { candidates, snapshot, errors } = await runSymbolPipeline(
        symbol, request.market, request.timeframe,
        requestId, dataProvider, context,
      );
      allPipelines.push(...candidates);
      if (snapshot) allSnapshots.push(snapshot);
      errors.forEach(e => allErrors.push({ symbol, error: e }));
    } catch (err) {
      allErrors.push({
        symbol,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Build radar (summary view of all actionable opportunities)
  const radar: RadarOpportunity[] = allPipelines
    .filter(p => p.verdict.permission !== 'BLOCK')
    .map(p => ({
      symbol: p.candidate.symbol,
      playbook: p.candidate.playbook,
      regime: p.verdict.regime,
      direction: p.candidate.direction,
      confidenceScore: p.verdict.confidenceScore,
      permission: p.governance.finalPermission,
      sizeMultiplier: p.governance.sizeMultiplier,
      reasonCodes: p.verdict.reasonCodes,
      symbolTrust: p.verdict.evidence.symbolTrust,
    }))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    requestId,
    timestamp: nowISO(),
    environmentMode: ENVIRONMENT_MODE,
    engineVersions: ENGINE_VERSIONS,
    symbolsScanned: request.symbols.length,
    radar,
    pipelines: allPipelines,
    snapshots: allSnapshots,
    errors: allErrors,
  };
}

/** Wrap scan result in API envelope */
export function createScanEnvelope(result: ScanResult) {
  return makeEnvelope('orchestrator', result, ENGINE_VERSIONS.orchestratorVersion);
}
