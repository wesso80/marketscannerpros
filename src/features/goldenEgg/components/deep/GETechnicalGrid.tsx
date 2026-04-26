import type { DeepAnalysisData } from '@/src/features/goldenEgg/types';

type Props = { indicators: NonNullable<DeepAnalysisData['indicators']>; price?: number | null };

function indicatorColor(name: string, value: number | null): string {
  if (value == null) return 'text-slate-400';
  if (name === 'rsi') {
    if (value > 70) return 'text-rose-400';
    if (value > 55) return 'text-emerald-400';
    if (value < 30) return 'text-emerald-400';
    if (value < 45) return 'text-rose-400';
    return 'text-amber-300';
  }
  if (name === 'macd' || name === 'macdHist') return value > 0 ? 'text-emerald-400' : 'text-rose-400';
  if (name === 'adx') return value > 25 ? 'text-emerald-400' : 'text-amber-300';
  return 'text-white';
}

function badge(name: string, value: number | null): { text: string; color: string } {
  if (value == null) return { text: 'N/A', color: 'bg-slate-700 text-slate-400' };
  if (name === 'rsi') {
    if (value > 70) return { text: 'Overbought', color: 'bg-rose-500/20 text-rose-300' };
    if (value < 30) return { text: 'Oversold', color: 'bg-emerald-500/20 text-emerald-300' };
    if (value > 55) return { text: 'Bullish', color: 'bg-emerald-500/20 text-emerald-300' };
    if (value < 45) return { text: 'Bearish', color: 'bg-rose-500/20 text-rose-300' };
    return { text: 'Neutral', color: 'bg-amber-500/20 text-amber-300' };
  }
  if (name === 'macd' || name === 'macdHist') {
    return value > 0
      ? { text: 'Bullish', color: 'bg-emerald-500/20 text-emerald-300' }
      : { text: 'Bearish', color: 'bg-rose-500/20 text-rose-300' };
  }
  if (name === 'adx') {
    if (value > 50) return { text: 'Strong Trend', color: 'bg-emerald-500/20 text-emerald-300' };
    if (value > 25) return { text: 'Trending', color: 'bg-emerald-500/20 text-emerald-300' };
    return { text: 'Weak/Range', color: 'bg-amber-500/20 text-amber-300' };
  }
  return { text: '', color: '' };
}

export default function GETechnicalGrid({ indicators, price }: Props) {
  const items: { label: string; key: string; value: string; raw: number | null }[] = [
    { label: 'RSI (14)', key: 'rsi', value: indicators.rsi?.toFixed(1) ?? '—', raw: indicators.rsi },
    { label: 'MACD', key: 'macd', value: indicators.macd?.toFixed(4) ?? '—', raw: indicators.macd },
    { label: 'MACD Histogram', key: 'macdHist', value: indicators.macdHist?.toFixed(4) ?? '—', raw: indicators.macdHist },
    { label: 'MACD Signal', key: 'macdSignal', value: indicators.macdSignal?.toFixed(4) ?? '—', raw: indicators.macdSignal },
    { label: 'SMA 20', key: 'sma20', value: indicators.sma20 != null ? `$${indicators.sma20.toFixed(2)}` : '—', raw: indicators.sma20 },
    { label: 'SMA 50', key: 'sma50', value: indicators.sma50 != null ? `$${indicators.sma50.toFixed(2)}` : '—', raw: indicators.sma50 },
    { label: 'BB Upper', key: 'bbUpper', value: indicators.bbUpper != null ? `$${indicators.bbUpper.toFixed(2)}` : '—', raw: indicators.bbUpper },
    { label: 'BB Lower', key: 'bbLower', value: indicators.bbLower != null ? `$${indicators.bbLower.toFixed(2)}` : '—', raw: indicators.bbLower },
    { label: 'ADX', key: 'adx', value: indicators.adx?.toFixed(1) ?? '—', raw: indicators.adx },
  ];

  // Position vs SMAs
  const smaComparisons: { label: string; pct: number }[] = [];
  if (price && indicators.sma20 != null) {
    smaComparisons.push({ label: 'vs SMA20', pct: ((price - indicators.sma20) / indicators.sma20) * 100 });
  }
  if (price && indicators.sma50 != null) {
    smaComparisons.push({ label: 'vs SMA50', pct: ((price - indicators.sma50) / indicators.sma50) * 100 });
  }

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">Technical Indicators</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(({ label, key, value, raw }) => {
          const b = badge(key, raw);
          return (
            <div key={key} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
              <div className={`mt-0.5 text-base font-bold ${indicatorColor(key, raw)}`}>{value}</div>
              {b.text && (
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${b.color}`}>{b.text}</span>
              )}
            </div>
          );
        })}
      </div>

      {smaComparisons.length > 0 && (
        <div className="mt-3 flex gap-3">
          {smaComparisons.map(({ label, pct }) => (
            <span key={label} className="text-xs text-slate-400">
              Price {label}:{' '}
              <span className={pct > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
