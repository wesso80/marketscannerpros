'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/free/limits';
import { trackFreeEvent, trackStartHereStep } from '@/lib/free/funnel';
import {
  START_HERE_MARKETS,
  findFreeScanResult,
  freeScanBody,
  marketFromPref,
  mergeMarketPref,
  readStoredMarket,
  readStoredScan,
  startHereSymbolHref,
  writeStartHereStatus,
  writeStoredMarket,
  writeStoredScan,
  type StartMarket,
} from '@/lib/free/startHere';
import { FREE_COPY } from './copy';
import type { Usage } from './DemoScan';

type Step = 1 | 2 | 3;

function StepHeading({ step, title, done, current }: { step: Step; title: string; done: boolean; current: boolean }) {
  return (
    <h2 className={`border-b-2 pb-2 text-base font-semibold ${current ? 'border-[var(--msp-accent)] text-[var(--msp-text)]' : 'border-transparent text-[var(--msp-text)]'}`}>
      {step}. {title}
      {done ? <span className="ml-2 text-[var(--msp-bull)]">✓</span> : null}
    </h2>
  );
}

export default function StartHere({ onSkip }: { onSkip: () => void }) {
  const [market, setMarket] = useState<StartMarket | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [opened, setOpened] = useState(false);
  const usageRef = useRef<Usage | null>(null);
  const picked = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    const saved = readStoredMarket();
    const scan = readStoredScan();
    if (saved) {
      setMarket(saved);
      if (scan?.market === saved) setSymbol(scan.symbol);
    }
    let cancel = false;
    if (!saved) {
      fetch('/api/ai/memory', { credentials: 'include', cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancel || picked.current) return;
          const pref = marketFromPref(data?.memory?.preferredAssets);
          if (!pref) return;
          writeStoredMarket(pref);
          setMarket(pref);
          if (scan?.market === pref) setSymbol(scan.symbol);
        })
        .catch(() => { /* The choice still saves on this device. */ });
    }
    fetch('/api/scanner/usage', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as Usage;
        if (cancel) return;
        usageRef.current = data;
        setUsage(data);
        if (data.used >= data.limit) setLimitHit(true);
      })
      .catch(() => { /* The scan route still enforces the daily limit. */ });
    return () => { cancel = true; };
  }, []);

  function choose(next: StartMarket) {
    picked.current = true;
    setMarket(next);
    writeStoredMarket(next);
    const scan = readStoredScan();
    setSymbol(scan?.market === next ? scan.symbol : null);
    trackStartHereStep(1);
    void fetch('/api/ai/memory', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = response.ok ? await response.json() : null;
        await fetch('/api/ai/memory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferredAssets: mergeMarketPref(data?.memory?.preferredAssets, next) }),
        });
      })
      .catch(() => { /* localStorage already has the choice. */ });
  }

  async function scan() {
    if (!market || active.current || limitHit) return;
    const requested = START_HERE_MARKETS.find((item) => item.id === market)!.symbol;
    active.current = true;
    setBusy(true);
    setError(false);
    let scanned = false;
    const before = usageRef.current;
    try {
      const response = await fetch('/api/scanner/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(freeScanBody(market, requested)),
      });
      const data = await response.json();
      if (response.status === 429 && data.limitReached) {
        trackFreeEvent('scan_limit_hit', 'start-here', before?.resetsAt);
        setLimitHit(true);
        return;
      }
      if (!response.ok) throw new Error();
      const result = findFreeScanResult<{ symbol?: string; score?: number }>(data.results, requested);
      if (!result?.symbol) throw new Error();
      setSymbol(result.symbol);
      writeStoredScan({ symbol: result.symbol, market });
      scanned = true;
      trackStartHereStep(2);
    } catch {
      setError(true);
    } finally {
      try {
        const usageResponse = await fetch('/api/scanner/usage', { credentials: 'include', cache: 'no-store' });
        if (usageResponse.ok) {
          const after = await usageResponse.json() as Usage;
          usageRef.current = after;
          setUsage(after);
          if (scanned && before?.used === 0 && after.used === 1) trackFreeEvent('first_scan', 'start-here', after.resetsAt);
        }
      } catch { /* The scan result is already on screen. */ }
      active.current = false;
      setBusy(false);
    }
  }

  function skip() {
    writeStartHereStatus('skipped');
    onSkip();
  }

  function openSymbol() {
    writeStartHereStatus('done');
    setOpened(true);
    trackStartHereStep(3);
  }

  const current: Step = symbol ? 3 : market ? 2 : 1;
  const href = symbol && market ? startHereSymbolHref(symbol, market) : null;
  const remaining = usage ? Math.max(0, usage.limit - usage.used) : null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-xl space-y-5 py-6 text-[var(--msp-text)]">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Start here</h1>
        <p className="text-sm text-[var(--msp-text-muted)]">Three short steps. Pick a market, run one scan, then open a Symbol page.</p>
      </header>
      <ol className="flex flex-col gap-4">
        <li className="min-w-0 rounded-xl bg-[var(--msp-card)] p-4">
          <StepHeading step={1} title="Pick a market" done={market != null} current={current === 1} />
          <p className="mt-3 text-sm text-[var(--msp-text-muted)]">Crypto or US stocks. This choice is saved on this device.</p>
          <div role="tablist" aria-label="Market" className="mt-3 flex flex-col gap-2 sm:flex-row">
            {START_HERE_MARKETS.map((item) => {
              const selected = market === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`inline-flex min-h-12 w-full items-center justify-center rounded-t-lg border-b-2 px-4 text-base font-semibold sm:w-auto sm:min-w-36 ${selected ? 'border-[var(--msp-accent)] text-[var(--msp-text)]' : 'border-transparent bg-[var(--msp-card-2)] text-[var(--msp-text-muted)]'}`}
                  onClick={() => choose(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </li>
        <li className="min-w-0 rounded-xl bg-[var(--msp-card)] p-4">
          <StepHeading step={2} title="Run a scan" done={symbol != null} current={current === 2} />
          <p className="mt-3 text-sm text-[var(--msp-text-muted)]">This uses 1 of your {FREE_DAILY_SCAN_LIMIT} scans today.</p>
          {remaining != null ? <p className="text-sm text-[var(--msp-text-muted)]">{remaining} left today.</p> : null}
          {limitHit ? <p className="mt-3 text-sm">{FREE_COPY.scanLimit(FREE_DAILY_SCAN_LIMIT)}</p> : (
            <button
              type="button"
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--msp-card-2)] px-5 text-base font-semibold disabled:opacity-50 sm:w-auto"
              disabled={!market || busy}
              onClick={() => void scan()}
            >
              {busy ? 'Running the scan…' : 'Run a scan'}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm">
              {FREE_COPY.unavailable}{' '}
              <button type="button" className="min-h-10 underline" onClick={() => void scan()}>{FREE_COPY.retry}</button>
            </p>
          )}
        </li>
        <li className="min-w-0 rounded-xl bg-[var(--msp-card)] p-4">
          <StepHeading step={3} title="Open a Symbol page" done={opened} current={current === 3} />
          <p className="mt-3 text-sm text-[var(--msp-text-muted)]">Open the top result from that scan.</p>
          {href && symbol ? (
            <Link
              href={href}
              onClick={openSymbol}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg border-b-2 border-[var(--msp-accent)] bg-[var(--msp-card-2)] px-5 text-base font-semibold sm:w-auto"
            >
              Open {symbol}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-[var(--msp-text-faint)]">The Symbol link shows up after the scan.</p>
          )}
        </li>
      </ol>
      <button type="button" onClick={skip} className="inline-flex min-h-10 items-center text-sm text-[var(--msp-text-muted)] underline">
        Skip, show me everything
      </button>
      <p className="text-xs text-[var(--msp-text-muted)]">General information only, not financial advice.</p>
    </main>
  );
}
