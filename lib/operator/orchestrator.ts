/**
 * MSP Operator — Orchestrator
 * Chains all service engines in sequence per §6:
 *   MarketData → FeatureEngine → RegimeEngine → PlaybookEngine
 *   → (for each candidate) → DoctrineEngine → ScoringEngine
 *   → GovernanceEngine → ExecutionEngine
 *
 * Returns the full pipeline result: radar opportunities + execution plans.
 * @internal
 */

import type {
  Market, FeatureVector, RegimeDecision, TradeCandidate, Verdict,
  GovernanceDecision, ExecutionPlan, RadarOpportunity, PortfolioState,
  RiskPolicy, ExecutionEnvironment, AccountState, InstrumentMeta,
  HealthContext, DoctrineEvaluation, Bar, KeyLevel,
  CrossMarketState, EventWindow,
} from '@/types/operator';
import { generateId, nowISO, makeEnvelope } from './shared';
import { computeFeatureVector } from './feature-engine';
import { classifyRegime } from './regime-engine';
import { evaluateDoctrine } from './doctrine-engine';
import { detectPlaybooks } from './playbook-engine';
import { scoreCandidate } from './scoring-engine';
import { checkGovernance } from './governance-engine';
import { buildExecutionPlan } from './execution-engine';

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
}

export interface CandidatePipeline {
  candidate: TradeCandidate;
  doctrine: DoctrineEvaluation;
  verdict: Verdict;
  governance: GovernanceDecision;
  executionPlan: ExecutionPlan | null;
}

export interface ScanResult {
  requestId: string;
  timestamp: string;
  symbolsScanned: number;
  radar: RadarOpportunity[];
  pipelines: CandidatePipeline[];
  errors: { symbol: string; error: string }[];
}

/* ── Data Provider Interface ────────────────────────────────── */
// These will be implemented when wiring to real data sources

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
  dataProvider: MarketDataProvider,
  context: ScanContext,
): Promise<{ candidates: CandidatePipeline[]; errors: string[] }> {
  const errors: string[] = [];

  // 1. Market Data
  const [bars, keyLevels, crossMarket, eventWindow] = await Promise.all([
    dataProvider.getBars(symbol, market, timeframe),
    dataProvider.getKeyLevels(symbol, market),
    dataProvider.getCrossMarketState(),
    dataProvider.getEventWindow(symbol),
  ]);

  if (bars.length === 0) {
    return { candidates: [], errors: ['NO_BAR_DATA'] };
  }

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
  });

  if (tradeCandidates.length === 0) {
    return { candidates: [], errors: [] };
  }

  // 5–8. For each candidate: Doctrine → Scoring → Governance → Execution
  const pipelines: CandidatePipeline[] = [];

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

    // 6. Scoring Engine
    const verdict = scoreCandidate({
      candidate,
      featureVector,
      regimeDecision,
      doctrineEvaluation: doctrine,
      healthContext: context.healthContext,
    });

    // 7. Governance Engine
    const governance = checkGovernance({
      verdict,
      portfolioState: context.portfolioState,
      riskPolicy: context.riskPolicy,
      executionEnvironment: context.executionEnvironment,
    });

    // 8. Execution Engine (only if approved)
    let executionPlan: ExecutionPlan | null = null;
    if (governance.finalPermission === 'ALLOW' || governance.finalPermission === 'ALLOW_REDUCED') {
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

    pipelines.push({ candidate, doctrine, verdict, governance, executionPlan });
  }

  return { candidates: pipelines, errors };
}

/* ── Main Orchestrator Entry Point ──────────────────────────── */

export async function runScan(
  request: ScanRequest,
  context: ScanContext,
  dataProvider: MarketDataProvider,
): Promise<ScanResult> {
  const requestId = generateId('scan');
  const allPipelines: CandidatePipeline[] = [];
  const allErrors: { symbol: string; error: string }[] = [];

  // Process each symbol
  for (const symbol of request.symbols) {
    try {
      const { candidates, errors } = await runSymbolPipeline(
        symbol, request.market, request.timeframe,
        dataProvider, context,
      );
      allPipelines.push(...candidates);
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
      confidenceScore: p.verdict.confidenceScore,
      permission: p.governance.finalPermission,
      sizeMultiplier: p.governance.sizeMultiplier,
      reasonCodes: p.verdict.reasonCodes,
    }))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    requestId,
    timestamp: nowISO(),
    symbolsScanned: request.symbols.length,
    radar,
    pipelines: allPipelines,
    errors: allErrors,
  };
}

/** Wrap scan result in API envelope */
export function createScanEnvelope(result: ScanResult) {
  return makeEnvelope('orchestrator', result);
}
