'use client';

import { Fragment } from 'react';
import Link from 'next/link';

/**
 * HomePreviewStrip
 * --------------------------------------------------------------
 * Three CSS/HTML mock cards rendered under the hero. These are
 * NOT screenshots — they are stylized previews of the Scanner,
 * Golden Egg, and Dashboard surfaces, built from sample data so
 * we never misrepresent the live product. Each card is clearly
 * labelled "UI preview · sample data".
 */

const scannerRows = [
  { sym: 'NVDA', mkt: 'EQ', score: 86, dir: 'Bull', rsi: 62 },
  { sym: 'BTC',  mkt: 'CR', score: 78, dir: 'Bull', rsi: 58 },
  { sym: 'AAPL', mkt: 'EQ', score: 71, dir: 'Bull', rsi: 55 },
  { sym: 'TSLA', mkt: 'EQ', score: 64, dir: 'Neut', rsi: 49 },
  { sym: 'ETH',  mkt: 'CR', score: 58, dir: 'Bear', rsi: 42 },
];

const goldenLayers = [
  { label: 'Trend alignment',   weight: 92 },
  { label: 'Momentum',          weight: 81 },
  { label: 'Volume confirm',    weight: 74 },
  { label: 'Volatility regime', weight: 68 },
  { label: 'Macro context',     weight: 55 },
];

const dashboardCards = [
  { label: 'Regime',     value: 'Neutral',  tone: 'text-amber-300' },
  { label: 'Breadth',    value: '54%',      tone: 'text-emerald-300' },
  { label: 'VIX',        value: '14.2',     tone: 'text-emerald-300' },
  { label: 'Active sigs',value: '37',       tone: 'text-cyan-300' },
];

function PreviewLabel() {
  return (
    <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      UI preview · sample data
    </span>
  );
}

function ScannerPreview() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-emerald-500/20 bg-slate-950/60 p-4">
      <PreviewLabel />
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Scanner</span>
        <span className="text-[10px] text-slate-500">Daily · All markets</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs">
        <div className="text-slate-500">Symbol</div>
        <div className="text-slate-500">Mkt</div>
        <div className="text-slate-500 text-right">Score</div>
        <div className="text-slate-500 text-right">RSI</div>
        {scannerRows.map((r) => (
          <Fragment key={r.sym}>
            <div className="font-semibold text-white">{r.sym}</div>
            <div className="text-slate-400">{r.mkt}</div>
            <div
              className={`text-right font-mono ${
                r.score >= 75 ? 'text-emerald-300' : r.score >= 60 ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {r.score}
            </div>
            <div className="text-right font-mono text-slate-300">{r.rsi}</div>
          </Fragment>
        ))}
      </div>
      <div className="mt-auto pt-3 text-[11px] text-slate-500">
        Filter equities, crypto, and forex by structured technical conditions.
      </div>
    </div>
  );
}

function GoldenEggPreview() {
  const total = Math.round(goldenLayers.reduce((a, b) => a + b.weight, 0) / goldenLayers.length);
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-amber-500/20 bg-slate-950/60 p-4">
      <PreviewLabel />
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Golden Egg</span>
        <span className="text-[10px] text-slate-500">NVDA · Daily</span>
      </div>
      <div className="mb-3 flex items-end gap-2">
        <div className="font-mono text-3xl font-bold text-amber-300">{total}</div>
        <div className="pb-1 text-[11px] uppercase tracking-wider text-slate-500">Confluence</div>
      </div>
      <div className="space-y-1.5">
        {goldenLayers.map((l) => (
          <div key={l.label}>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{l.label}</span>
              <span className="font-mono text-slate-300">{l.weight}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300"
                style={{ width: `${l.weight}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-3 text-[11px] text-slate-500">
        Evidence-layered scoring with narrative and data-quality context.
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-slate-950/60 p-4">
      <PreviewLabel />
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-cyan-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Command Center</span>
        <span className="text-[10px] text-slate-500">Live regime view</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {dashboardCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-white/5 bg-slate-900/60 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
            <div className={`mt-1 font-mono text-lg font-semibold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Breadth (5d)</div>
        <svg viewBox="0 0 120 36" className="h-10 w-full">
          <polyline
            fill="none"
            stroke="rgb(45 212 191)"
            strokeWidth="1.5"
            points="0,28 12,24 24,26 36,18 48,20 60,12 72,16 84,8 96,10 108,6 120,9"
          />
          <polyline
            fill="rgba(45,212,191,0.12)"
            stroke="none"
            points="0,28 12,24 24,26 36,18 48,20 60,12 72,16 84,8 96,10 108,6 120,9 120,36 0,36"
          />
        </svg>
      </div>
      <div className="mt-auto pt-3 text-[11px] text-slate-500">
        Regime, breadth, and signal flow consolidated in one view.
      </div>
    </div>
  );
}

export default function HomePreviewStrip() {
  return (
    <section className="border-b border-white/5 bg-gradient-to-b from-slate-950/80 to-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Inside the platform</h2>
            <p className="mt-1 text-sm text-slate-400">
              A glimpse at three core surfaces. Mocked with sample data — open the live tool for real markets.
            </p>
          </div>
          <Link
            href="/tools"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-slate-900"
          >
            Open workflow map <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link href="/tools/scanner" className="block transition hover:-translate-y-0.5">
            <ScannerPreview />
          </Link>
          <Link href="/tools/golden-egg" className="block transition hover:-translate-y-0.5">
            <GoldenEggPreview />
          </Link>
          <Link href="/tools/dashboard" className="block transition hover:-translate-y-0.5">
            <DashboardPreview />
          </Link>
        </div>
      </div>
    </section>
  );
}
