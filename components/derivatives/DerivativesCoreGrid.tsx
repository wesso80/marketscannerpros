import { DashboardData } from './types';

interface DerivativesCoreGridProps {
  data: DashboardData;
  volRegime: string;
  liquidityState: string;
}

export default function DerivativesCoreGrid({ data, volRegime, liquidityState }: DerivativesCoreGridProps) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/5">
        <div className="px-3 py-3 md:px-4">
          <div className="text-sm font-semibold text-white">Positioning</div>
          <div className="text-xs text-white/50">Funding + Long/Short + Open Interest</div>
        </div>
        <div className="grid gap-3 border-t border-white/10 p-3 md:p-4">
          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-xs font-semibold text-white/80 mb-2">Funding Rates</div>
            <div className="grid gap-2">
              {(data.fundingRates?.coins || []).slice(0, 6).map((fr) => (
                <div key={fr.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-xs text-white/70">{fr.symbol}</div>
                  <div className="text-xs font-semibold text-white">{fr.fundingRatePercent.toFixed(4)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-xs font-semibold text-white/80 mb-2">Long / Short Ratio</div>
            <div className="grid gap-2">
              {(data.longShort?.coins || []).slice(0, 6).map((ls) => (
                <div key={ls.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{ls.symbol}</span>
                    <span className="text-white/60">{ls.longAccount.toFixed(1)} / {ls.shortAccount.toFixed(1)}</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-black/30 overflow-hidden">
                    <div className="h-2 rounded bg-emerald-500/60" style={{ width: `${ls.longAccount}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-xs font-semibold text-white/80 mb-2">Open Interest (Δ 24h)</div>
            <div className="grid gap-2">
              {(data.openInterest?.coins || []).slice(0, 6).map((coin) => (
                <div key={coin.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-xs text-white/70">{coin.symbol}</div>
                  <div className="text-xs font-semibold text-white">{coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5">
        <div className="px-3 py-3 md:px-4">
          <div className="text-sm font-semibold text-white">Stress</div>
          <div className="text-xs text-white/50">Liquidations + Volatility + Liquidity</div>
        </div>
        <div className="grid gap-3 border-t border-white/10 p-3 md:p-4">
          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-xs font-semibold text-white/80">Liquidations (24h)</div>
            <div className="text-[11px] text-white/50">Directional stress + confirmation</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-[11px] text-white/50">Longs</div>
                <div className="mt-1 text-sm font-semibold text-white">${(((data.liquidations?.summary?.totalLongValue || 0) / 1e6)).toFixed(2)}M</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-[11px] text-white/50">Shorts</div>
                <div className="mt-1 text-sm font-semibold text-white">${(((data.liquidations?.summary?.totalShortValue || 0) / 1e6)).toFixed(2)}M</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {(data.liquidations?.coins || []).slice(0, 5).map((coin) => (
                <div key={coin.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{coin.symbol}</span>
                    <span className="text-white/60">L ${(coin.longValue / 1e6).toFixed(1)}M • S ${(coin.shortValue / 1e6).toFixed(1)}M</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80">Volatility Regime</div>
              <div className="mt-1 text-sm font-semibold text-white">{volRegime}</div>
              <div className="mt-1 text-xs text-white/50">
                {volRegime === 'Expansion' ? 'Wicks likely — avoid chasing entries.' : 'Volatility is manageable for structured entries.'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80">Liquidity</div>
              <div className="mt-1 text-sm font-semibold text-white">{liquidityState}</div>
              <div className="mt-1 text-xs text-white/50">
                {liquidityState === 'Contracting' ? 'Lower follow-through probability.' : 'Sufficient participation for cleaner setups.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
