'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Stamp from './Stamp';
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
    {picks === null ? <p>{FREE_COPY.loading}</p> : !picks.length ? <p>{FREE_COPY.unavailable}</p> : <>
      <p className="my-3 text-6xl font-semibold">{picks.length}<span className="ml-2 text-base">{FREE_COPY.picks}</span></p>
      <div className="space-y-3">{picks.map(row => <div key={row.symbol}>
        <div className="flex justify-between gap-3"><span>{row.symbol}</span><strong style={{ color: scoreTone(Number(row.score)) }}>{row.score}</strong></div>
        <div className="h-2 rounded bg-white/5"><div className="h-2 rounded" style={{ width: `${Math.max(0,Math.min(100,Number(row.score)))}%`, background: scoreTone(Number(row.score)) }} /></div>
        <Stamp at={row.dataTimestamp || row.scan_date || row.created_at} />
      </div>)}</div>
    </>}
    <Link href="/daily-pick" className="mt-3 inline-flex min-h-10 items-center underline">{FREE_COPY.seeAll}</Link>
  </section>;
}
