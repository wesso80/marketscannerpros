'use client';

import { useMemo, useState } from 'react';

type ClosedRiskTrade = {
  id: string;
  date: string;
  strategy: string;
  regime: string;
  normalizedR: number;
  dynamicR: number;
  multiplier: number;
  throttleReason?: 'regime' | 'vol' | 'event' | 'streak' | 'none';
};

type OpenRiskTrade = {
  id: string;
  currentR: number;
  stopR?: number;
  targetR?: number;
};

type Props = {
  trades: ClosedRiskTrade[];
  openTrades: OpenRiskTrade[];
};

const BIN_LABELS = ['<-3R', '-3R to -2R', '-2R to -1R', '-1R to 0R', '0R to +1R', '+1R to +2R', '+2R to +3R', '>+3R'];

function binIndex(value: number) {
  if (value < -3) return 0;
  if (value < -2) return 1;
  if (value < -1) return 2;
  if (value < 0) return 3;
  if (value < 1) return 4;
  if (value < 2) return 5;
  if (value < 3) return 6;
  return 7;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function skewness(values: number[]) {
  if (values.length < 3) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const std = stdDev(values);
  if (std === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((sum, value) => sum + ((value - mean) ** 3), 0) / n;
  return m3 / (std ** 3);
}

function maxDrawdown(curve: number[]) {
  if (!curve.length) return 0;
  let peak = curve[0];
  let maxDd = 0;
  for (const value of curve) {
    peak = Math.max(peak, value);
    maxDd = Math.min(maxDd, value - peak);
  }
  return maxDd;
}

function formatR(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

export default function RiskApplicationOverlay({ trades, openTrades }: Props) {
  const [windowMode, setWindowMode] = useState<'50' | '100' | 'YTD'>('50');
  const [distributionMode, setDistributionMode] = useState<'normalized' | 'live'>('normalized');

  const filteredTrades = useMemo(() => {
    if (!trades.length) return [];
    if (windowMode === 'YTD') {
      const year = new Date().getFullYear();
      return trades.filter((trade) => new Date(trade.date).getFullYear() === year);
    }
    const limit = Number(windowMode);
    return trades.slice(-limit);
  }, [trades, windowMode]);

  const normalizedCurve = useMemo(() => {
    let cumulative = 0;
    return filteredTrades.map((trade) => {
      cumulative += trade.normalizedR;
      return cumulative;
    });
  }, [filteredTrades]);

  const liveCurve = useMemo(() => {
    let cumulative = 0;
    return filteredTrades.map((trade) => {
      cumulative += trade.dynamicR;
      return cumulative;
    });
  }, [filteredTrades]);

  const curveBounds = useMemo(() => {
    const values = [...normalizedCurve, ...liveCurve, 0];
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [normalizedCurve, liveCurve]);

  const normalizedValues = filteredTrades.map((trade) => trade.normalizedR);
  const liveValues = filteredTrades.map((trade) => trade.dynamicR);
  const distributionValues = distributionMode === 'normalized' ? normalizedValues : liveValues;

  const closedBins = useMemo(() => {
    const bins = new Array(BIN_LABELS.length).fill(0);
    for (const value of distributionValues) bins[binIndex(value)] += 1;
    return bins;
  }, [distributionValues]);

  const openBins = useMemo(() => {
    const bins = new Array(BIN_LABELS.length).fill(0);
    for (const trade of openTrades) bins[binIndex(trade.currentR)] += 1;
    return bins;
  }, [openTrades]);

  const normalizedExpectancy = filteredTrades.length ? normalizedValues.reduce((sum, value) => sum + value, 0) / filteredTrades.length : 0;
  const liveExpectancy = filteredTrades.length ? liveValues.reduce((sum, value) => sum + value, 0) / filteredTrades.length : 0;
  const normalizedCum = normalizedCurve[normalizedCurve.length - 1] || 0;
  const liveCum = liveCurve[liveCurve.length - 1] || 0;
  const riskEfficiencyRatio = normalizedCum !== 0 ? (liveCum / normalizedCum) * 100 : 100;
  const throttleDelta = liveCum - normalizedCum;
  const upsideReduced = Math.max(0, normalizedCum - liveCum);
  const drawdownNorm = maxDrawdown(normalizedCurve);
  const drawdownLive = maxDrawdown(liveCurve);

  const throttleCounts = filteredTrades.reduce(
    (acc, trade) => {
      if (trade.throttleReason === 'regime') acc.regime += 1;
      if (trade.throttleReason === 'vol') acc.vol += 1;
      if (trade.throttleReason === 'event') acc.event += 1;
      if (trade.throttleReason === 'streak') acc.streak += 1;
      return acc;
    },
    { regime: 0, vol: 0, event: 0, streak: 0 }
  );

  const mean = distributionValues.length ? distributionValues.reduce((sum, value) => sum + value, 0) / distributionValues.length : 0;
  const med = median(distributionValues);
  const stdev = stdDev(distributionValues);
  const skew = skewness(distributionValues);
  const winRate = distributionValues.length ? (distributionValues.filter((value) => value > 0).length / distributionValues.length) * 100 : 0;

  const maxBin = Math.max(1, ...closedBins, ...openBins);

  const pointsForCurve = (curve: number[]) => {
    if (!curve.length) return '';
    const width = 620;
    const height = 220;
    const xStep = curve.length > 1 ? width / (curve.length - 1) : width;
    const span = Math.max(1, curveBounds.max - curveBounds.min);

    return curve
      .map((value, index) => {
        const x = index * xStep;
        const y = height - ((value - curveBounds.min) / span) * height;
        return `${x},${y}`;
      })
      .join(' ');
  };

  return (
    <section className="msp-elite-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Risk Application Overlay</div>
          <div className="text-[0.76rem] text-[var(--msp-text-muted)]">Normalized Edge vs Live Capital Application</div>
        </div>
        <div className="flex items-center gap-1.5">
          {(['50', '100', 'YTD'] as const).map((mode) => (
            <button key={mode} onClick={() => setWindowMode(mode)} className={`rounded border px-2 py-1 text-[0.66rem] font-semibold uppercase ${windowMode === mode ? 'border-[var(--msp-border-strong)] text-[var(--msp-text)]' : 'border-[var(--msp-border)] text-[var(--msp-text-muted)]'}`}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
            <svg viewBox="0 0 620 220" className="h-[220px] w-full">
              <line x1="0" y1="0" x2="0" y2="220" stroke="rgba(255,255,255,0.12)" />
              <line x1="0" y1="220" x2="620" y2="220" stroke="rgba(255,255,255,0.12)" />
              <polyline fill="none" stroke="rgba(241,245,249,0.95)" strokeWidth="2" points={pointsForCurve(normalizedCurve)} />
              <polyline fill="none" stroke="rgba(148,163,184,0.8)" strokeWidth="2" strokeDasharray="6 5" points={pointsForCurve(liveCurve)} />
            </svg>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-2">
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Normalized Expectancy</span><span className="metric-r">{formatR(normalizedExpectancy)}</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Live Expectancy</span><span className="metric-r">{formatR(liveExpectancy)}</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Risk Efficiency Ratio</span><span className="metric-r">{riskEfficiencyRatio.toFixed(0)}%</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Max DD (Norm)</span><span className="metric-r">{formatR(drawdownNorm)}</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Max DD (Live)</span><span className="metric-r">{formatR(drawdownLive)}</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Throttle Delta</span><span className="metric-r">{formatR(throttleDelta)}</span></div>
          <div className="msp-elite-row text-[0.72rem] flex justify-between"><span>Upside Reduction</span><span className="metric-r">{formatR(-upsideReduced)}</span></div>
          <div className="msp-elite-row text-[0.7rem] text-[var(--msp-text-muted)]">Regime {throttleCounts.regime} · Vol {throttleCounts.vol} · Event {throttleCounts.event} · Streak {throttleCounts.streak}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">R Distribution Histogram</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDistributionMode('normalized')} className={`rounded border px-2 py-1 text-[0.64rem] font-semibold uppercase ${distributionMode === 'normalized' ? 'border-[var(--msp-border-strong)] text-[var(--msp-text)]' : 'border-[var(--msp-border)] text-[var(--msp-text-muted)]'}`}>Normalized R</button>
            <button onClick={() => setDistributionMode('live')} className={`rounded border px-2 py-1 text-[0.64rem] font-semibold uppercase ${distributionMode === 'live' ? 'border-[var(--msp-border-strong)] text-[var(--msp-text)]' : 'border-[var(--msp-border)] text-[var(--msp-text-muted)]'}`}>Live R</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
          {BIN_LABELS.map((label, index) => {
            const closedHeight = Math.round((closedBins[index] / maxBin) * 130);
            const openHeight = Math.round((openBins[index] / maxBin) * 130);
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="relative flex h-[140px] w-full items-end justify-center rounded border border-[var(--msp-border)] bg-[var(--msp-panel)]">
                  <div className="w-[72%] bg-emerald-500/35" style={{ height: `${closedHeight}px` }} />
                  <div className="absolute bottom-0 w-[72%] border border-dashed border-slate-300/60 bg-slate-300/15" style={{ height: `${openHeight}px` }} />
                  {index === 3 || index === 4 ? <div className="absolute inset-y-0 left-1/2 border-l border-[var(--msp-divider)]" /> : null}
                </div>
                <div className="text-center text-[0.6rem] text-[var(--msp-text-faint)]">{label}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-[0.65rem] text-[var(--msp-text-faint)]">Fixed 1R bins for consistency across periods. Closed bars are solid; open positions are ghost overlays.</div>
        <div className="mt-2 text-[0.68rem] text-[var(--msp-text-muted)]">Closed Trades: {filteredTrades.length} · Open Trades: {openTrades.length}</div>
        <div className="mt-2 grid gap-2 text-[0.7rem] text-[var(--msp-text-muted)] md:grid-cols-5">
          <div>Mean: <span className="metric-r">{formatR(mean)}</span></div>
          <div>Median: <span className="metric-r">{formatR(med)}</span></div>
          <div>Std Dev: <span className="metric-r">{stdev.toFixed(2)}R</span></div>
          <div>Skew: <span className={`metric-r ${Math.abs(skew) > 0.5 ? 'text-[var(--msp-warn)]' : ''}`}>{skew.toFixed(2)}</span></div>
          <div>Win Rate: <span className="metric-r">{winRate.toFixed(1)}%</span></div>
        </div>
      </div>
    </section>
  );
}
