import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getRiskGovernorThresholdsFromEnv } from '@/lib/operator/riskGovernor';

type DecisionPacketRow = {
  packet_id: string;
  symbol: string | null;
  asset_class: string | null;
  status: string | null;
  signal_score: number | string | null;
  risk_score: number | string | null;
  metadata: Record<string, any> | string | null;
  updated_at: string;
  created_at: string;
};

type OperatorStateRow = {
  current_focus: string | null;
  risk_environment: string | null;
  cognitive_load: number | string | null;
  context_state: Record<string, any> | string | null;
};

type ActionKind =
  | 'alert.create'
  | 'plan.create'
  | 'journal.open'
  | 'trade.close'
  | 'focus.pin'
  | 'focus.snooze'
  | 'watchlist.add'
  | 'notify.send'
  | 'order.export';

const ASSIST_EXECUTE_WHITELIST = new Set<ActionKind>([
  'alert.create',
  'plan.create',
  'journal.open',
  'trade.close',
  'focus.pin',
  'focus.snooze',
  'watchlist.add',
  'notify.send',
  'order.export',
]);

function isMissingRelationError(error: unknown): boolean {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '').toLowerCase();
  return code === '42P01' || message.includes('relation') && message.includes('does not exist');
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseObj(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function riskMultiplier(riskEnvironment: string | null): number {
  const key = String(riskEnvironment || '').toLowerCase();
  if (key === 'high') return 0.65;
  if (key === 'medium') return 0.82;
  if (key === 'low') return 1;
  return 0.88;
}

function freshnessMultiplier(updatedAtIso: string): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return 0.6;
  const ageHours = Math.max(0, (Date.now() - updatedMs) / 3_600_000);
  return Math.max(0.35, Math.min(1, Math.exp(-ageHours / 24)));
}

function chooseActionType(status: string, signalScore: number, confidence: number): ActionKind {
  if (status === 'alerted') return 'journal.open';
  if (status === 'planned' && (signalScore >= 60 || confidence >= 0.62)) return 'alert.create';
  if (status === 'candidate' && signalScore >= 72 && confidence >= 0.6) return 'alert.create';
  return 'plan.create';
}

function mapLegacyAction(actionType: ActionKind): 'create_alert' | 'create_journal_draft' | 'create_plan_draft' | 'trade.close' {
  if (actionType === 'alert.create') return 'create_alert';
  if (actionType === 'journal.open') return 'create_journal_draft';
  if (actionType === 'trade.close') return 'trade.close';
  return 'create_plan_draft';
}

function getAssistExecutionBlockReason(args: {
  actionType: ActionKind;
  operatorState: OperatorStateRow;
  contextState: Record<string, any>;
  confidence: number;
  packetFit: number;
  freshness: number;
  score: number;
  cooldownBlocked: boolean;
}): string | null {
  const { actionType, operatorState, contextState, confidence, packetFit, freshness, score, cooldownBlocked } = args;
  const thresholds = getRiskGovernorThresholdsFromEnv();
  const riskEnvironment = String(operatorState.risk_environment || '').toLowerCase();
  const cognitiveLoad = num(operatorState.cognitive_load, 0);
  const brainState = String(
    contextState?.operatorBrain?.state
    || contextState?.adaptiveInputs?.operatorBrain?.state
    || ''
  ).toUpperCase();
  const heartbeatAt = Date.parse(String(contextState?.heartbeat?.lastAt || ''));
  const heartbeatAgeMs = Number.isFinite(heartbeatAt) ? Date.now() - heartbeatAt : Number.POSITIVE_INFINITY;

  if (!ASSIST_EXECUTE_WHITELIST.has(actionType)) {
    return 'Action is not whitelisted for Assist-Execute';
  }
  if (cooldownBlocked) {
    return 'Cooldown active for this action';
  }
  if (brainState === 'OVERLOADED') {
    return 'Operator brain is overloaded';
  }
  if (riskEnvironment === 'overloaded') {
    return 'Risk environment is overloaded';
  }
  if (cognitiveLoad > thresholds.maxCognitiveLoadForAutoActions) {
    return 'Cognitive load too high for Assist-Execute';
  }
  if (heartbeatAgeMs > 5 * 60_000) {
    return 'Context is stale; refresh heartbeat first';
  }
  if (confidence < 0.65) {
    return 'Confidence is below Assist-Execute threshold';
  }
  if (packetFit < 0.55) {
    return 'Operator fit is too weak for Assist-Execute';
  }
  if (freshness < 0.45) {
    return 'Signal freshness is too low';
  }
  if (score < 0.42) {
    return 'Proposal score is below execution threshold';
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') || 8)));

    let packets: DecisionPacketRow[] = [];
    let stateRows: OperatorStateRow[] = [];
    try {
      [packets, stateRows] = await Promise.all([
        q<DecisionPacketRow>(
          `SELECT packet_id, symbol, asset_class, status, signal_score, risk_score, metadata, updated_at, created_at
           FROM decision_packets
           WHERE workspace_id = $1
             AND updated_at >= NOW() - INTERVAL '7 days'
             AND status = ANY($2)
           ORDER BY updated_at DESC
           LIMIT 80`,
          [session.workspaceId, ['candidate', 'planned', 'alerted']]
        ),
        q<OperatorStateRow>(
          `SELECT current_focus, risk_environment, cognitive_load, context_state
           FROM operator_state
           WHERE workspace_id = $1
           LIMIT 1`,
          [session.workspaceId]
        ),
      ]);
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('[operator/proposals] missing operator tables; returning empty proposals');
        return NextResponse.json({
          success: true,
          proposals: [],
          context: {
            focus: null,
            riskEnvironment: 'unknown',
            totalCandidates: 0,
          },
          generatedAt: new Date().toISOString(),
        });
      }
      throw error;
    }

    const operatorState = stateRows[0] || { current_focus: null, risk_environment: null, cognitive_load: null, context_state: null };
    const contextState = parseObj(operatorState.context_state);
    const focus = String(operatorState.current_focus || contextState?.heartbeat?.attention?.primarySymbol || '').toUpperCase() || null;
    const riskEnv = operatorState.risk_environment;

    const scored = packets.map((packet) => {
      const signalScore = num(packet.signal_score, 0);
      const packetData = parseObj(packet.metadata);
      const confidenceRaw = num(packetData?.confidence, NaN);
      const confidence = Number.isFinite(confidenceRaw)
        ? confidenceRaw > 1
          ? Math.min(1, confidenceRaw / 100)
          : Math.max(0, Math.min(1, confidenceRaw))
        : Math.max(0, Math.min(1, signalScore / 100));

      const packetFitRaw = num(packetData?.operator_fit, NaN);
      const packetFit = Number.isFinite(packetFitRaw)
        ? packetFitRaw > 1
          ? Math.min(1, packetFitRaw / 100)
          : Math.max(0, Math.min(1, packetFitRaw))
        : 0.6;

      const symbol = String(packet.symbol || packetData?.symbol || '').toUpperCase() || null;
      const focusBoost = focus && symbol && focus === symbol ? 0.08 : 0;
      const freshness = freshnessMultiplier(packet.updated_at);
      const riskFactor = riskMultiplier(riskEnv);
      const score = (0.45 * confidence + 0.35 * packetFit + 0.2 * Math.min(1, signalScore / 100) + focusBoost) * freshness * riskFactor;

      const actionType = chooseActionType(String(packet.status || 'candidate'), signalScore, confidence);
      const legacyActionType = mapLegacyAction(actionType);
      const cooldownMins = actionType === 'alert.create' ? 45 : actionType === 'journal.open' ? 20 : 30;
      const now = Date.now();
      const cooldownKey = `proposal:${actionType}:${packet.packet_id}:${symbol || 'NA'}`;

      return {
        id: `proposal_${packet.packet_id}_${actionType}`,
        packetId: packet.packet_id,
        symbol,
        assetClass: packet.asset_class,
        status: packet.status,
        score: Number(score.toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        signalScore: Number(signalScore.toFixed(2)),
        actionType,
        requiredConfirm: true,
        action: {
          type: legacyActionType,
          payload: {
            symbol,
            packetId: packet.packet_id,
            confidence,
            signalScore,
            source: 'operator_proposals_v1',
          },
          mode: 'draft',
          requiresConfirm: true,
        },
        reasoning: {
          focus,
          riskEnvironment: riskEnv || 'unknown',
          freshness,
          packetFit,
        },
        cooldown: {
          key: cooldownKey,
          expiresAt: new Date(now + cooldownMins * 60_000).toISOString(),
        },
        updatedAt: packet.updated_at,
      };
    });

    const proposalIds = scored.map((proposal) => proposal.id);
    let cooldownRows: Array<{ proposal_id: string }> = [];
    if (proposalIds.length) {
      try {
        cooldownRows = await q<{ proposal_id: string }>(
          `SELECT proposal_id
           FROM operator_action_executions
           WHERE workspace_id = $1
             AND proposal_id = ANY($2)
             AND created_at >= NOW() - INTERVAL '90 minutes'`,
          [session.workspaceId, proposalIds]
        );
      } catch (error) {
        if (isMissingRelationError(error)) {
          console.warn('[operator/proposals] operator_action_executions missing; skipping cooldown checks');
          cooldownRows = [];
        } else {
          throw error;
        }
      }
    }
    const blockedByCooldown = new Set(cooldownRows.map((row) => row.proposal_id));

    const proposals = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((proposal, index) => {
        const cooldownBlocked = blockedByCooldown.has(proposal.id);
        const blockReason = getAssistExecutionBlockReason({
          actionType: proposal.actionType,
          operatorState,
          contextState,
          confidence: proposal.confidence,
          packetFit: proposal.reasoning.packetFit,
          freshness: proposal.reasoning.freshness,
          score: proposal.score,
          cooldownBlocked,
        });

        return {
          ...proposal,
          rank: index + 1,
          canAssistExecute: !blockReason,
          blockReason,
        };
      });

    return NextResponse.json({
      success: true,
      proposals,
      context: {
        focus,
        riskEnvironment: riskEnv || 'unknown',
        totalCandidates: packets.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[operator/proposals] GET error:', error);
    return NextResponse.json({
      success: true,
      proposals: [],
      context: {
        focus: null,
        riskEnvironment: 'unknown',
        totalCandidates: 0,
      },
      generatedAt: new Date().toISOString(),
      degraded: true,
      error: 'Operator proposals temporarily unavailable',
    });
  }
}