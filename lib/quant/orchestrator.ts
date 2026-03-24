/**
 * Quant Pipeline Orchestrator
 *
 * Master runner that executes the full 6-layer pipeline:
 *   1. Regime Engine  → Unified regime state
 *   2. Discovery      → Raw candidates from all engines
 *   3. Fusion         → 8-dimension scoring per candidate
 *   4. Permission     → Hard/soft gate adjudication
 *   5. Escalation     → Alert generation with dedup + cooldown
 *   6. Outcome        → Signal lifecycle tracking (async, post-alert)
 *
 * Returns PipelineResult with full audit trail at every layer.
 */

import type { PipelineResult, QuantConfig, UnifiedRegimeState } from './types';
import { DEFAULT_QUANT_CONFIG } from './types';
import { computeUnifiedRegime, type RegimeSourceInputs } from './regimeEngine';
import { runDiscovery, type DiscoveryOptions } from './discoveryEngine';
import { fuseAll } from './fusionEngine';
import { evaluateAll } from './permissionEngine';
import { escalateAll, getActiveAlerts } from './escalationEngine';
import { q as dbQuery } from '@/lib/db';

// ─── Regime source builder ──────────────────────────────────────────────────

/**
 * Build regime inputs from the latest discovery candidates.
 * In production, this would also pull from DVE / Capital Flow API caches.
 * For now, aggregate from the top candidates' engine data.
 */
function buildRegimeInputsFromCandidates(
  candidates: Array<{
    dve?: { bbwp: number; regime: string; directionalBias: string; directionalScore: number; signalStrength: number };
    flowState?: { state: string; confidence: number; bias: string };
    capitalFlow?: { mode: string; bias: string; conviction: number; gammaState: string };
  }>,
): RegimeSourceInputs {
  // Aggregate DVE: use the candidate with strongest signal
  const bestDve = candidates
    .filter(c => c.dve)
    .sort((a, b) => (b.dve?.signalStrength ?? 0) - (a.dve?.signalStrength ?? 0))[0]?.dve;

  // Aggregate Flow State: use highest confidence
  const bestFlow = candidates
    .filter(c => c.flowState)
    .sort((a, b) => (b.flowState?.confidence ?? 0) - (a.flowState?.confidence ?? 0))[0]?.flowState;

  // Aggregate Capital Flow: use highest conviction
  const bestCF = candidates
    .filter(c => c.capitalFlow)
    .sort((a, b) => (b.capitalFlow?.conviction ?? 0) - (a.capitalFlow?.conviction ?? 0))[0]?.capitalFlow;

  return {
    dve: bestDve ? {
      regime: bestDve.regime,
      bbwp: bestDve.bbwp,
      confidence: bestDve.signalStrength > 0 ? Math.min(90, 50 + bestDve.signalStrength * 0.4) : 50,
      directionalBias: bestDve.directionalBias as 'bullish' | 'bearish' | 'neutral',
    } : undefined,
    flowState: bestFlow ? {
      state: bestFlow.state,
      confidence: bestFlow.confidence,
      bias: bestFlow.bias as 'bullish' | 'bearish' | 'neutral',
    } : undefined,
    capitalFlow: bestCF ? {
      mode: bestCF.mode,
      bias: bestCF.bias,
      conviction: bestCF.conviction,
    } : undefined,
  };
}

// ─── Pipeline Runner ────────────────────────────────────────────────────────

export async function runPipeline(
  config: QuantConfig = DEFAULT_QUANT_CONFIG,
  discoveryOptions?: DiscoveryOptions,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Layer 2: Discovery (run first to gather data for regime)
  const candidates = await runDiscovery({
    assetTypes: config.enabledAssetTypes,
    ...discoveryOptions,
  });

  // Layer 1: Regime (built from discovered data)
  const regimeInputs = buildRegimeInputsFromCandidates(candidates);
  const regime = computeUnifiedRegime(regimeInputs);

  // Layer 3: Fusion
  const scored = fuseAll(candidates, regime);

  // Layer 4: Permission
  const permitted = evaluateAll(scored, regime, config);

  // Layer 5: Escalation
  const alerts = escalateAll(permitted, scored, regime, config);

  const elapsed = Date.now() - startTime;

  return {
    regime,
    candidates,
    scored,
    permitted,
    alerts,
    meta: {
      scanDurationMs: elapsed,
      symbolsScanned: candidates.length,
      symbolsPassed: permitted.length,
      alertsGenerated: alerts.length,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Persist scan results to DB ─────────────────────────────────────────────

export async function persistScanResult(result: PipelineResult): Promise<boolean> {
  try {
    await dbQuery(
      `INSERT INTO quant_scan_history (
        regime_phase, regime_confidence, regime_agreement,
        symbols_scanned, symbols_passed, alerts_generated,
        scan_duration_ms, alerts_json, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        result.regime.phase,
        result.regime.confidence,
        result.regime.agreement,
        result.meta.symbolsScanned,
        result.meta.symbolsPassed,
        result.meta.alertsGenerated,
        result.meta.scanDurationMs,
        JSON.stringify(result.alerts),
        result.meta.timestamp,
      ],
    );
    return true;
  } catch (err) {
    console.error('[quant:orchestrator] Failed to persist scan result:', err);
    return false;
  }
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export { getActiveAlerts } from './escalationEngine';
export { getActiveLifecycles, getOutcomeStats } from './outcomeEngine';
export { computeUnifiedRegime } from './regimeEngine';
