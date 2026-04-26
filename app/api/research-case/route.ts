import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { computeProbabilityMatrixEngine } from '@/lib/probability-matrix';
import { computeFlowEngine } from '@/lib/flow-engine';
import { computeRegimeEngine } from '@/lib/regime-engine';
import { buildExecutionPlan } from '@/lib/plan-builder';
import { fetchMPE } from '@/lib/goldenEggFetchers';
import { classifyBestDoctrine } from '@/lib/doctrine/classifier';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { buildResearchCaseOutcomeSuggestion, buildScenarioPlan, buildTruthLayer, normalizeResearchCaseDirection, normalizeResearchCaseForSave } from '@/lib/researchCase';
import { getLatestStateMachineBySymbol, type StoredStateMachineRow } from '@/lib/state-machine-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAVED_CASE_OUTCOMES = ['pending', 'confirmed', 'invalidated', 'expired', 'reviewed'] as const;
type SavedCaseOutcome = typeof SAVED_CASE_OUTCOMES[number];

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const saved = url.searchParams.get('saved') === 'true';
  const id = url.searchParams.get('id');
  const symbol = url.searchParams.get('symbol');
  const assetClass = url.searchParams.get('assetClass') || 'equity';

  if (saved || id) {
    return getSavedResearchCases(session.workspaceId, url);
  }

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  try {
    // Fetch data in parallel
    const [indicators, quote, mpe] = await Promise.all([
      getIndicators(symbol).catch(() => null),
      getQuote(symbol).catch(() => null),
      fetchMPE(symbol, assetClass).catch(() => null),
    ]);

    const price = quote?.price ?? 0;
    const atr = indicators?.atr14 ?? 0;
    const rsi = indicators?.rsi14 ?? 50;
    const adx = indicators?.adx14 ?? 20;
    const macdHist = indicators?.macdHist ?? 0;

    // Compute Capital Flow Engine
    let cfe = null;
    try {
      cfe = computeCapitalFlowEngine({
        symbol,
        spot: price,
        atr: atr || undefined,
        trendMetrics: indicators ? {
          adx: adx,
          emaAligned: indicators.ema200 ? price > indicators.ema200 : undefined,
        } : undefined,
      });
    } catch { /* CFE may fail without full data */ }

    // Probability Matrix
    let probMatrix = null;
    if (cfe?.probability_matrix) {
      probMatrix = computeProbabilityMatrixEngine({
        pTrend: (cfe.probability_matrix.continuation ?? 33) / 100,
        pPin: (cfe.probability_matrix.pinReversion ?? 33) / 100,
        pExpansion: (cfe.probability_matrix.expansion ?? 34) / 100,
        conviction: cfe.conviction ?? 50,
        expectedMove: atr ? (atr / price) * 100 : 2,
      });
    }

    // Regime Engine
    let regime = null;
    if (cfe) {
      regime = computeRegimeEngine({
        marketMode: cfe.market_mode ?? 'chop',
        gammaState: cfe.gamma_state ?? 'Mixed',
        atrPercent: atr ? (atr / price) * 100 : 2,
        expansionProbability: (cfe.probability_matrix?.expansion ?? 30) / 100,
        dataHealthScore: 80,
      });
    }

    // Flow Engine
    let flow = null;
    if (cfe) {
      flow = computeFlowEngine({
        symbol,
        bias: cfe.bias ?? 'neutral',
        flowScore: cfe.flow_state?.confidence ?? 50,
        liquidityScore: 50,
        pTrend: (cfe.probability_matrix?.continuation ?? 33) / 100,
        pPin: (cfe.probability_matrix?.pinReversion ?? 33) / 100,
        pExpansion: (cfe.probability_matrix?.expansion ?? 34) / 100,
      });
    }

    // Paper scenario plan
    let plan = null;
    if (cfe?.brain_decision) {
      plan = buildExecutionPlan({
        symbol,
        bias: cfe.bias ?? 'neutral',
        permission: cfe.brain_decision.permission ?? 'BLOCK',
        flowState: cfe.brain_decision_v1?.state_machine?.state
          ? mapStateToFlowState(cfe.brain_decision_v1.state_machine.state)
          : 'POSITIONING',
        stopStyle: 'atr',
        finalSize: cfe.brain_decision.plan?.size ?? 1,
      });
    }

    // Doctrine
    const doctrine = classifyBestDoctrine({
      dveRegime: 'unknown',
      bbwp: null,
      rsi: rsi ?? null,
      adx: adx ?? null,
      macdHist: macdHist ?? null,
      stochK: indicators?.stochK ?? null,
      priceVsSma20Pct: null,
      priceVsSma50Pct: null,
      volumeRatio: null,
      permission: cfe?.brain_decision?.permission === 'ALLOW' ? 'TRADE' : 'WATCH',
      direction: cfe?.bias === 'bullish' ? 'LONG' : cfe?.bias === 'bearish' ? 'SHORT' : 'NEUTRAL',
      confidence: cfe?.brain_decision?.score ?? 50,
    });

    // Technical evidence
    const technicals = {
      price,
      rsi,
      adx,
      macdHist,
      atr,
      ema200: indicators?.ema200 ?? null,
      ema200Distance: indicators?.ema200
        ? ((price - indicators.ema200) / indicators.ema200) * 100
        : null,
      slowK: indicators?.stochK ?? null,
      slowD: indicators?.stochD ?? null,
      cci: indicators?.cci20 ?? null,
      mfi: indicators?.mfi14 ?? null,
      obv: indicators?.obv ?? null,
      squeeze: indicators?.inSqueeze ?? false,
    };

    const scenarioPlan = buildScenarioPlan(plan);
    const invalidation = scenarioPlan?.invalidationLogic ?? null;
    const truthLayer = buildTruthLayer({
      symbol,
      assetClass,
      quote,
      indicators,
      mpe,
      cfe,
      regime,
      flow,
      probMatrix,
      doctrine,
      invalidation,
    });
    const evidenceStack = buildEvidenceStack({ cfe, regime, flow, probMatrix, doctrine, mpe, technicals });

    // Assemble Research Case
    const researchCase = {
      symbol,
      assetClass,
      generatedAt: new Date().toISOString(),
      dataQuality: truthLayer.dataQuality,
      truthLayer,
      thesis: buildThesis(symbol, cfe, regime, flow, probMatrix, doctrine),
      evidenceStack,
      missingEvidence: truthLayer.whatWeDoNotKnow,
      technicals,
      mpe: mpe ? {
        composite: mpe.composite,
        time: mpe.time,
        volatility: mpe.volatility,
        liquidity: mpe.liquidity,
        options: mpe.options,
      } : null,
      capitalFlow: cfe ? {
        marketMode: cfe.market_mode,
        gammaState: cfe.gamma_state,
        bias: cfe.bias,
        alignment: cfe.conviction,
        brainPermission: cfe.brain_decision?.permission,
        brainMode: cfe.brain_decision?.mode,
        probabilityMatrix: cfe.probability_matrix,
      } : null,
      regime,
      flow,
      probMatrix,
      doctrine: doctrine ? { name: doctrine.doctrineId, match: doctrine.matchConfidence } : null,
      scenarioPlan,
      invalidation,
      disclaimer: truthLayer.disclaimer,
    };

    return NextResponse.json({ success: true, researchCase });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate research case';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const normalized = normalizeResearchCaseForSave(await req.json());
    const stateSnapshot = await getResearchCaseStateSnapshot(session.workspaceId, normalized.symbol, normalized.payload);
    const payload = stateSnapshot
      ? { ...normalized.payload, stateSnapshot }
      : normalized.payload;
    const rows = await q(
      `INSERT INTO saved_research_cases (
        workspace_id, symbol, asset_class, source_type, title, data_quality, generated_at,
        lifecycle_state, lifecycle_updated_at, state_snapshot_json, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      RETURNING id, symbol, asset_class, source_type, title, data_quality, generated_at,
        lifecycle_state, lifecycle_updated_at, state_snapshot_json, payload, created_at, updated_at`,
      [
        session.workspaceId,
        normalized.symbol,
        normalized.assetClass,
        normalized.sourceType,
        normalized.title,
        normalized.dataQuality,
        normalized.generatedAt,
        stateSnapshot?.state ?? null,
        stateSnapshot?.updatedAt ?? null,
        stateSnapshot ? JSON.stringify(stateSnapshot) : null,
        JSON.stringify(payload),
      ],
    );

    return NextResponse.json({ success: true, researchCase: mapSavedResearchCase(rows[0]) }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save research case';
    const status = message.includes('required') || message.includes('valid symbol') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const rows = await q(
      `DELETE FROM saved_research_cases
       WHERE workspace_id = $1 AND id = $2
       RETURNING id`,
      [session.workspaceId, id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: 'Research case not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete research case';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const outcomeStatus = normalizeSavedCaseOutcome(body?.outcomeStatus ?? body?.status);
    const outcomeNote = typeof body?.outcomeNote === 'string'
      ? body.outcomeNote.trim().slice(0, 2000)
      : typeof body?.note === 'string'
      ? body.note.trim().slice(0, 2000)
      : null;
    const outcomeMetadata = typeof body?.outcomeMetadata === 'object' && body.outcomeMetadata !== null && !Array.isArray(body.outcomeMetadata)
      ? body.outcomeMetadata
      : {};

    const rows = await q(
      `UPDATE saved_research_cases
       SET outcome_status = $3,
           outcome_note = $4,
           outcome_reviewed_at = NOW(),
           outcome_metadata = $5::jsonb,
           updated_at = NOW()
       WHERE workspace_id = $1 AND id = $2
       RETURNING id, symbol, asset_class, source_type, title, data_quality, generated_at,
         lifecycle_state, lifecycle_updated_at, state_snapshot_json,
         outcome_status, outcome_note, outcome_reviewed_at, outcome_metadata,
         payload, created_at, updated_at`,
      [session.workspaceId, id, outcomeStatus, outcomeNote || null, JSON.stringify(outcomeMetadata)],
    );

    if (!rows[0]) {
      return NextResponse.json({ error: 'Research case not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, researchCase: mapSavedResearchCase(rows[0]) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update research case outcome';
    const status = message.includes('outcomeStatus') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

async function getSavedResearchCases(workspaceId: string, url: URL) {
  const id = url.searchParams.get('id');
  const symbol = url.searchParams.get('symbol')?.trim().toUpperCase();
  const assetClass = url.searchParams.get('assetClass')?.trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 25)));

  if (id) {
    const rows = await q(
      `SELECT src.id, src.symbol, src.asset_class, src.source_type, src.title, src.data_quality, src.generated_at,
        src.lifecycle_state, src.lifecycle_updated_at, src.state_snapshot_json,
        src.outcome_status, src.outcome_note, src.outcome_reviewed_at, src.outcome_metadata,
        src.payload, src.created_at, src.updated_at,
        latest_state.state AS current_lifecycle_state,
        latest_state.updated_at AS current_lifecycle_updated_at,
        latest_state.transition_reason AS current_lifecycle_reason
       FROM saved_research_cases src
       LEFT JOIN LATERAL (
         SELECT state, updated_at, transition_reason
         FROM symbol_state_machine
         WHERE workspace_id::text = src.workspace_id
           AND symbol = src.symbol
         ORDER BY updated_at DESC
         LIMIT 1
       ) latest_state ON true
      WHERE src.workspace_id = $1 AND src.id = $2
       LIMIT 1`,
      [workspaceId, id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: 'Research case not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, researchCase: mapSavedResearchCase(rows[0]) });
  }

  const filters: string[] = ['src.workspace_id = $1'];
  const params: unknown[] = [workspaceId];
  let nextParam = 2;

  if (symbol) {
    filters.push(`src.symbol = $${nextParam++}`);
    params.push(symbol);
  }
  if (assetClass) {
    filters.push(`src.asset_class = $${nextParam++}`);
    params.push(assetClass);
  }
  params.push(limit);

  const rows = await q(
     `SELECT src.id, src.symbol, src.asset_class, src.source_type, src.title, src.data_quality, src.generated_at,
       src.lifecycle_state, src.lifecycle_updated_at, src.state_snapshot_json,
       src.outcome_status, src.outcome_note, src.outcome_reviewed_at, src.outcome_metadata,
       src.payload, src.created_at, src.updated_at,
       latest_state.state AS current_lifecycle_state,
       latest_state.updated_at AS current_lifecycle_updated_at,
       latest_state.transition_reason AS current_lifecycle_reason
     FROM saved_research_cases src
     LEFT JOIN LATERAL (
       SELECT state, updated_at, transition_reason
       FROM symbol_state_machine
       WHERE workspace_id::text = src.workspace_id
         AND symbol = src.symbol
       ORDER BY updated_at DESC
       LIMIT 1
     ) latest_state ON true
     WHERE ${filters.join(' AND ')}
    ORDER BY src.created_at DESC
     LIMIT $${nextParam}`,
    params,
  );

  return NextResponse.json({ success: true, researchCases: rows.map(mapSavedResearchCase) });
}

function mapSavedResearchCase(row: any) {
  return {
    id: row.id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    sourceType: row.source_type,
    title: row.title,
    dataQuality: row.data_quality,
    generatedAt: row.generated_at,
    lifecycleState: row.lifecycle_state,
    lifecycleUpdatedAt: row.lifecycle_updated_at,
    stateSnapshot: row.state_snapshot_json,
    outcomeStatus: row.outcome_status ?? 'pending',
    outcomeNote: row.outcome_note,
    outcomeReviewedAt: row.outcome_reviewed_at,
    outcomeMetadata: row.outcome_metadata ?? {},
    currentLifecycleState: row.current_lifecycle_state ?? null,
    currentLifecycleUpdatedAt: row.current_lifecycle_updated_at ?? null,
    currentLifecycleReason: row.current_lifecycle_reason ?? null,
    outcomeSuggestion: buildResearchCaseOutcomeSuggestion({
      savedState: row.lifecycle_state,
      currentState: row.current_lifecycle_state,
      createdAt: row.created_at,
      currentUpdatedAt: row.current_lifecycle_updated_at,
      outcomeStatus: row.outcome_status,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    researchCase: row.payload,
  };
}

function normalizeSavedCaseOutcome(value: unknown): SavedCaseOutcome {
  const raw = String(value || '').trim().toLowerCase();
  if (SAVED_CASE_OUTCOMES.includes(raw as SavedCaseOutcome)) return raw as SavedCaseOutcome;
  throw new Error(`outcomeStatus must be one of: ${SAVED_CASE_OUTCOMES.join(', ')}`);
}

async function getResearchCaseStateSnapshot(workspaceId: string, symbol: string, payload: Record<string, unknown>) {
  try {
    const direction = normalizeResearchCaseDirection(payload);
    const latest = await getLatestStateMachineBySymbol(workspaceId, symbol, undefined, direction);
    return latest ? mapStateSnapshot(latest) : null;
  } catch (error) {
    console.warn('[research-case] state snapshot unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

function mapStateSnapshot(row: StoredStateMachineRow) {
  const stateMachine = row.state_machine_json || {};
  const nextBestAction = typeof stateMachine === 'object' && stateMachine !== null
    ? (stateMachine as { next_best_action?: unknown }).next_best_action ?? null
    : null;

  return {
    symbol: row.symbol,
    playbook: row.playbook,
    direction: row.direction,
    state: row.state,
    previousState: row.previous_state,
    stateSince: row.state_since,
    updatedAt: row.updated_at,
    brainScore: row.brain_score,
    stateConfidence: row.state_confidence,
    transitionReason: row.transition_reason,
    lastEvent: row.last_event,
    nextBestAction,
  };
}

function mapStateToFlowState(state: string): 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION' {
  switch (state) {
    case 'SCAN': case 'WATCH': return 'ACCUMULATION';
    case 'STALK': case 'ARMED': return 'POSITIONING';
    case 'EXECUTE': case 'MANAGE': return 'LAUNCH';
    case 'COOLDOWN': case 'BLOCKED': return 'EXHAUSTION';
    default: return 'POSITIONING';
  }
}

function buildThesis(
  symbol: string,
  cfe: any,
  regime: any,
  flow: any,
  probMatrix: any,
  doctrine: any,
): string {
  const parts: string[] = [];
  if (cfe) {
    parts.push(`${symbol} is in ${cfe.market_mode?.toUpperCase() ?? 'UNKNOWN'} mode with ${cfe.gamma_state ?? 'mixed'} gamma.`);
    parts.push(`Capital flow bias: ${cfe.bias ?? 'neutral'}, alignment: ${cfe.conviction ?? 0}/100.`);
    if (cfe.brain_decision) {
      parts.push(`Condition state: ${toConditionState(cfe.brain_decision.permission)}, operating in ${cfe.brain_decision.mode} mode.`);
    }
  }
  if (regime) {
    parts.push(`Regime: ${regime.regime}, risk mode: ${regime.riskMode}, vol: ${regime.volState}.`);
  }
  if (flow) {
    parts.push(`Flow bias: ${flow.flowBias}, strength: ${flow.flowStrength}/100.`);
  }
  if (probMatrix) {
    parts.push(`Scenario distribution: ${(probMatrix.pUp * 100).toFixed(0)}% upside path / ${(probMatrix.pDown * 100).toFixed(0)}% downside path. Best framework: ${probMatrix.bestPlaybook}.`);
  }
  if (doctrine) {
    parts.push(`Doctrine: ${doctrine.doctrineId ?? doctrine.name} (${((doctrine.matchConfidence ?? doctrine.confidence ?? 0) * 100).toFixed(0)}% match).`);
  }
  return parts.join(' ') || `No sufficient data to build thesis for ${symbol}.`;
}

function buildEvidenceStack(args: {
  cfe: any;
  regime: any;
  flow: any;
  probMatrix: any;
  doctrine: any;
  mpe: any;
  technicals: Record<string, unknown>;
}) {
  const evidence: Array<{ label: string; value: string; status: 'supportive' | 'mixed' | 'missing' }> = [];

  if (args.technicals?.price) evidence.push({ label: 'Reference price', value: String(args.technicals.price), status: 'supportive' });
  else evidence.push({ label: 'Reference price', value: 'Unavailable', status: 'missing' });

  if (args.regime?.regime) evidence.push({ label: 'Regime', value: String(args.regime.regime), status: 'supportive' });
  else evidence.push({ label: 'Regime', value: 'Unavailable', status: 'missing' });

  if (args.cfe?.market_mode) evidence.push({ label: 'Capital flow mode', value: String(args.cfe.market_mode), status: 'supportive' });
  else evidence.push({ label: 'Capital flow mode', value: 'Unavailable', status: 'missing' });

  if (args.flow?.flowBias) evidence.push({ label: 'Flow bias', value: String(args.flow.flowBias), status: 'supportive' });
  else evidence.push({ label: 'Flow bias', value: 'Unavailable', status: 'missing' });

  if (args.mpe?.composite != null) evidence.push({ label: 'Market pressure', value: String(args.mpe.composite), status: 'supportive' });
  else evidence.push({ label: 'Market pressure', value: 'Unavailable', status: 'missing' });

  if (args.doctrine?.doctrineId) evidence.push({ label: 'Methodology match', value: String(args.doctrine.doctrineId), status: 'supportive' });
  else evidence.push({ label: 'Methodology match', value: 'Unavailable', status: 'missing' });

  if (args.probMatrix?.bestPlaybook) evidence.push({ label: 'Scenario framework', value: String(args.probMatrix.bestPlaybook), status: 'supportive' });
  else evidence.push({ label: 'Scenario framework', value: 'Unavailable', status: 'mixed' });

  return evidence;
}

function toConditionState(permission: string | undefined): string {
  if (permission === 'ALLOW') return 'aligned';
  if (permission === 'ALLOW_SMALL') return 'reduced alignment';
  if (permission === 'BLOCK') return 'not aligned';
  return 'watch';
}
