'use client';

import type { TickerContext } from '../types';

/**
 * Options Tab — IV, IV Rank, expected move, GEX, put/call ratio, top strikes.
 * Absorbs the Options Confluence page and options-scan data.
 * Gated to Pro Trader tier.
 */
export default function OptionsTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, options, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  if (!options) {
    return (
      <div className="rounded-md border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-6 text-center">
        <p className="text-sm font-semibold text-[var(--msp-text-muted)]">No options data available</p>
        <p className="mt-1 text-[10px] text-[var(--msp-text-faint)]">Options data requires Pro Trader tier for {symbol}</p>
      </div>
    );
  }

  const ivColor = options.ivRank > 70 ? 'text-red-400' : options.ivRank > 40 ? 'text-amber-400' : 'text-emerald-400';
  const pcrColor = options.putCallRatio > 1.2 ? 'text-red-400' : options.putCallRatio < 0.7 ? 'text-emerald-400' : 'text-slate-300';

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Options Intelligence</p>
        <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Greeks, IV, Flow & Dealer Positioning</h3>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="IV" value={`${options.iv.toFixed(1)}%`} sub="Implied Volatility" />
        <MetricCard label="IV Rank" value={`${options.ivRank.toFixed(0)}%`} sub="Percentile" color={ivColor} />
        <MetricCard label="Expected Move" value={`±${options.expectedMove.toFixed(1)}%`} sub="Next expiry" />
        <MetricCard label="Put/Call" value={options.putCallRatio.toFixed(2)} sub="Volume ratio" color={pcrColor} />
      </div>

      {/* GEX + Max Pain + DEX */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">GEX</p>
          <p className={`text-sm font-black ${(options.gex ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {options.gex !== undefined ? (options.gex > 0 ? '+' : '') + options.gex.toFixed(0) : '—'}
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)]">Gamma Exposure</p>
        </div>
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">Max Pain</p>
          <p className="text-sm font-black text-cyan-400">${options.maxPain.toFixed(2)}</p>
          <p className="text-[9px] text-[var(--msp-text-faint)]">Strike price</p>
        </div>
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">DEX</p>
          <p className={`text-sm font-black ${(options.dex ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {options.dex !== undefined ? (options.dex > 0 ? '+' : '') + options.dex.toFixed(0) : '—'}
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)]">Delta Exposure</p>
        </div>
      </div>

      {/* Top strikes table */}
      {options.topStrikes && options.topStrikes.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Top Strikes by Volume</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--msp-text-faint)]">
                <th className="pb-1 pr-2">Strike</th>
                <th className="pb-1 pr-2">Type</th>
                <th className="pb-1 pr-2">Volume</th>
                <th className="pb-1">OI</th>
              </tr>
            </thead>
            <tbody>
              {options.topStrikes.slice(0, 8).map((s, i) => (
                <tr key={i} className="border-t border-[var(--msp-divider)]">
                  <td className="py-1 pr-2 font-mono text-[var(--msp-text)]">${s.strike.toFixed(2)}</td>
                  <td className={`py-1 pr-2 font-semibold ${s.type === 'call' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {s.type.toUpperCase()}
                  </td>
                  <td className="py-1 pr-2 text-[var(--msp-text-muted)]">{s.volume.toLocaleString()}</td>
                  <td className="py-1 text-[var(--msp-text-muted)]">{s.oi.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">{label}</p>
      <p className={`text-sm font-black ${color ?? 'text-[var(--msp-text)]'}`}>{value}</p>
      <p className="text-[9px] text-[var(--msp-text-faint)]">{sub}</p>
    </div>
  );
}
