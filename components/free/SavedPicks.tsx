'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceLine from '@/components/visual/SourceLine';
import { localStamp } from './Stamp';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import { FREE_COPY } from './copy';
export function scoreTone(value: number) { return value >= 75 ? 'var(--msp-bull)' : value >= 50 ? 'var(--msp-warn)' : 'var(--msp-text-muted)'; }
/** Public daily-scan observation (public-daily-observations-v1): measured values only, no score, grade or ranking. */
type Pick = { symbol: string; assetClass?: string; changePercent?: number | null; scanDate?: string | null; dataQuality?: { dataTimestamp?: string | null; scannedAt?: string | null } };
const SORT_NOTE = 'Listed A–Z, not ranked.';
export default function SavedPicks() {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/scanner/daily-picks?limit=40', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data?.contract !== 'public-daily-observations-v1') throw new Error();
      const rows: Pick[] = [...(data.observations?.equity ?? []), ...(data.observations?.crypto ?? [])].filter((row: Pick) => row.symbol);
      setPicks(rows.sort((a, b) => a.symbol.localeCompare(b.symbol)).slice(0, 5));
    }).catch(() => { if (!abort.signal.aborted) setPicks([]); });
    return () => abort.abort();
  }, []);
  const stamp = (row?: Pick) => row?.dataQuality?.dataTimestamp || row?.dataQuality?.scannedAt || row?.scanDate || undefined;
  return <section className="min-w-0 rounded-xl border border-white/10 p-4">
    <h2>{FREE_COPY.savedList}</h2>
    {picks === null ? <p>{FREE_COPY.loading}</p> : !picks.length ? <p data-today-verdict className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">No stored observations collected.</p> : <>
      <p data-today-verdict className="my-3 text-3xl font-semibold">{picks.length}<span className="ml-2 text-base">stored symbols</span></p>
      <p className="text-xs text-slate-400">{SORT_NOTE}</p>
      <div className="mt-2 space-y-2">{picks.map(row => <div key={`${row.assetClass}-${row.symbol}`} className="flex justify-between gap-3">
        <span>{row.symbol}</span>
        <span className="text-slate-300">{row.changePercent != null && Number.isFinite(row.changePercent) ? `${row.changePercent >= 0 ? '+' : ''}${row.changePercent.toFixed(2)}% session` : 'Change not recorded'}</span>
      </div>)}</div>
    </>}
    <SourceLine source={FREE_COPY.source} asOf={stamp(picks?.[0])} tradingDay={picks?.[0]?.scanDate ?? undefined} basis="Stored scan observations · radar has a separate session date" />
    {!!picks?.length && <CollapsibleSection title="Observation dates" summary={`${picks.length} stored symbols`}>{picks.map(row => <p key={`${row.assetClass}-${row.symbol}`}>{row.symbol} · {localStamp(stamp(row))}</p>)}</CollapsibleSection>}
    <Link href="/daily-pick" className="mt-3 inline-flex min-h-10 items-center underline">{FREE_COPY.seeAll}</Link>
  </section>;
}
