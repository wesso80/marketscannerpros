import { MarketStripItem } from './types';

interface DerivativesMarketStripProps {
  items: MarketStripItem[];
}

export default function DerivativesMarketStrip({ items }: DerivativesMarketStripProps) {
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const changeClass = (item.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
          return (
            <div key={item.symbol} className="rounded-xl border border-white/10 bg-black/10 p-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{item.symbol}</span>
                {item.price !== undefined ? (
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      ${item.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs ${changeClass}`}>
                      {(item.change24h || 0) >= 0 ? '+' : ''}{(item.change24h || 0).toFixed(2)}%
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs">Refreshing...</div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">OI Δ</div>
                  <div className="text-xs font-semibold text-white/80">{item.oiDelta >= 0 ? '+' : ''}{item.oiDelta.toFixed(2)}%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">Funding</div>
                  <div className="text-xs font-semibold text-white/80">{item.fundingSkew >= 0 ? '+' : ''}{item.fundingSkew.toFixed(3)}%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">Vol</div>
                  <div className="text-xs font-semibold text-white/80">{item.volLabel}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
