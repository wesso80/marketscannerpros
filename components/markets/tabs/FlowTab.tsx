'use client';

import type { TickerContext } from '../types';

/**
 * Flow Tab — Volume spikes, OI, funding rate, liquidity, capital flow.
 * Absorbs the Crypto Dashboard derivatives data + CapitalFlowCard intelligence.
 * Gated to Pro Trader tier.
 */
export default function FlowTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, flow, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  if (!flow) {
    return (
      <div className="rounded-md border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-6 text-center">
        <p className="text-sm font-semibold text-[var(--msp-text-muted)]">No flow data available</p>
        <p className="mt-1 text-[10px] text-[var(--msp-text-faint)]">Capital flow / options flow data requires Pro Trader tier for {symbol}</p>
      </div>
    );
  }

  const bias = flow.bias ?? 'neutral';
  const gammaState = flow.gamma_state ?? 'Unknown';
  const marketMode = flow.market_mode ?? 'chop';
  const biasColor = bias === 'bullish' ? 'text-emerald-400' : bias === 'bearish' ? 'text-rose-400' : 'text-slate-400';
  const gammaColor = gammaState === 'Positive' ? 'text-emerald-400' : gammaState === 'Negative' ? 'text-rose-400' : 'text-amber-400';
  const modeColor = marketMode === 'launch' ? 'text-emerald-400' : marketMode === 'pin' ? 'text-cyan-400' : 'text-amber-400';

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Flow Analysis</p>
        <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Capital Flow, Gamma, Liquidity</h3>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <FlowCard label="Market Mode" value={marketMode.toUpperCase()} color={modeColor} />
        <FlowCard label="Gamma State" value={gammaState} color={gammaColor} />
        <FlowCard label="Bias" value={bias.toUpperCase()} color={biasColor} />
        <FlowCard label="Conviction" value={`${Math.round(flow.conviction ?? 0)}%`} color={(flow.conviction ?? 0) > 60 ? 'text-emerald-400' : 'text-amber-400'} />
      </div>

      {/* Key strikes */}
      {flow.key_strikes && flow.key_strikes.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Key Strikes — Gravity Centers</p>
          <div className="space-y-1">
            {flow.key_strikes.slice(0, 6).map((ks, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[var(--msp-text)]">${(ks.strike ?? 0).toFixed(2)}</span>
                  <span className={`text-[10px] font-semibold ${
                    ks.type === 'call-heavy' ? 'text-emerald-400' : ks.type === 'put-heavy' ? 'text-rose-400' : 'text-amber-400'
                  }`}>
                    {ks.type ?? 'unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-16 rounded-full bg-[var(--msp-panel)]">
                    <div
                      className="h-1.5 rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.min(100, ks.gravity)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--msp-text-faint)]">{(ks.gravity ?? 0).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flip zones */}
      {flow.flip_zones && flow.flip_zones.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Gamma Flip Zones</p>
          <div className="grid grid-cols-2 gap-2">
            {flow.flip_zones.map((fz, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-[var(--msp-text)]">${(fz.level ?? 0).toFixed(2)}</span>
                <span className={`text-[10px] font-semibold ${fz.direction === 'bullish_above' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {fz.direction === 'bullish_above' ? '▲ Bullish Above' : '▼ Bearish Below'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liquidity levels */}
      {flow.liquidity_levels && flow.liquidity_levels.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Liquidity Levels</p>
          <div className="space-y-1">
            {flow.liquidity_levels.slice(0, 5).map((ll, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[var(--msp-text)]">${(ll.level ?? 0).toFixed(2)}</span>
                  <span className="text-[var(--msp-text-muted)]">{ll.label ?? ''}</span>
                </div>
                <span className="text-[10px] text-cyan-400">{((ll.prob ?? 0) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most likely path */}
      {flow.most_likely_path && flow.most_likely_path.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Most Likely Path</p>
          <ol className="space-y-0.5">
            {flow.most_likely_path.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--msp-text-muted)]">
                <span className="font-bold text-[var(--msp-accent)]">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Risk factors */}
      {flow.risk && flow.risk.length > 0 && (
        <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-400">Risk Factors</p>
          <ul className="space-y-0.5">
            {flow.risk.map((r, i) => (
              <li key={i} className="text-[11px] text-rose-300/80">• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlowCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">{label}</p>
      <p className={`text-sm font-black ${color}`}>{value}</p>
    </div>
  );
}
