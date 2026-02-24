'use client';

import { useEffect, useMemo, useState } from 'react';

type OperatorProposalActionType = 'create_alert' | 'create_journal_draft' | 'create_plan_draft';

interface OperatorProposal {
  id: string;
  rank: number;
  packetId: string;
  symbol: string | null;
  status: string | null;
  score: number;
  confidence: number;
  actionType?: string;
  requiredConfirm?: boolean;
  canAssistExecute?: boolean;
  blockReason?: string | null;
  action: {
    type: OperatorProposalActionType;
    payload: Record<string, any>;
    mode: 'draft' | 'commit';
    requiresConfirm: boolean;
  };
  cooldown: {
    key: string;
    expiresAt: string;
  };
}

interface OperatorProposalResponse {
  success: boolean;
  proposals: OperatorProposal[];
}

type OperatorProposalRailProps = {
  title?: string;
  source: string;
  symbolFallback?: string | null;
  timeframe?: string | null;
  assetClass?: string | null;
  workflowPrefix?: string;
  limit?: number;
  maxVisible?: number;
  compact?: boolean;
  sticky?: boolean;
};

export default function OperatorProposalRail({
  title = 'Operator Proposals',
  source,
  symbolFallback,
  timeframe,
  assetClass,
  workflowPrefix = 'wf_operator',
  limit = 6,
  maxVisible = 3,
  compact = false,
  sticky = false,
}: OperatorProposalRailProps) {
  const [proposals, setProposals] = useState<OperatorProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Record<string, true>>({});

  const visibleProposals = useMemo(
    () => proposals.filter((proposal) => !dismissedIds[proposal.id]).slice(0, maxVisible),
    [proposals, dismissedIds, maxVisible]
  );

  const refresh = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`/api/operator/proposals?limit=${Math.max(1, Math.min(limit, 20))}`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const reason = payload?.error || `HTTP ${response.status}`;
        const message = `Proposal API failed: ${reason}`;
        console.warn('[OperatorProposalRail] refresh failed', { status: response.status, reason });
        setFetchError(message);
        return;
      }
      const payload = (await response.json()) as OperatorProposalResponse;
      setProposals(Array.isArray(payload?.proposals) ? payload.proposals : []);
    } catch (error: any) {
      const message = error?.message || 'Network error while loading proposals';
      console.warn('[OperatorProposalRail] refresh exception', error);
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 45_000);

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [limit]);

  const runProposal = async (proposal: OperatorProposal, mode: 'draft' | 'assist') => {
    if (!proposal?.id) return;

    setBusyId(proposal.id);
    setFeedback(null);

    const selectedSymbol = (proposal.symbol || symbolFallback || '').toUpperCase();

    try {
      const idempotencyKey = `${source}_${proposal.id}_${proposal.cooldown.key}`.slice(0, 160);
      const executeResponse = await fetch('/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionPacketId: proposal.packetId,
          actionType: proposal.actionType || proposal.action.type,
          mode,
          params: {
            ...proposal.action.payload,
            symbol: selectedSymbol || undefined,
            packetId: proposal.packetId,
            timeframe: timeframe || undefined,
            assetClass: assetClass || undefined,
          },
          idempotencyKey,
          proposalId: proposal.id,
          source,
          action: {
            type: proposal.action.type,
            mode,
            payload: {
              ...proposal.action.payload,
              symbol: selectedSymbol || undefined,
              packetId: proposal.packetId,
              timeframe: timeframe || undefined,
              assetClass: assetClass || undefined,
            },
          },
        }),
      });

      const executePayload = await executeResponse.json().catch(() => ({}));
      if (!executeResponse.ok) {
        setFeedback(executePayload?.error || 'Failed to execute proposal action');
        return;
      }

      await fetch('/api/operator/attention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'take_action',
          symbol: selectedSymbol || undefined,
          actionKey: proposal.action.type === 'create_plan_draft'
            ? 'prepare_plan'
            : proposal.action.type === 'create_journal_draft'
              ? 'journal'
              : 'create_alert',
          workflowId: `${workflowPrefix}_${selectedSymbol || 'symbol'}_${Date.now()}`,
          decisionPacketId: proposal.packetId,
          reason: `Proposal executed: ${proposal.id}`,
        }),
      });

      setDismissedIds((previous) => ({ ...previous, [proposal.id]: true }));
      const downgraded = executePayload?.requestedMode === 'assist' && executePayload?.effectiveMode === 'draft';
      if (downgraded) {
        setFeedback(`Assist downgraded to Draft: ${executePayload?.downgradeReason || 'Policy gate failed'}`);
      } else {
        setFeedback(`${mode === 'assist' ? 'Executed' : 'Draft created'} for ${selectedSymbol || 'focus symbol'} (${proposal.action.type.replaceAll('_', ' ')})`);
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const dismissProposal = async (proposal: OperatorProposal) => {
    if (!proposal?.id) return;

    setBusyId(proposal.id);

    const selectedSymbol = (proposal.symbol || symbolFallback || '').toUpperCase();

    try {
      await fetch('/api/operator/attention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'take_action',
          symbol: selectedSymbol || undefined,
          actionKey: 'wait',
          workflowId: `${workflowPrefix}_${selectedSymbol || 'symbol'}_${Date.now()}`,
          decisionPacketId: proposal.packetId,
          reason: `Proposal dismissed: ${proposal.id}`,
        }),
      });

      setDismissedIds((previous) => ({ ...previous, [proposal.id]: true }));
      setFeedback(`Dismissed proposal for ${selectedSymbol || 'focus symbol'}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 ${sticky ? 'sticky top-3 z-20' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-indigo-200">{title}</div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded border border-indigo-500/40 bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {feedback ? (
        <div className="mt-2 rounded border border-indigo-400/30 bg-indigo-500/15 px-2 py-1 text-xs text-indigo-100">
          {feedback}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mt-2 rounded border border-rose-400/30 bg-rose-500/15 px-2 py-1 text-xs text-rose-100">
          {fetchError}
        </div>
      ) : null}

      <div className="mt-2 space-y-2">
        {loading && proposals.length === 0 ? (
          <div className="text-xs text-indigo-100/80">Loading proposal queue…</div>
        ) : visibleProposals.length === 0 ? (
          <div className="text-xs text-indigo-100/80">No active proposals. New decision packets will repopulate this queue.</div>
        ) : (
          visibleProposals.map((proposal) => {
            const isBusy = busyId === proposal.id;
            return (
              <div key={proposal.id} className="rounded border border-indigo-400/20 bg-slate-900/40 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-indigo-100">
                    #{proposal.rank} · {(proposal.symbol || symbolFallback || '—').toUpperCase()} · {proposal.action.type.replaceAll('_', ' ')}
                  </div>
                  <div className="text-indigo-200/80">
                    score {(Number(proposal.score) * 100).toFixed(1)} · conf {(Number(proposal.confidence) * 100).toFixed(1)}%
                  </div>
                </div>

                {!compact ? (
                  <div className="mt-1 text-indigo-100/80">
                    Packet {proposal.packetId} · status {(proposal.status || 'candidate').toUpperCase()}
                  </div>
                ) : null}

                <div className="mt-1 text-indigo-100/70">
                  Cooldown to {new Date(proposal.cooldown.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void runProposal(proposal, 'draft')}
                    className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 disabled:opacity-60"
                  >
                    {isBusy ? 'Working…' : 'Draft'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !proposal.canAssistExecute}
                    onClick={() => void runProposal(proposal, 'assist')}
                    title={proposal.canAssistExecute ? 'Execute with policy checks' : proposal.blockReason || 'Assist-Execute blocked'}
                    className="rounded border border-cyan-500/40 bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200 disabled:opacity-50"
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void dismissProposal(proposal)}
                    className="rounded border border-slate-500/40 bg-slate-700/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                </div>
                {proposal.canAssistExecute === false && proposal.blockReason ? (
                  <div className="mt-1 text-[11px] text-amber-200">Assist blocked: {proposal.blockReason}</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
