import { DashboardData } from './types';

function formatOI(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

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
                  <div className="text-xs font-semibold text-white">{Number.isFinite(fr.fundingRatePercent) ? fr.fundingRatePercent.toFixed(4) + '%' : 'Unavailable'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-xs font-semibold text-white/80 mb-2">Long / Short Ratio</div>
            <div className="grid gap-2">
              {!data.longShort && <p className="text-xs text-white/50">Unavailable — exchange-reported account ratios are not connected. Funding is not an account-positioning measurement.</p>}
              {(data.longShort?.coins || []).slice(0, 6).map((ls) => (
                <div key={ls.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{ls.symbol}</span>
                    <span className="text-white/60">{Number.isFinite(ls.longAccount) && Number.isFinite(ls.shortAccount) ? ls.longAccount.toFixed(1) + ' / ' + ls.shortAccount.toFixed(1) : 'Unavailable'}</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-black/30 overflow-hidden">
                    <div className="h-2 rounded bg-emerald-500/60" style={{ width: `${ls.longAccount}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-white/80">Open Interest</div>
              {data.openInterest?.summary?.totalOpenInterestFormatted && (
                <div className="text-xs text-emerald-400 font-mono">{data.openInterest.summary.totalOpenInterestFormatted} total</div>
              )}
            </div>
            <p className="mb-2 text-[11px] text-white/50">{data.openInterest?.summary?.coverage}</p>
            {data.openInterest?.summary?.comparisonReason && <p className="mb-2 text-xs text-amber-200">{data.openInterest.summary.comparisonReason}</p>}
            <div className="grid gap-2">
              {(data.openInterest?.coins || []).slice(0, 6).map((coin) => {
                const chg = coin.change24h;
                const colorCls = chg != null && chg > 0 ? 'text-emerald-400' : chg != null && chg < 0 ? 'text-red-400' : 'text-white/50';
                return (
                  <div key={coin.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{coin.symbol}</span>
                      <span className="text-[11px] text-white/40 font-mono">{coin.openInterestFormatted || formatOI(coin.openInterestValue)}</span>
                    </div>
                    <div className={`text-xs font-semibold font-mono ${colorCls}`}>{chg == null || !Number.isFinite(chg) ? 'Unavailable' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}</div>
                  </div>
                );
              })}
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
            <div className="text-xs font-semibold text-white/80">Verified liquidations</div>
            <div className="text-[11px] text-white/50">Complete window and notional coverage required</div>
            {!data.liquidations && <p className="mt-2 text-xs text-white/50">Unavailable — the previous recent OKX sample did not establish a complete 24-hour USD total.</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-[11px] text-white/50">Longs</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {data.liquidations?.summary?.totalLongValue == null
                    ? 'Unavailable'
                    : '$' + (data.liquidations.summary.totalLongValue / 1e6).toFixed(1) + 'M'}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-[11px] text-white/50">Shorts</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {data.liquidations?.summary?.totalShortValue == null
                    ? 'Unavailable'
                    : '$' + (data.liquidations.summary.totalShortValue / 1e6).toFixed(1) + 'M'}
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {(data.liquidations?.coins || []).slice(0, 5).map((coin) => (
                <div key={coin.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{coin.symbol}</span>
                    <span className="text-white/60">
                      L {coin.longValue == null ? 'Unavailable' : '$' + (coin.longValue / 1e6).toFixed(1) + 'M'}
                      {' • '}
                      S {coin.shortValue == null ? 'Unavailable' : '$' + (coin.shortValue / 1e6).toFixed(1) + 'M'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80">24h Price Move</div>
              <div className="mt-1 text-sm font-semibold text-white">{volRegime}</div>
              <div className="mt-1 text-xs text-white/50">
                {volRegime === 'Unavailable' ? 'Price-move context unavailable.' : 'Largest absolute BTC/ETH/SOL 24h return: large ≥3%, moderate ≥1.5%, small <1.5%. This is not measured volatility.'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80">Open-Interest Trend</div>
              <div className="mt-1 text-sm font-semibold text-white">{liquidityState}</div>
              <div className="mt-1 text-xs text-white/50">
                {liquidityState === 'Unavailable' ? 'A comparable 24-hour open-interest baseline is unavailable.' : liquidityState === 'Contracting' ? 'Observed open interest is contracting.' : liquidityState === 'Expanding' ? 'Observed open interest is expanding.' : 'Observed open-interest state is mixed.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
