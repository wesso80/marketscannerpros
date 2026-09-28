import { q } from '@/lib/db';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
import { projectCandidate } from './decisionEngine';
import { listRegimeMatrix } from '@/lib/admin/arca-brain/regimePlaybookMatrix';
import { evaluateRegimePlaybook, type RegimePlaybookDecision } from '@/lib/admin/arca-brain/regimePlaybookDecision';
import type { RegimePlaybookMatrixRow } from '@/lib/admin/arca-brain/types';
import { MICRO_EVIDENCE_VERSION, MICRO_MAX_AGE_MS, MICRO_MIN_COVERAGE, MICRO_MIN_SYMBOLS } from '@/lib/upeMicroEvidence';

export interface PaperRegimeSnapshot {
  asset_class: string;
  micro_state: string;
  computed_at: string | Date;
  components_json: Record<string, unknown>;
}
export interface PaperRegimeContext {
  snapshots: PaperRegimeSnapshot[];
  policies: RegimePlaybookMatrixRow[];
}
/** Two cached database reads per cycle; never calls market-data providers. Errors propagate. */
export async function loadPaperRegimeContext(workspaceId: string): Promise<PaperRegimeContext> {
  const snapshots = await q<PaperRegimeSnapshot>(
    `SELECT DISTINCT ON (asset_class) asset_class, micro_state, components_json, computed_at
       FROM micro_regime_snapshots WHERE asset_class IN ('equity', 'crypto')
       ORDER BY asset_class, computed_at DESC`,
  );
  return { snapshots, policies: await listRegimeMatrix(workspaceId) };
}

export function assessPaperRegime(context: PaperRegimeContext, workspaceId: string, assetClass: string, playbook: string | null, nowMs = Date.now(), candidateRow?: EdgePacketRow): RegimePlaybookDecision {
  const snapshot = context.snapshots.find(s => s.asset_class === assetClass);
  const unknown = (reason: string): RegimePlaybookDecision => ({
    ...evaluateRegimePlaybook(null, playbook), reason, disqualifiers: [reason],
  });
  if (!snapshot) return unknown(`regime_evidence_missing:${assetClass}`);
  const c = snapshot.components_json ?? {};
  const computed = new Date(snapshot.computed_at).getTime();
  const source = typeof c.sourceOldestAt === 'string' ? Date.parse(c.sourceOldestAt) : NaN;
  if (c.evidenceVersion !== MICRO_EVIDENCE_VERSION || c.usable !== true ||
      typeof c.symbolCount !== 'number' || !Number.isFinite(c.symbolCount) || c.symbolCount < MICRO_MIN_SYMBOLS ||
      typeof c.coverage !== 'number' || !Number.isFinite(c.coverage) || c.coverage < MICRO_MIN_COVERAGE || c.coverage > 1) {
    return unknown(`regime_evidence_unverified_or_insufficient:${assetClass}`);
  }
  if (![source, computed].every(t => Number.isFinite(t) && t <= nowMs && nowMs - t <= MICRO_MAX_AGE_MS) || source > computed) {
    return unknown(`regime_evidence_stale_or_invalid:${assetClass}`);
  }
  if (!['risk_on', 'risk_off', 'neutral'].includes(snapshot.micro_state)) return unknown(`regime_label_unknown:${assetClass}`);
  // Exact, asset-scoped keys prevent an equity policy from silently authorizing crypto.
  // Never translate risk_on into RISK_ON_TREND: those are different claims.
  const key = `${assetClass}:${snapshot.micro_state}`;
  const policy = context.policies.find(p => p.workspaceId === workspaceId && p.regime === key);
  if (!policy) return { ...unknown(`regime_policy_missing:${key}`), regime: key };
  const confirmedConditions: string[] = [];
  if (candidateRow && candidateRow.assetClass === assetClass && candidateRow.setupType === playbook) {
    const projection = projectCandidate(candidateRow, nowMs);
    if (projection.ok) {
      confirmedConditions.push('position_levels_valid');
      if (projection.candidate.side === 'LONG') confirmedConditions.push('long_only');
    }
  }
  return evaluateRegimePlaybook(policy, playbook, { strict: true, assetClass, confirmedConditions });
}

export function paperRegimeSummary(context: PaperRegimeContext, workspaceId: string, nowMs = Date.now()) {
  return ['equity', 'crypto'].map(assetClass => {
    const snapshot = context.snapshots.find(s => s.asset_class === assetClass);
    const key = snapshot ? `${assetClass}:${snapshot.micro_state}` : null;
    const policy = context.policies.find(p => p.workspaceId === workspaceId && p.regime === key);
    const playbooks = [...new Set([...(policy?.enabledPlaybooks ?? []), ...(policy?.reducedSizePlaybooks ?? [])])];
    const decisions = (playbooks.length ? playbooks : [null]).map(p => assessPaperRegime(context, workspaceId, assetClass, p, nowMs));
    const permitted = decisions.filter(d => d.sizeMultiplier > 0).map(d => d.playbookId!);
    const conditional = decisions.filter(d => d.status === 'WAIT_FOR_CONFIRMATION').map(d => d.playbookId!);
    const standingDown = !!policy && !playbooks.length && decisions[0].status === 'UNKNOWN_PLAYBOOK';
    return { assetClass, status: permitted.length ? 'POLICY_AVAILABLE' : conditional.length ? 'CONDITIONAL' : 'BLOCKED',
      policyConfigured: !!policy, conditionalPlaybooks: conditional,
      requiredConfirmations: policy?.requiredConfirmations ?? [],
      reason: permitted.length ? 'Fresh regime evidence and explicit playbook permissions. Other trade checks still apply.'
        : conditional.length ? 'Policy configured; each candidate must satisfy its required confirmations before entry.'
        : standingDown ? 'Configured stand-down policy: no new entries in this regime.' : regimeReasonText(decisions[0].reason),
      regime: key, observedAt: snapshot?.computed_at ?? null,
      sourceOldestAt: snapshot?.components_json?.sourceOldestAt ?? null,
      coverage: snapshot?.components_json?.coverage ?? null, permittedPlaybooks: permitted };
  });
}

function regimeReasonText(reason: string): string {
  if (reason.startsWith('regime_evidence_missing:')) return 'No saved regime evidence for this market.';
  if (reason.startsWith('regime_evidence_unverified_or_insufficient:')) return 'Regime evidence has unverified timestamps or insufficient fresh quote coverage.';
  if (reason.startsWith('regime_evidence_stale_or_invalid:')) return 'Regime evidence is expired or has invalid timestamps.';
  if (reason.startsWith('regime_label_unknown:')) return 'The market regime is currently unknown.';
  if (reason.startsWith('regime_policy_missing:')) return 'No playbook policy is configured for this market and regime.';
  if (reason.includes('no playbook id')) return 'The regime policy contains no explicit playbook permissions.';
  return reason;
}
