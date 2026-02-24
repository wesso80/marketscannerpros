'use client';

import type { TickerContext } from '../types';

/**
 * Options / Derivatives Tab
 * Equities: IV, IV Rank, expected move, GEX, put/call ratio, top strikes.
 * Crypto: Funding rate, OI, L/S ratio, liquidations, top perpetual contracts.
 */
export default function OptionsTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, assetClass, options, cryptoDerivatives, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  // ─── Crypto Derivatives View ─────────────────────────────────────
  if (assetClass === 'crypto') {
    if (!cryptoDerivatives) {
      return (
        <div className="rounded-md border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-6 text-center">
          <p className="text-sm font-semibold text-[var(--msp-text-muted)]">No derivatives data available</p>
          <p className="mt-1 text-[10px] text-[var(--msp-text-faint)]">Derivatives data requires Pro Trader tier for {symbol}</p>
        </div>
      );
    }

    const fr = cryptoDerivatives.fundingRate;
    const frColor = fr > 0.03 ? 'text-emerald-400' : fr < -0.03 ? 'text-rose-400' : 'text-slate-300';
    const lsr = cryptoDerivatives.longShortRatio ?? 0;
    const lsColor = lsr > 1.2 ? 'text-emerald-400' : lsr < 0.8 ? 'text-rose-400' : 'text-slate-300';
    const sentColor = (cryptoDerivatives.sentiment ?? '').toLowerCase().includes('bull') ? 'text-emerald-400'
      : (cryptoDerivatives.sentiment ?? '').toLowerCase().includes('bear') ? 'text-rose-400' : 'text-amber-400';

    return (
      <div className="grid gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Derivatives Intelligence</p>
          <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Funding, OI, Leverage & Liquidations</h3>
        </div>

        {/* Top metrics row */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricCard
            label="Funding Rate"
            value={`${fr >= 0 ? '+' : ''}${fr.toFixed(4)}%`}
            sub={cryptoDerivatives.fundingAnnualized ? `${cryptoDerivatives.fundingAnnualized.toFixed(1)}% ann.` : '8h rate'}
            color={frColor}
          />
          <MetricCard
            label="Open Interest"
            value={cryptoDerivatives.openInterest ? formatLargeNumber(cryptoDerivatives.openInterest) : '—'}
            sub="Aggregate OI (USD)"
          />
          <MetricCard
            label="Long/Short"
            value={lsr > 0 ? lsr.toFixed(2) : '—'}
            sub={cryptoDerivatives.sentiment ?? 'Ratio'}
            color={lsColor}
          />
          <MetricCard
            label="Sentiment"
            value={cryptoDerivatives.sentiment ?? 'Neutral'}
            sub="Market positioning"
            color={sentColor}
          />
        </div>

        {/* Basis + Volume + Exchange count */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
            <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">Basis</p>
            <p className={`text-sm font-black ${(cryptoDerivatives.basis ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {cryptoDerivatives.basis != null ? `${cryptoDerivatives.basis > 0 ? '+' : ''}${cryptoDerivatives.basis.toFixed(3)}%` : '—'}
            </p>
            <p className="text-[9px] text-[var(--msp-text-faint)]">Futures premium</p>
          </div>
          <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
            <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">24h Volume</p>
            <p className="text-sm font-black text-cyan-400">
              {cryptoDerivatives.volume24h ? formatLargeNumber(cryptoDerivatives.volume24h) : '—'}
            </p>
            <p className="text-[9px] text-[var(--msp-text-faint)]">Derivatives volume</p>
          </div>
          <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
            <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">Exchanges</p>
            <p className="text-sm font-black text-[var(--msp-text)]">
              {cryptoDerivatives.exchangeCount ?? '—'}
            </p>
            <p className="text-[9px] text-[var(--msp-text-faint)]">Reporting sources</p>
          </div>
        </div>

        {/* Liquidations */}
        {cryptoDerivatives.liquidations && cryptoDerivatives.liquidations.total24h > 0 && (
          <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-400">24h Liquidations</p>
            <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
              <div>
                <p className="text-[10px] text-[var(--msp-text-faint)]">Longs</p>
                <p className="text-sm font-black text-rose-400">{formatLargeNumber(cryptoDerivatives.liquidations.long24h)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--msp-text-faint)]">Shorts</p>
                <p className="text-sm font-black text-emerald-400">{formatLargeNumber(cryptoDerivatives.liquidations.short24h)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--msp-text-faint)]">Total</p>
                <p className="text-sm font-black text-amber-400">{formatLargeNumber(cryptoDerivatives.liquidations.total24h)}</p>
              </div>
            </div>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${(cryptoDerivatives.liquidations.long24h / cryptoDerivatives.liquidations.total24h) * 100}%` }}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(cryptoDerivatives.liquidations.short24h / cryptoDerivatives.liquidations.total24h) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Top perpetual contracts */}
        {cryptoDerivatives.topContracts && cryptoDerivatives.topContracts.length > 0 && (
          <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Top Perpetual Contracts</p>
            <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--msp-text-faint)]">
                  <th className="pb-1 pr-2">Exchange</th>
                  <th className="pb-1 pr-2">Funding</th>
                  <th className="pb-1 pr-2">OI</th>
                  <th className="pb-1">Volume</th>
                </tr>
              </thead>
              <tbody>
                {cryptoDerivatives.topContracts.map((c, i) => (
                  <tr key={i} className="border-t border-[var(--msp-divider)]">
                    <td className="py-1 pr-2 font-semibold text-[var(--msp-text)]">{c.exchange}</td>
                    <td className={`py-1 pr-2 font-mono ${c.fundingRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {c.fundingRate >= 0 ? '+' : ''}{c.fundingRate.toFixed(4)}%
                    </td>
                    <td className="py-1 pr-2 text-[var(--msp-text-muted)]">{formatLargeNumber(c.openInterest)}</td>
                    <td className="py-1 text-[var(--msp-text-muted)]">{formatLargeNumber(c.volume24h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Equity Options View ─────────────────────────────────────────
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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="IV" value={`${(options.iv ?? 0).toFixed(1)}%`} sub="Implied Volatility" />
        <MetricCard label="IV Rank" value={`${(options.ivRank ?? 0).toFixed(0)}%`} sub="Percentile" color={ivColor} />
        <MetricCard label="Expected Move" value={`±${(options.expectedMove ?? 0).toFixed(1)}%`} sub="Next expiry" />
        <MetricCard label="Put/Call" value={(options.putCallRatio ?? 0).toFixed(2)} sub="Volume ratio" color={pcrColor} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">GEX</p>
          <p className={`text-sm font-black ${(options.gex ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {options.gex !== undefined ? (options.gex > 0 ? '+' : '') + options.gex.toFixed(0) : '—'}
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)]">Gamma Exposure</p>
        </div>
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-[var(--msp-text-faint)]">Max Pain</p>
          <p className="text-sm font-black text-cyan-400">${(options.maxPain ?? 0).toFixed(2)}</p>
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

      {options.topStrikes && options.topStrikes.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Top Strikes by Volume</p>
          <div className="overflow-x-auto">
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
                  <td className="py-1 pr-2 font-mono text-[var(--msp-text)]">${(s.strike ?? 0).toFixed(2)}</td>
                  <td className={`py-1 pr-2 font-semibold ${s.type === 'call' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(s.type ?? 'call').toUpperCase()}
                  </td>
                  <td className="py-1 pr-2 text-[var(--msp-text-muted)]">{(s.volume ?? 0).toLocaleString()}</td>
                  <td className="py-1 text-[var(--msp-text-muted)]">{(s.oi ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

function formatLargeNumber(n: number): string {
  if (!n || !Number.isFinite(n)) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
