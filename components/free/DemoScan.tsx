'use client';
import { useEffect, useRef, useState } from 'react';
import { trackFreeEvent } from '@/lib/free/funnel';
import Link from 'next/link';
import type { ScanResult } from '@/app/v2/_lib/api';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/free/limits';
import Stamp, { localStamp } from './Stamp';
import { scoreTone } from './SavedPicks';
import UpgradeMoment, { useUpgradeMoment } from './UpgradeMoment';
import { FREE_COPY } from './copy';
export type Usage = { used: number; limit: number; resetsAt: string };
export default function DemoScan() {
  const upgrade = useUpgradeMoment();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [row, setRow] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const active = useRef(false);
  async function refreshUsage() {
    const response = await fetch('/api/scanner/usage', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json() as Usage;
    setUsage(data); return data;
  }
  useEffect(() => { void refreshUsage().catch(() => setError(true)); }, []);
  async function scan(symbol: string) {
    if (active.current) return;
    active.current = true; setBusy(true); setError(false); setRow(null);
    try {
      if (!usage) await refreshUsage();
      const response = await fetch('/api/scanner/run', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: symbol === 'BTC' ? 'crypto' : 'equity', symbols: [symbol], timeframe: 'daily', minScore: 0 }) });
      const data = await response.json();
      if (response.status === 429 && data.limitReached) { trackFreeEvent('scan_limit_hit', 'demo', usage?.resetsAt); setLimitHit(true); upgrade.show('scan'); return; }
      if (!response.ok) throw new Error();
      const result = data.results?.find((item: ScanResult) => item.symbol?.replace(/USD[T]?$/, '') === symbol);
      if (!result || !Number.isFinite(result.score)) throw new Error();
      setRow(result);
      const after = await refreshUsage();
      if (usage?.used === 0 && after.used === 1) trackFreeEvent('first_scan', 'demo', after.resetsAt);
    } catch { setError(true); }
    finally { await refreshUsage().catch(() => setError(true)); active.current = false; setBusy(false); }
  }
  const remaining = usage ? Math.max(0, usage.limit - usage.used) : null;
  const score = row?.canonical?.score ?? row?.score;
  return <section className="min-w-0 space-y-3 rounded-xl border border-white/10 p-4" aria-busy={busy}>
    {upgrade.moment && <UpgradeMoment kind={upgrade.moment} dismiss={upgrade.dismiss} />}
    <h2 className="text-lg font-semibold">{FREE_COPY.demoTitle}</h2>
    <p className="text-sm" aria-live="polite">{usage ? `${remaining} ${FREE_COPY.of} ${usage.limit} ${FREE_COPY.scansLeft} · ${FREE_COPY.resets} ${localStamp(usage.resetsAt)}` : FREE_COPY.loading}</p>
    {limitHit || remaining === 0 ? <div><p>{FREE_COPY.scanLimit(FREE_DAILY_SCAN_LIMIT)}</p><Link className="inline-flex min-h-10 items-center underline" href="/pricing" onClick={() => trackFreeEvent('upgrade_click', 'scan')}>{FREE_COPY.upgrade}</Link></div> : <div className="flex flex-wrap items-center gap-3">
      <button className="min-h-11 rounded-lg border border-white/20 px-5 font-semibold" disabled={busy || !usage} onClick={() => void scan('AAPL')}>{busy ? FREE_COPY.loading : FREE_COPY.scanAapl}</button>
      {['SPY','BTC','NVDA'].map(symbol => <button key={symbol} className="min-h-10 px-2 underline" disabled={busy || !usage} onClick={() => void scan(symbol)}>{symbol}</button>)}
    </div>}
    {error && <p role="alert">{FREE_COPY.unavailable} <button className="min-h-10 underline" onClick={() => void (usage ? scan('AAPL') : refreshUsage().catch(() => setError(true)))}>{FREE_COPY.retry}</button></p>}
    {row && score != null && <div aria-live="polite">
      <p>{row.symbol}</p><p className="text-6xl font-semibold" style={{ color: scoreTone(score) }}>{score}</p>
      <Stamp at={row.dataBasis?.lastCompletedBarAt || row.lastCandleTime} source={row.dataBasis?.source || FREE_COPY.scanSource} basis={FREE_COPY.lastBar} />
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[[FREE_COPY.price, row.price], [FREE_COPY.rsi, row.rsi], [FREE_COPY.coverage, row.canonical?.coverage == null ? null : `${Math.round(row.canonical.coverage * 100)}%`]].map(([label,value]) => <div key={String(label)}><dt className="text-xs">{label}</dt><dd>{value ?? FREE_COPY.unavailable}</dd></div>)}
      </dl>
      <Link className="mt-3 inline-flex min-h-10 items-center underline" href={`/tools/golden-egg?symbol=${encodeURIComponent(row.symbol)}`}>{FREE_COPY.fullAnalysis}</Link>
    </div>}
    <p className="text-xs text-[var(--msp-text-muted)]">{FREE_COPY.research}</p>
  </section>;
}
