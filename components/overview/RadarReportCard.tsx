'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUserTier } from '@/lib/useUserTier';
import { radarCardModel } from '@/lib/overview/radarCard';
import StampLine from '@/components/visual/StampLine';
import { COPY } from '@/components/visual/copy';

const c = COPY.radarCard;
type State = { kind: 'loading' | 'locked' | 'empty' } | { kind: 'error'; error: string } | { kind: 'report'; model: NonNullable<ReturnType<typeof radarCardModel>> };
export default function RadarReportCard() {
  const { tier, isAdmin, isLoading, isLoggedIn } = useUserTier();
  const allowed = tier === 'pro' || tier === 'pro_trader' || isAdmin;
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    if (isLoading || !allowed) return;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const response = await fetch('/api/msp-radar/daily?view=card', { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setState({ kind: 'locked' }); return; }
        if (response.status === 404) { setState({ kind: 'empty' }); return; }
        if (!response.ok) { setState({ kind: 'error', error: `${c.httpError} ${response.status}` }); return; }
        const model = radarCardModel(await response.json());
        if (!controller.signal.aborted) setState(model ? { kind: 'report', model } : { kind: 'error', error: c.invalidResponse });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error', error: c.networkError });
      }
    })();
    return () => controller.abort();
  }, [isLoading, allowed]);
  const loading = isLoading || (allowed && state.kind === 'loading');
  const locked = !isLoading && (!allowed || state.kind === 'locked');
  return <section data-radar-card className="min-w-0 space-y-3 border border-white/10 bg-[var(--msp-panel)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }} aria-label={c.source}>
    <h2 className="text-sm font-semibold text-[var(--msp-text-muted)]">{locked ? c.source : state.kind === 'report' && state.model.older ? c.older : c.title}</h2>
    {loading ? <div role="status" aria-label={c.loading} className="h-24 animate-pulse rounded bg-white/5" /> : locked ? <>
      <p className="text-lg font-semibold"><span aria-hidden="true">🔒 </span>{c.paid}</p>
      <p className="text-sm text-[var(--msp-text-muted)]">{c.teaser}</p>
      <Link className="inline-flex text-sm text-[var(--msp-accent)]" href={isLoggedIn ? '/pricing' : '/auth?next=/tools/msp-radar'}>{isLoggedIn ? c.plans : c.signIn}</Link>
    </> : state.kind === 'report' ? <>
      <div><p className="text-2xl font-bold">{state.model.dateLabel}</p><p className="text-xs text-[var(--msp-text-muted)]">{c.session}</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded border px-2 py-1 text-xs font-bold" style={{ color: state.model.color, borderColor: state.model.color }}>{state.model.status}</span>
        {state.model.health && <span className="text-xs">{state.model.health}</span>}
        {state.model.older && <span className="text-xs text-[var(--msp-warn)]">{c.older}</span>}
      </div>
      {state.model.count !== null && <p className="text-xl font-semibold">{state.model.count} <span className="text-sm font-normal">{c.candidates}</span></p>}
      {state.model.chips.length > 0 && <ul data-radar-chips className="flex flex-wrap gap-2">{state.model.chips.map((chip, index) => <li key={`${chip.symbol}-${index}`} className="min-h-10 rounded-full border border-[var(--msp-border)] px-3 text-xs leading-10">{chip.symbol}{chip.label ? ` · ${chip.label}` : ''}</li>)}</ul>}
      <StampLine source={c.source} asOf={state.model.generatedAt} basis={c.session} />
      <Link className="inline-flex text-sm text-[var(--msp-accent)]" href="/tools/msp-radar">{c.open}</Link>
    </> : state.kind === 'empty' ? <p>{c.empty}</p> : state.kind === 'error' ? <div role="status"><p>{c.unavailable}</p><p className="text-xs text-[var(--msp-warn)]">{state.error}</p></div> : null}
  </section>;
}
