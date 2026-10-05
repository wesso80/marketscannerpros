'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceLine from '@/components/visual/SourceLine';
import { localStamp } from './Stamp';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import { FREE_COPY } from './copy';
export function scoreTone(value: number) { return value >= 75 ? 'var(--msp-bull)' : value >= 50 ? 'var(--msp-warn)' : 'var(--msp-text-muted)'; }
type Pick = { symbol: string; score: number; created_at?: string; scan_date?: string; dataTimestamp?: string };
export default function SavedPicks() {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/scanner/daily-picks?limit=5', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      const rows = [...(data.topPicks?.equity ?? []), ...(data.topPicks?.crypto ?? [])];
      setPicks(rows.filter(row => row.symbol && row.score != null && Number.isFinite(Number(row.score))).sort((a,b) => Number(b.score)-Number(a.score)).slice(0,5));
    }).catch(() => { if (!abort.signal.aborted) setPicks([]); });
    return () => abort.abort();
  }, []);
  return <section className="min-w-0 rounded-xl border border-white/10 p-4">
    <h2>{FREE_COPY.savedList}</h2>
    {picks === null ? <p>{FREE_COPY.loading}</p> : !picks.length ? <p data-today-verdict className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">No stored picks collected.</p> : <>
      <p data-today-verdict className="my-3 text-3xl font-semibold">{picks.length}<span className="ml-2 text-base">{FREE_COPY.picks}</span></p>
      <div className="space-y-3">{picks.map(row => <div key={row.symbol}>
        <div className="flex justify-between gap-3"><span>{row.symbol}</span><strong style={{ color: scoreTone(Number(row.score)) }}>{Number(row.score).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></div>
        <div className="h-2 rounded bg-white/5"><div className="h-2 rounded" style={{ width: `${Math.max(0,Math.min(100,Number(row.score)))}%`, background: scoreTone(Number(row.score)) }} /></div>

      </div>)}</div>
    </>}
    <SourceLine source={FREE_COPY.source} asOf={picks?.[0]?.dataTimestamp || picks?.[0]?.created_at} tradingDay={picks?.[0]?.scan_date} basis="Stored scan observations · radar has a separate session date" />
    {!!picks?.length && <CollapsibleSection title="Observation dates" summary={`${picks.length} stored picks`}>{picks.map(row => <p key={row.symbol}>{row.symbol} · {localStamp(row.dataTimestamp || row.scan_date || row.created_at)}</p>)}</CollapsibleSection>}
    <Link href="/daily-pick" className="mt-3 inline-flex min-h-10 items-center underline">{FREE_COPY.seeAll}</Link>
  </section>;
}
