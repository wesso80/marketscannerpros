import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { MSPEvent, WorkflowEventType } from '@/lib/workflow/types';
import {
  advanceStatus,
  buildDecisionPacketFingerprint,
  statusFromEventType,
  type DecisionPacketStatus,
} from '@/lib/workflow/decisionPacketLifecycle';
import {
  evaluateAutoAlertPolicy,
  evaluateSystemExecutionPolicy,
  getRiskGovernorThresholdsFromEnv,
  type RiskGovernorThresholds,
} from '@/lib/operator/riskGovernor';

const ALLOWED_EVENT_TYPES = new Set<WorkflowEventType>([
  'operator.session.started',
  'operator.context.updated',
  'signal.created',
  'signal.updated',
  'candidate.created',
  'candidate.promoted',
  'candidate.evaluated',
  'trade.plan.created',
  'trade.plan.updated',
  'trade.executed',
  'trade.updated',
  'trade.closed',
  'journal.draft.created',
  'journal.updated',
  'journal.completed',
  'coach.analysis.generated',
  'strategy.rule.suggested',
  'strategy.rule.applied',
  'label.explicit.created',
  'trade.story.generated',
]);

function normalizeAlertAssetType(assetClass?: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  if (assetClass === 'crypto') return 'crypto';
  if (assetClass === 'forex') return 'forex';
  if (assetClass === 'commodities') return 'commodity';
  return 'equity';
}

function extractPlanAlertPrice(event: MSPEvent): number {
  const payload = event.payload as Record<string, any>;
  const planPayload = getPlanPayload(payload);
  const entry = planPayload?.entry;

  const zone = entry?.zone;
  if (typeof zone === 'number' && Number.isFinite(zone)) return zone;

  if (typeof zone === 'string') {
    const parsed = Number(zone);
    if (Number.isFinite(parsed)) return parsed;
  }

  const low = entry?.low;
  const high = entry?.high;
  if (typeof low === 'number' && typeof high === 'number' && Number.isFinite(low) && Number.isFinite(high)) {
    return (low + high) / 2;
  }

  const currentPrice = entry?.current_price;
  if (typeof currentPrice === 'number' && Number.isFinite(currentPrice)) return currentPrice;

  return 0;
}

function getPlanPayload(payload: Record<string, any>): Record<string, any> {
  const nested = payload?.trade_plan;
  if (nested && typeof nested === 'object') return nested as Record<string, any>;
  return payload;
}

function extractDecisionPacketId(event: MSPEvent): string | null {
  const payload = event.payload as Record<string, any>;
  const planPayload = getPlanPayload(payload);

  const direct = payload?.decision_packet_id;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const setup = planPayload?.setup;
  const setupId = setup?.decision_packet_id;
  if (typeof setupId === 'string' && setupId.trim()) return setupId.trim();

  const links = planPayload?.links;
  const linkId = links?.decision_packet_id;
  if (typeof linkId === 'string' && linkId.trim()) return linkId.trim();

  const tradePlan = payload?.trade_plan;
  const tradePlanSetupId = tradePlan?.setup?.decision_packet_id;
  if (typeof tradePlanSetupId === 'string' && tradePlanSetupId.trim()) return tradePlanSetupId.trim();

  const tradePlanLinkId = tradePlan?.links?.decision_packet_id;
  if (typeof tradePlanLinkId === 'string' && tradePlanLinkId.trim()) return tradePlanLinkId.trim();

  return null;
}

type DecisionPacketMutation = {
  packetId: string;
  status: DecisionPacketStatus;
  symbol: string;
  workflowId: string | null;
  market: string | null;
  signalSource: string | null;
  signalScore: number | null;
  bias: string | null;
  timeframeBias: string[];
  entryZone: number | null;
  invalidation: number | null;
  targets: number[];
  riskScore: number | null;
  volatilityRegime: string | null;
  operatorFit: number | null;
  eventId: string;
  eventType: WorkflowEventType;
  occurredAt: string;
  sourcePayload: Record<string, unknown>;
};

function toFiniteOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function toStringOrNull(value: unknown): string | null {
  const text = String(value || '').trim();
  return text ? text : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean);
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
}

function toMarket(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'equity' || raw === 'stocks') return 'stocks';
  if (raw === 'crypto') return 'crypto';
  if (raw === 'options' || raw === 'option') return 'options';
  if (raw === 'forex') return 'forex';
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

type RiskGovernorRuntime = {
  thresholds: RiskGovernorThresholds;
  executionOptIn: boolean;
  riskEnvironment: string | null;
  cognitiveLoad: number | null;
  autoAlertsLastHour: number;
  autoAlertsToday: number;
};

async function createRiskGovernorRuntime(workspaceId: string): Promise<RiskGovernorRuntime> {
  const [stateRows, alertCountRows] = await Promise.all([
    q<{
      risk_environment: string | null;
      cognitive_load: number | null;
      context_state: Record<string, unknown> | null;
    }>(
      `SELECT risk_environment, cognitive_load, context_state
       FROM operator_state
       WHERE workspace_id = $1
       LIMIT 1`,
      [workspaceId]
    ),
    q<{ alerts_last_hour: number; alerts_today: number }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE created_at >= NOW() - INTERVAL '1 hour'
         )::int AS alerts_last_hour,
         COUNT(*) FILTER (
           WHERE created_at >= CURRENT_DATE
         )::int AS alerts_today
       FROM alerts
       WHERE workspace_id = $1
         AND is_smart_alert = true
         AND smart_alert_context->>'source' = 'workflow.auto'`,
      [workspaceId]
    ),
  ]);

  const state = stateRows[0];
  const counts = alertCountRows[0];
  const context = (state?.context_state || {}) as Record<string, unknown>;
  const contextOptIn = context.executionAutomationOptIn;

  return {
    thresholds: getRiskGovernorThresholdsFromEnv(),
    executionOptIn: contextOptIn === true || String(contextOptIn || '').toLowerCase() === 'true',
    riskEnvironment: state?.risk_environment || null,
    cognitiveLoad: toFiniteNumber(state?.cognitive_load),
    autoAlertsLastHour: Number(counts?.alerts_last_hour || 0),
    autoAlertsToday: Number(counts?.alerts_today || 0),
  };
}

function createRiskGovernorEvent(args: {
  workflowId: string;
  parentEventId: string;
  eventType: 'auto_alert.blocked' | 'execution.blocked';
  reasonCode: string;
  reason: string;
  decisionPacketId?: string | null;
  symbol?: string | null;
  context?: Record<string, unknown>;
}): MSPEvent {
  return normalizeEvent({
    event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event_type: 'operator.context.updated',
    event_version: 1,
    occurred_at: new Date().toISOString(),
    actor: {
      actor_type: 'system',
      user_id: null,
      anonymous_id: null,
      session_id: null,
    },
    context: {
      tenant_id: 'msp',
      app: { name: 'MarketScannerPros', env: 'prod' },
      page: { route: '/operator', module: 'risk_governor' },
      device: {},
      geo: {},
    },
    entity: {
      entity_type: 'operator_context',
      entity_id: `rg_${Date.now()}`,
      symbol: args.symbol || undefined,
      asset_class: 'mixed',
    },
    correlation: {
      workflow_id: args.workflowId,
      parent_event_id: args.parentEventId,
    },
    payload: {
      source: 'risk_governor',
      blocked: true,
      blocked_event_type: args.eventType,
      reason_code: args.reasonCode,
      reason: args.reason,
      decision_packet_id: args.decisionPacketId || null,
      context: args.context || {},
    },
  });
}

function buildDecisionPacketMutation(event: MSPEvent): DecisionPacketMutation | null {
  const payload = event.payload as Record<string, unknown>;
  const planPayload = getPlanPayload(payload);
  const packetFromPayload = (payload?.decision_packet || payload?.decisionPacket) as Record<string, unknown> | undefined;

  const packetId = extractDecisionPacketId(event)
    || toStringOrNull(packetFromPayload?.id)
    || toStringOrNull(event.entity?.entity_type === 'candidate' ? event.entity?.entity_id : null);
  if (!packetId) return null;

  const explicitStatus = packetFromPayload?.status;
  const status = statusFromEventType(event.event_type, explicitStatus);
  if (!status) return null;

  const symbol = (
    toStringOrNull(packetFromPayload?.symbol)
    || toStringOrNull(planPayload?.symbol)
    || toStringOrNull(payload?.symbol)
    || toStringOrNull(event.entity?.symbol)
    || ''
  ).toUpperCase();
  if (!symbol) return null;

  const setup = (planPayload?.setup as Record<string, unknown> | undefined) || {};
  const risk = (planPayload?.risk as Record<string, unknown> | undefined) || {};
  const entryZone = toFiniteOrNull(packetFromPayload?.entryZone)
    ?? toFiniteOrNull(setup?.entry_zone)
    ?? toFiniteOrNull(setup?.entryZone)
    ?? toFiniteOrNull((planPayload?.entry as Record<string, unknown> | undefined)?.zone);
  const invalidation = toFiniteOrNull(packetFromPayload?.invalidation)
    ?? toFiniteOrNull(setup?.invalidation)
    ?? toFiniteOrNull(risk?.invalidation);

  return {
    packetId,
    status,
    symbol,
    workflowId: toStringOrNull(event.correlation?.workflow_id),
    market: toMarket(packetFromPayload?.market) || toMarket(event.entity?.asset_class),
    signalSource: toStringOrNull(packetFromPayload?.signalSource)
      || toStringOrNull(setup?.source)
      || toStringOrNull(setup?.signal_type)
      || toStringOrNull(event.context?.page?.module),
    signalScore: toFiniteOrNull(packetFromPayload?.signalScore),
    bias: toStringOrNull(packetFromPayload?.bias) || toStringOrNull(setup?.bias),
    timeframeBias: toStringArray(packetFromPayload?.timeframeBias),
    entryZone,
    invalidation,
    targets: toNumberArray(packetFromPayload?.targets || setup?.targets || risk?.targets),
    riskScore: toFiniteOrNull(packetFromPayload?.riskScore) ?? toFiniteOrNull(risk?.risk_score),
    volatilityRegime: toStringOrNull(packetFromPayload?.volatilityRegime),
    operatorFit: toFiniteOrNull(packetFromPayload?.operatorFit),
    eventId: event.event_id,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    sourcePayload: payload,
  };
}

async function persistDecisionPacketMutation(workspaceId: string, mutation: DecisionPacketMutation) {
  const fingerprint = buildDecisionPacketFingerprint({
    symbol: mutation.symbol,
    signalSource: mutation.signalSource,
    bias: mutation.bias,
    timeframeBias: mutation.timeframeBias,
    entryZone: mutation.entryZone,
    invalidation: mutation.invalidation,
    riskScore: mutation.riskScore,
  });

  const existingRows = await q<{ packet_id: string; status: DecisionPacketStatus }>(
    `SELECT packet_id, status
     FROM decision_packets
     WHERE workspace_id = $1
       AND (packet_id = $2 OR fingerprint = $3)
     ORDER BY CASE WHEN packet_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [workspaceId, mutation.packetId, fingerprint]
  );

  const canonicalId = existingRows[0]?.packet_id || mutation.packetId;
  const resolvedStatus = advanceStatus(existingRows[0]?.status, mutation.status);

  await q(
    `INSERT INTO decision_packets (
      workspace_id, packet_id, fingerprint, symbol, market, signal_source, signal_score, bias,
      timeframe_bias, entry_zone, invalidation, targets, risk_score, volatility_regime, operator_fit,
      status, workflow_id, first_event_id, last_event_id, last_event_type, source_event_count, metadata, created_at, updated_at,
      candidate_event_id, planned_event_id, alerted_event_id, executed_event_id, closed_event_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15,
      $16, $17, $18, $18, $19, 1, $20::jsonb, $21::timestamptz, NOW(),
      CASE WHEN $16 = 'candidate' THEN $18 ELSE NULL END,
      CASE WHEN $16 = 'planned' THEN $18 ELSE NULL END,
      CASE WHEN $16 = 'alerted' THEN $18 ELSE NULL END,
      CASE WHEN $16 = 'executed' THEN $18 ELSE NULL END,
      CASE WHEN $16 = 'closed' THEN $18 ELSE NULL END
    )
    ON CONFLICT (workspace_id, packet_id) DO UPDATE
    SET
      fingerprint = EXCLUDED.fingerprint,
      symbol = COALESCE(EXCLUDED.symbol, decision_packets.symbol),
      market = COALESCE(EXCLUDED.market, decision_packets.market),
      signal_source = COALESCE(EXCLUDED.signal_source, decision_packets.signal_source),
      signal_score = COALESCE(EXCLUDED.signal_score, decision_packets.signal_score),
      bias = COALESCE(EXCLUDED.bias, decision_packets.bias),
      timeframe_bias = CASE
        WHEN jsonb_array_length(EXCLUDED.timeframe_bias) > 0 THEN EXCLUDED.timeframe_bias
        ELSE decision_packets.timeframe_bias
      END,
      entry_zone = COALESCE(EXCLUDED.entry_zone, decision_packets.entry_zone),
      invalidation = COALESCE(EXCLUDED.invalidation, decision_packets.invalidation),
      targets = CASE
        WHEN EXCLUDED.targets IS NOT NULL AND EXCLUDED.targets <> '[]'::jsonb THEN EXCLUDED.targets
        ELSE decision_packets.targets
      END,
      risk_score = COALESCE(EXCLUDED.risk_score, decision_packets.risk_score),
      volatility_regime = COALESCE(EXCLUDED.volatility_regime, decision_packets.volatility_regime),
      operator_fit = COALESCE(EXCLUDED.operator_fit, decision_packets.operator_fit),
      status = CASE
        WHEN decision_packets.status = 'closed' THEN 'closed'
        WHEN EXCLUDED.status = 'closed' THEN 'closed'
        WHEN decision_packets.status = 'executed' AND EXCLUDED.status IN ('candidate', 'planned', 'alerted') THEN decision_packets.status
        WHEN decision_packets.status = 'alerted' AND EXCLUDED.status IN ('candidate', 'planned') THEN decision_packets.status
        WHEN decision_packets.status = 'planned' AND EXCLUDED.status = 'candidate' THEN decision_packets.status
        ELSE EXCLUDED.status
      END,
      workflow_id = COALESCE(EXCLUDED.workflow_id, decision_packets.workflow_id),
      last_event_id = EXCLUDED.last_event_id,
      last_event_type = EXCLUDED.last_event_type,
      source_event_count = decision_packets.source_event_count + 1,
      metadata = decision_packets.metadata || EXCLUDED.metadata,
      updated_at = NOW(),
      candidate_event_id = COALESCE(decision_packets.candidate_event_id, EXCLUDED.candidate_event_id),
      planned_event_id = COALESCE(decision_packets.planned_event_id, EXCLUDED.planned_event_id),
      alerted_event_id = COALESCE(decision_packets.alerted_event_id, EXCLUDED.alerted_event_id),
      executed_event_id = COALESCE(decision_packets.executed_event_id, EXCLUDED.executed_event_id),
      closed_event_id = COALESCE(decision_packets.closed_event_id, EXCLUDED.closed_event_id)`,
    [
      workspaceId,
      canonicalId,
      fingerprint,
      mutation.symbol,
      mutation.market,
      mutation.signalSource,
      mutation.signalScore,
      mutation.bias,
      JSON.stringify(mutation.timeframeBias),
      mutation.entryZone,
      mutation.invalidation,
      JSON.stringify(mutation.targets),
      mutation.riskScore,
      mutation.volatilityRegime,
      mutation.operatorFit,
      resolvedStatus,
      mutation.workflowId,
      mutation.eventId,
      mutation.eventType,
      JSON.stringify({ lastOccurredAt: mutation.occurredAt }),
      mutation.occurredAt,
    ]
  );

  await q(
    `INSERT INTO decision_packet_aliases (workspace_id, alias_id, packet_id, first_seen_at, last_seen_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (workspace_id, alias_id)
     DO UPDATE SET packet_id = EXCLUDED.packet_id, last_seen_at = NOW()`,
    [workspaceId, mutation.packetId, canonicalId]
  );

  if (mutation.packetId !== canonicalId) {
    await q(
      `INSERT INTO decision_packet_aliases (workspace_id, alias_id, packet_id, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (workspace_id, alias_id)
       DO UPDATE SET packet_id = EXCLUDED.packet_id, last_seen_at = NOW()`,
      [workspaceId, canonicalId, canonicalId]
    );
  }

  return { canonicalId, status: resolvedStatus };
}

async function autoCreatePlanAlertForEvent(workspaceId: string, event: MSPEvent, runtime: RiskGovernorRuntime) {
  if (event.event_type !== 'trade.plan.created') {
    return { created: false, hasAlert: false, decisionPacketId: null as string | null, blockedEvent: null as MSPEvent | null };
  }

  const payload = event.payload as Record<string, any>;
  const planPayload = getPlanPayload(payload);
  const planId = String(planPayload?.plan_id || event.entity?.entity_id || '').trim();
  const symbol = String(planPayload?.symbol || event.entity?.symbol || '').trim().toUpperCase();
  if (!planId || !symbol) {
    return { created: false, hasAlert: false, decisionPacketId: null as string | null, blockedEvent: null as MSPEvent | null };
  }

  const workflowId = event.correlation?.workflow_id;
  if (!workflowId) {
    return { created: false, hasAlert: false, decisionPacketId: null as string | null, blockedEvent: null as MSPEvent | null };
  }
  const decisionPacketId = extractDecisionPacketId(event);

  const planRiskScore = toFiniteNumber((planPayload?.risk as Record<string, unknown> | undefined)?.risk_score);
  const policyDecision = evaluateAutoAlertPolicy(
    {
      riskEnvironment: runtime.riskEnvironment,
      cognitiveLoad: runtime.cognitiveLoad,
      autoAlertsLastHour: runtime.autoAlertsLastHour,
      autoAlertsToday: runtime.autoAlertsToday,
      planRiskScore,
    },
    runtime.thresholds
  );

  if (!policyDecision.allowed) {
    const blockedEvent = createRiskGovernorEvent({
      workflowId,
      parentEventId: event.event_id,
      eventType: 'auto_alert.blocked',
      reasonCode: policyDecision.reasonCode || 'policy_blocked',
      reason: policyDecision.reason || 'Auto alert blocked by policy.',
      decisionPacketId,
      symbol,
      context: {
        planId,
        planRiskScore,
        riskEnvironment: runtime.riskEnvironment,
        cognitiveLoad: runtime.cognitiveLoad,
        autoAlertsLastHour: runtime.autoAlertsLastHour,
        autoAlertsToday: runtime.autoAlertsToday,
      },
    });

    return { created: false, hasAlert: false, decisionPacketId, blockedEvent };
  }

  const existing = await q(
    `SELECT id FROM alerts
     WHERE workspace_id = $1
       AND is_active = true
       AND is_smart_alert = true
       AND smart_alert_context->>'workflowId' = $2
       AND smart_alert_context->>'planId' = $3
     LIMIT 1`,
    [workspaceId, workflowId, planId]
  );

  if (existing.length > 0) {
    return { created: false, hasAlert: true, decisionPacketId, blockedEvent: null as MSPEvent | null };
  }

  const alertPrice = extractPlanAlertPrice(event);
  const timeframe = typeof planPayload?.timeframe === 'string' ? planPayload.timeframe : null;
  const alertContext = {
    source: 'workflow.auto',
    autoGenerated: true,
    workflowId,
    parentEventId: event.event_id,
    planId,
    decisionPacketId,
    eventType: event.event_type,
  };

  await q(
    `INSERT INTO alerts (
      workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
      name, notes, is_active, is_recurring, notify_email, notify_push,
      is_smart_alert, smart_alert_context, cooldown_minutes
    ) VALUES (
      $1, $2, $3, 'price_above', $4, $5,
      $6, $7, true, true, false, true,
      true, $8::jsonb, 60
    )`,
    [
      workspaceId,
      symbol,
      normalizeAlertAssetType(event.entity?.asset_class),
      alertPrice,
      timeframe,
      `MSP Auto Plan Alert • ${symbol}`,
      `Auto-generated from workflow plan ${planId}`,
      JSON.stringify(alertContext),
    ]
  );

  runtime.autoAlertsLastHour += 1;
  runtime.autoAlertsToday += 1;

  return { created: true, hasAlert: true, decisionPacketId, blockedEvent: null as MSPEvent | null };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCandidateCreatedEvent(event: MSPEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  if (!payload || typeof payload !== 'object') {
    return 'Invalid candidate.created payload';
  }

  const candidateId = payload.candidate_id;
  const signalId = payload.signal_id;
  const evaluatedAt = payload.evaluated_at;
  const result = payload.result;
  const finalConfidence = payload.final_confidence;
  const checks = payload.checks;
  const decisionPacket = payload.decision_packet as Record<string, unknown> | undefined;

  if (typeof candidateId !== 'string' || !candidateId.trim()) return 'candidate.created missing candidate_id';
  if (typeof signalId !== 'string' || !signalId.trim()) return 'candidate.created missing signal_id';
  if (typeof evaluatedAt !== 'string' || !evaluatedAt.trim()) return 'candidate.created missing evaluated_at';
  if (result !== 'pass' && result !== 'fail' && result !== 'watch') return 'candidate.created has invalid result';
  if (!isFiniteNumber(finalConfidence)) return 'candidate.created missing final_confidence';
  if (!Array.isArray(checks)) return 'candidate.created missing checks';
  if (!decisionPacket || typeof decisionPacket !== 'object') return 'candidate.created missing decision_packet';

  const packetId = decisionPacket.id;
  const packetSymbol = decisionPacket.symbol;
  const packetCreatedAt = decisionPacket.createdAt;
  const packetSignalSource = decisionPacket.signalSource;
  const packetSignalScore = decisionPacket.signalScore;
  const packetBias = decisionPacket.bias;
  const packetTimeframeBias = decisionPacket.timeframeBias;
  const packetRiskScore = decisionPacket.riskScore;
  const packetStatus = decisionPacket.status;

  if (typeof packetId !== 'string' || !packetId.trim()) return 'decision_packet missing id';
  if (typeof packetSymbol !== 'string' || !packetSymbol.trim()) return 'decision_packet missing symbol';
  if (typeof packetCreatedAt !== 'string' || !packetCreatedAt.trim()) return 'decision_packet missing createdAt';
  if (typeof packetSignalSource !== 'string' || !packetSignalSource.trim()) return 'decision_packet missing signalSource';
  if (!isFiniteNumber(packetSignalScore)) return 'decision_packet missing signalScore';
  if (packetBias !== 'bullish' && packetBias !== 'bearish' && packetBias !== 'neutral') return 'decision_packet has invalid bias';
  if (!Array.isArray(packetTimeframeBias)) return 'decision_packet missing timeframeBias';
  if (!isFiniteNumber(packetRiskScore)) return 'decision_packet missing riskScore';
  if (packetStatus !== 'candidate' && packetStatus !== 'planned' && packetStatus !== 'alerted' && packetStatus !== 'executed' && packetStatus !== 'closed') {
    return 'decision_packet has invalid status';
  }

  return null;
}

function normalizeEvent(raw: MSPEvent): MSPEvent {
  const nowIso = new Date().toISOString();

  return {
    ...raw,
    event_id: raw.event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event_version: Number.isFinite(raw.event_version) ? raw.event_version : 1,
    occurred_at: raw.occurred_at || nowIso,
    actor: {
      actor_type: raw.actor?.actor_type || 'user',
      user_id: raw.actor?.user_id ?? null,
      anonymous_id: raw.actor?.anonymous_id ?? null,
      session_id: raw.actor?.session_id ?? null,
    },
    context: {
      tenant_id: raw.context?.tenant_id || 'msp',
      app: {
        name: raw.context?.app?.name || 'MarketScannerPros',
        env: raw.context?.app?.env || 'prod',
        build: raw.context?.app?.build,
      },
      page: raw.context?.page || {},
      device: raw.context?.device || {},
      geo: raw.context?.geo || {},
    },
    correlation: {
      workflow_id: raw.correlation?.workflow_id || `wf_${Date.now()}`,
      trace_id: raw.correlation?.trace_id,
      parent_event_id: raw.correlation?.parent_event_id ?? null,
    },
    payload: raw.payload || {},
  };
}

async function ensureJournalSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      trade_date DATE NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
      trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin')),
      option_type VARCHAR(10),
      strike_price DECIMAL(18, 8),
      expiration_date DATE,
      quantity DECIMAL(18, 8) NOT NULL,
      entry_price DECIMAL(18, 8) NOT NULL,
      exit_price DECIMAL(18, 8),
      exit_date DATE,
      pl DECIMAL(18, 8),
      pl_percent DECIMAL(10, 4),
      strategy VARCHAR(100),
      setup VARCHAR(100),
      notes TEXT,
      emotions TEXT,
      outcome VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),
      tags TEXT[],
      is_open BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON journal_entries (workspace_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (workspace_id, trade_date DESC)`);

  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4)`);
}

async function autoCreateJournalDraftForEvent(workspaceId: string, event: MSPEvent) {
  if (event.event_type !== 'trade.plan.created') return false;

  const payload = event.payload as Record<string, any>;
  const planPayload = getPlanPayload(payload);
  const planId = String(planPayload?.plan_id || event.entity?.entity_id || '').trim();
  const symbol = String(planPayload?.symbol || event.entity?.symbol || '').trim().toUpperCase();
  if (!planId || !symbol) return false;

  const workflowId = event.correlation?.workflow_id;
  if (!workflowId) return false;
  const decisionPacketId = extractDecisionPacketId(event);

  await ensureJournalSchema();

  const planTag = `plan_${planId}`;
  const dedupe = await q(
    `SELECT id FROM journal_entries
     WHERE workspace_id = $1
       AND symbol = $2
       AND is_open = true
       AND outcome = 'open'
       AND (
         COALESCE(tags, ARRAY[]::text[]) @> ARRAY[$3]::text[]
         OR notes ILIKE $4
       )
     LIMIT 1`,
    [workspaceId, symbol, planTag, `%${planId}%`]
  );

  if (dedupe.length > 0) return false;

  const direction = String(planPayload?.direction || '').toLowerCase();
  const side = direction === 'short' ? 'SHORT' : 'LONG';
  const tradeDate = new Date().toISOString().slice(0, 10);
  const entryPrice = extractPlanAlertPrice(event);

  const setupSource = String(planPayload?.setup?.source || planPayload?.setup?.signal_type || 'scanner.plan').slice(0, 100);
  const strategy = String(planPayload?.setup?.signal_type || 'confluence_scan').slice(0, 100);
  const notes = [
    'Auto-created from trade plan event.',
    `Workflow: ${workflowId}`,
    `Plan: ${planId}`,
    `Decision Packet: ${decisionPacketId || 'n/a'}`,
    `Source: ${setupSource}`,
    `Direction: ${direction || 'neutral'}`,
    `Risk Score: ${planPayload?.risk?.risk_score ?? 'n/a'}`,
  ].join('\n');

  const tags = ['auto_plan_draft', `workflow_${workflowId}`, planTag];
  if (decisionPacketId) {
    tags.push(`dp_${decisionPacketId}`);
  }

  await q(
    `INSERT INTO journal_entries (
      workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
      strategy, setup, notes, emotions, outcome, tags, is_open
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14
    )`,
    [
      workspaceId,
      tradeDate,
      symbol,
      side,
      'Spot',
      1,
      entryPrice,
      strategy,
      setupSource,
      notes,
      '',
      'open',
      tags,
      true,
    ]
  );

  return true;
}

function buildCoachRecommendations(args: {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  sampleSize: number;
}): Array<Record<string, unknown>> {
  const recommendations: Array<Record<string, unknown>> = [];

  if (args.sampleSize < 5) {
    recommendations.push({
      priority: 'high',
      action: 'increase_sample_size',
      detail: 'Collect at least 5-10 closed trades before adjusting strategy parameters.',
    });
  }

  if (args.avgLoss > 0 && args.avgWin > 0 && args.avgWin < args.avgLoss) {
    recommendations.push({
      priority: 'high',
      action: 'improve_reward_to_risk',
      detail: 'Average loss is larger than average win. Tighten invalidation or extend target structure.',
    });
  }

  if (args.winRate < 45) {
    recommendations.push({
      priority: 'medium',
      action: 'tighten_entry_filter',
      detail: 'Win rate is below 45%. Increase selectivity on setup quality before execution.',
    });
  }

  if (args.expectancy > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'keep_size_consistent',
      detail: 'Expectancy is positive. Keep sizing stable and avoid emotional scaling.',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: 'medium',
      action: 'continue_process_discipline',
      detail: 'Maintain process consistency and review another batch after additional closures.',
    });
  }

  return recommendations;
}

async function autoGenerateCoachEventForClosedTrade(workspaceId: string, event: MSPEvent): Promise<MSPEvent | null> {
  if (event.event_type !== 'trade.closed') return null;

  const workflowId = event.correlation?.workflow_id;
  if (!workflowId) return null;

  const alreadyGenerated = await q(
    `SELECT id FROM ai_events
     WHERE workspace_id = $1
       AND event_type = 'coach.analysis.generated'
       AND event_data->'correlation'->>'parent_event_id' = $2
     LIMIT 1`,
    [workspaceId, event.event_id]
  );

  if (alreadyGenerated.length > 0) return null;

  const recentClosed = await q(
    `SELECT pl, outcome
     FROM journal_entries
     WHERE workspace_id = $1
       AND is_open = false
     ORDER BY COALESCE(exit_date, trade_date) DESC NULLS LAST
     LIMIT 20`,
    [workspaceId]
  );

  const sampleSize = recentClosed.length;
  const wins = recentClosed.filter((row: any) => Number(row.pl || 0) > 0 || row.outcome === 'win');
  const losses = recentClosed.filter((row: any) => Number(row.pl || 0) < 0 || row.outcome === 'loss');
  const winRate = sampleSize > 0 ? (wins.length / sampleSize) * 100 : 0;
  const avgWin = wins.length > 0
    ? wins.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.pl || 0)), 0) / wins.length
    : 0;
  const avgLoss = losses.length > 0
    ? Math.abs(losses.reduce((sum: number, row: any) => sum + Math.min(0, Number(row.pl || 0)), 0) / losses.length)
    : 0;
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  const payload = event.payload as Record<string, any>;
  const tradeId = String(payload?.trade_id || event.entity?.entity_id || '').trim();
  const analysisId = `coach_${tradeId || Date.now()}`;

  return normalizeEvent({
    event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event_type: 'coach.analysis.generated',
    event_version: 1,
    occurred_at: new Date().toISOString(),
    actor: {
      actor_type: 'system',
      user_id: null,
      anonymous_id: null,
      session_id: null,
    },
    context: {
      tenant_id: event.context?.tenant_id || 'msp',
      app: {
        name: event.context?.app?.name || 'MarketScannerPros',
        env: event.context?.app?.env || 'prod',
        build: event.context?.app?.build,
      },
      page: {
        route: '/tools/journal',
        module: 'coach_engine',
      },
      device: {},
      geo: {},
    },
    entity: {
      entity_type: 'coach',
      entity_id: analysisId,
      symbol: event.entity?.symbol,
      asset_class: event.entity?.asset_class,
    },
    correlation: {
      workflow_id: workflowId,
      parent_event_id: event.event_id,
    },
    payload: {
      analysis_id: analysisId,
      created_at: new Date().toISOString(),
      scope: 'post_trade_close',
      inputs: {
        trade_id: tradeId || null,
        source_event_id: event.event_id,
      },
      summary: {
        sample_size: sampleSize,
        win_rate: Number(winRate.toFixed(2)),
        avg_win: Number(avgWin.toFixed(2)),
        avg_loss: Number(avgLoss.toFixed(2)),
        expectancy: Number(expectancy.toFixed(2)),
      },
      recommendations: buildCoachRecommendations({
        winRate,
        avgWin,
        avgLoss,
        expectancy,
        sampleSize,
      }),
      links: {
        trade_id: tradeId || null,
        decision_packet_id: extractDecisionPacketId(event),
      },
    },
  });
}

async function attachCoachSummaryToJournalDraft(workspaceId: string, coachEvent: MSPEvent): Promise<boolean> {
  if (coachEvent.event_type !== 'coach.analysis.generated') return false;

  const workflowId = coachEvent.correlation?.workflow_id;
  if (!workflowId) return false;

  const payload = coachEvent.payload as Record<string, any>;
  const analysisId = String(payload?.analysis_id || '').trim();
  if (!analysisId) return false;

  const workflowTag = `workflow_${workflowId}`;
  const draftRows = await q(
    `SELECT id, notes
     FROM journal_entries
     WHERE workspace_id = $1
       AND is_open = true
       AND outcome = 'open'
       AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY[$2]::text[]
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, workflowTag]
  );

  if (draftRows.length === 0) return false;

  const draft = draftRows[0] as { id: number; notes?: string | null };
  const existingNotes = String(draft.notes || '');
  if (existingNotes.includes(`Coach Analysis ID: ${analysisId}`)) {
    return false;
  }

  const summary = payload?.summary as Record<string, any> | undefined;
  const recommendations = Array.isArray(payload?.recommendations)
    ? (payload.recommendations as Array<Record<string, any>>)
    : [];

  const lines = [
    '',
    '---',
    'AI Coach Auto-Analysis',
    `Coach Analysis ID: ${analysisId}`,
    `Win Rate: ${summary?.win_rate ?? 'n/a'}%`,
    `Avg Win: ${summary?.avg_win ?? 'n/a'}`,
    `Avg Loss: ${summary?.avg_loss ?? 'n/a'}`,
    `Expectancy: ${summary?.expectancy ?? 'n/a'}`,
    ...recommendations.slice(0, 3).map((item, idx) => {
      const action = String(item?.action || 'action');
      const detail = String(item?.detail || '');
      return `Recommendation ${idx + 1}: ${action}${detail ? ` — ${detail}` : ''}`;
    }),
  ];

  const mergedNotes = `${existingNotes}${lines.join('\n')}`.trim();

  await q(
    `UPDATE journal_entries
     SET notes = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [draft.id, mergedNotes]
  );

  return true;
}

async function autoCreateCoachActionTaskEvents(
  workspaceId: string,
  coachEvent: MSPEvent
): Promise<MSPEvent[]> {
  if (coachEvent.event_type !== 'coach.analysis.generated') return [];

  const workflowId = coachEvent.correlation?.workflow_id;
  if (!workflowId) return [];

  const payload = coachEvent.payload as Record<string, any>;
  const analysisId = String(payload?.analysis_id || '').trim();
  if (!analysisId) return [];

  const recommendations = Array.isArray(payload?.recommendations)
    ? (payload.recommendations as Array<Record<string, any>>)
    : [];

  if (!recommendations.length) return [];

  const existingRows = await q(
    `SELECT event_data->'payload'->>'action' AS action
     FROM ai_events
     WHERE workspace_id = $1
       AND event_type = 'strategy.rule.suggested'
       AND event_data->'correlation'->>'parent_event_id' = $2`,
    [workspaceId, coachEvent.event_id]
  );

  const existingActions = new Set(
    existingRows
      .map((row: any) => String(row?.action || '').trim())
      .filter((action: string) => action.length > 0)
  );

  const taskEvents: MSPEvent[] = [];
  for (const [index, recommendation] of recommendations.slice(0, 3).entries()) {
    const action = String(recommendation?.action || '').trim();
    if (!action || existingActions.has(action)) continue;

    const taskId = `task_${analysisId}_${index + 1}`;
    const detail = String(recommendation?.detail || '').trim();
    const priority = String(recommendation?.priority || 'medium').toLowerCase();

    taskEvents.push(
      normalizeEvent({
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        event_type: 'strategy.rule.suggested',
        event_version: 1,
        occurred_at: new Date().toISOString(),
        actor: {
          actor_type: 'system',
          user_id: null,
          anonymous_id: null,
          session_id: null,
        },
        context: {
          tenant_id: coachEvent.context?.tenant_id || 'msp',
          app: {
            name: coachEvent.context?.app?.name || 'MarketScannerPros',
            env: coachEvent.context?.app?.env || 'prod',
            build: coachEvent.context?.app?.build,
          },
          page: {
            route: '/operator',
            module: 'coach_task_engine',
          },
          device: {},
          geo: {},
        },
        entity: {
          entity_type: 'coach',
          entity_id: taskId,
          symbol: coachEvent.entity?.symbol,
          asset_class: coachEvent.entity?.asset_class,
        },
        correlation: {
          workflow_id: workflowId,
          parent_event_id: coachEvent.event_id,
        },
        payload: {
          task_id: taskId,
          source_analysis_id: analysisId,
          action,
          detail,
          priority,
          status: 'pending',
          suggested_at: new Date().toISOString(),
        },
      })
    );
  }

  return taskEvents;
}

async function projectOperatorStateFromPackets(workspaceId: string) {
  const rows = await q<{
    symbol: string;
    status: string;
    risk_score: number | null;
    operator_fit: number | null;
    updated_at: string;
  }>(
    `SELECT
       symbol,
       status,
       risk_score,
       operator_fit,
       updated_at
     FROM decision_packets
     WHERE workspace_id = $1
       AND status IN ('candidate', 'planned', 'alerted', 'executed')
     ORDER BY updated_at DESC
     LIMIT 8`,
    [workspaceId]
  );

  const activeCandidates = rows.map((row) => ({
    symbol: String(row.symbol || '').toUpperCase(),
    status: String(row.status || 'candidate'),
    riskScore: Number(row.risk_score ?? 0),
    operatorFit: Number(row.operator_fit ?? 0),
    updatedAt: row.updated_at,
  }));

  const currentFocus = activeCandidates[0]?.symbol || null;
  const plannedOrHigher = activeCandidates.filter((item) => ['planned', 'alerted', 'executed'].includes(item.status)).length;
  const alertedOrHigher = activeCandidates.filter((item) => ['alerted', 'executed'].includes(item.status)).length;
  const avgRisk = activeCandidates.length
    ? activeCandidates.reduce((sum, item) => sum + item.riskScore, 0) / activeCandidates.length
    : 0;

  const riskEnvironment = alertedOrHigher >= 3 || avgRisk >= 75
    ? 'overloaded'
    : plannedOrHigher >= 2 || avgRisk >= 60
    ? 'elevated'
    : 'normal';

  const cognitiveLoad = Math.max(0, Math.min(100, Math.round(plannedOrHigher * 18 + alertedOrHigher * 22 + avgRisk * 0.45)));
  const aiAttentionScore = Math.max(0, Math.min(100, Math.round(activeCandidates.length * 12 + plannedOrHigher * 15 + alertedOrHigher * 18)));

  await q(
    `INSERT INTO operator_state (
      workspace_id, current_focus, active_candidates, risk_environment, ai_attention_score,
      cognitive_load, context_state, source_module, updated_at
    ) VALUES (
      $1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8, NOW()
    )
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      current_focus = EXCLUDED.current_focus,
      active_candidates = EXCLUDED.active_candidates,
      risk_environment = EXCLUDED.risk_environment,
      ai_attention_score = EXCLUDED.ai_attention_score,
      cognitive_load = EXCLUDED.cognitive_load,
      context_state = operator_state.context_state || EXCLUDED.context_state,
      source_module = EXCLUDED.source_module,
      updated_at = NOW()`,
    [
      workspaceId,
      currentFocus,
      JSON.stringify(activeCandidates),
      riskEnvironment,
      aiAttentionScore,
      cognitiveLoad,
      JSON.stringify({
        source: 'workflow.events',
        projectedAt: new Date().toISOString(),
        plannedOrHigher,
        alertedOrHigher,
        avgRisk: Number(avgRisk.toFixed(2)),
      }),
      'workflow.events',
    ]
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const events = Array.isArray(body?.events) ? (body.events as MSPEvent[]) : [];

    if (!events.length) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    const normalized = events.slice(0, 100).map(normalizeEvent);
    const riskGovernorRuntime = await createRiskGovernorRuntime(session.workspaceId);

    for (const event of normalized) {
      if (!ALLOWED_EVENT_TYPES.has(event.event_type)) {
        return NextResponse.json({ error: `Unsupported event type: ${event.event_type}` }, { status: 400 });
      }
      if (!event.event_id || !event.correlation?.workflow_id) {
        return NextResponse.json({ error: 'Invalid envelope: missing event_id/workflow_id' }, { status: 400 });
      }

      if (event.event_type === 'candidate.created') {
        const candidateError = validateCandidateCreatedEvent(event);
        if (candidateError) {
          return NextResponse.json({ error: candidateError }, { status: 400 });
        }
      }

      if (event.event_type === 'trade.executed') {
        const systemExecutionDecision = evaluateSystemExecutionPolicy(
          {
            isSystemActor: event.actor?.actor_type === 'system',
            executionOptIn: riskGovernorRuntime.executionOptIn,
          },
          riskGovernorRuntime.thresholds
        );

        if (!systemExecutionDecision.allowed) {
          const blockedEvent = createRiskGovernorEvent({
            workflowId: event.correlation.workflow_id,
            parentEventId: event.event_id,
            eventType: 'execution.blocked',
            reasonCode: systemExecutionDecision.reasonCode || 'execution_blocked',
            reason: systemExecutionDecision.reason || 'Execution blocked by risk governor.',
            decisionPacketId: extractDecisionPacketId(event),
            symbol: event.entity?.symbol || null,
          });

          await q(
            `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
             VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
            [
              session.workspaceId,
              blockedEvent.event_type,
              JSON.stringify(blockedEvent),
              JSON.stringify(blockedEvent.context?.page || {}),
              blockedEvent.actor?.session_id || null,
            ]
          );

          return NextResponse.json({
            error: systemExecutionDecision.reason || 'System execution automation requires explicit opt-in.',
            reasonCode: systemExecutionDecision.reasonCode,
          }, { status: 403 });
        }
      }
    }

    let autoAlertsCreated = 0;
    let autoJournalDraftsCreated = 0;
    let autoCoachJournalUpdates = 0;
    let autoCoachActionTasksCreated = 0;
    let decisionPacketsUpserted = 0;
    let riskGovernorBlocks = 0;
    const alertTransitionPacketIds = new Set<string>();
    const autoCoachEvents: MSPEvent[] = [];
    const autoCoachTaskEvents: MSPEvent[] = [];
    const riskGovernorEvents: MSPEvent[] = [];
    for (const event of normalized) {
      const autoAlertResult = await autoCreatePlanAlertForEvent(session.workspaceId, event, riskGovernorRuntime);
      if (autoAlertResult.created) {
        autoAlertsCreated += 1;
      }
      if (autoAlertResult.blockedEvent) {
        riskGovernorEvents.push(autoAlertResult.blockedEvent);
        riskGovernorBlocks += 1;
      }
      if (autoAlertResult.hasAlert && autoAlertResult.decisionPacketId) {
        alertTransitionPacketIds.add(autoAlertResult.decisionPacketId);
      }
      if (await autoCreateJournalDraftForEvent(session.workspaceId, event)) {
        autoJournalDraftsCreated += 1;
      }

      const coachEvent = await autoGenerateCoachEventForClosedTrade(session.workspaceId, event);
      if (coachEvent) {
        autoCoachEvents.push(coachEvent);

        const taskEvents = await autoCreateCoachActionTaskEvents(session.workspaceId, coachEvent);
        if (taskEvents.length > 0) {
          autoCoachTaskEvents.push(...taskEvents);
          autoCoachActionTasksCreated += taskEvents.length;
        }

        if (await attachCoachSummaryToJournalDraft(session.workspaceId, coachEvent)) {
          autoCoachJournalUpdates += 1;
        }
      }
    }

    const eventsToPersist = [...normalized, ...autoCoachEvents, ...autoCoachTaskEvents, ...riskGovernorEvents];

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let index = 1;

    for (const event of eventsToPersist) {
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}::jsonb, $${index + 3}::jsonb, $${index + 4})`);
      values.push(
        session.workspaceId,
        event.event_type,
        JSON.stringify(event),
        JSON.stringify(event.context?.page || {}),
        event.actor?.session_id || null
      );
      index += 5;
    }

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    for (const event of normalized) {
      const mutation = buildDecisionPacketMutation(event);
      if (!mutation) continue;
      await persistDecisionPacketMutation(session.workspaceId, mutation);
      decisionPacketsUpserted += 1;
    }

    for (const packetId of alertTransitionPacketIds) {
      await q(
        `UPDATE decision_packets dp
         SET
           status = CASE
             WHEN dp.status IN ('executed', 'closed') THEN dp.status
             ELSE 'alerted'
           END,
           alerted_event_id = COALESCE(dp.alerted_event_id, dp.last_event_id),
           updated_at = NOW()
         WHERE dp.workspace_id = $1
           AND (
             dp.packet_id = $2
             OR dp.packet_id = (
               SELECT dpa.packet_id
               FROM decision_packet_aliases dpa
               WHERE dpa.workspace_id = $1
                 AND dpa.alias_id = $2
               LIMIT 1
             )
           )`,
        [session.workspaceId, packetId]
      );
      decisionPacketsUpserted += 1;
    }

    if (decisionPacketsUpserted > 0) {
      await projectOperatorStateFromPackets(session.workspaceId);
    }

    return NextResponse.json({
      success: true,
      eventsLogged: eventsToPersist.length,
      sourceEventsLogged: normalized.length,
      decisionPacketsUpserted,
      autoAlertsCreated,
      autoJournalDraftsCreated,
      autoCoachAnalysesGenerated: autoCoachEvents.length,
      autoCoachActionTasksCreated,
      autoCoachJournalUpdates,
      riskGovernorBlocks,
    });
  } catch (error) {
    console.error('Workflow events API error:', error);
    return NextResponse.json({ error: 'Failed to ingest workflow events' }, { status: 500 });
  }
}
