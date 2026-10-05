import React from 'react';
import { marketText } from '@/lib/marketsPresentation';
import HeatStrip from '@/components/visual/HeatStrip';
import StatCard from '@/components/visual/StatCard';
import { COPY } from '@/components/visual/copy';
import { sectorCells, type SectorInput } from '@/lib/overview/today';
import { quoteStamp, type DisplayQuote } from '@/lib/market/quotePresentation';
import { priceText } from '@/lib/market/priceStamp';
import type { StrengthRanking } from '@/lib/analysis/commandCenter';
export default function TodayStrip({ regime, loading, hasRegimeData, regimeColor, sectors, sectorTime, sectorDay, strength, quotes, quotesLoading = false }: {
  regime: { regimeLabel: string; available: boolean; stale: boolean; asOf: string | null };
  loading: boolean; hasRegimeData: boolean; regimeColor: string;
  sectors: SectorInput[]; sectorTime?: string | null; sectorDay?: string | null;
  strength: StrengthRanking; quotes?: Record<string, DisplayQuote>; quotesLoading?: boolean;
}) {
  const c = COPY.today;
  const sectorStamp = { source: c.sectorSource, asOf: sectorTime, tradingDay: sectorDay, basis: c.lastClose };
  return <section aria-label={c.overview} data-today-strip className="min-w-0 space-y-3 border border-white/10 bg-[var(--msp-panel)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }}>
    <p data-today-verdict className="text-2xl font-bold" style={{ color: regimeColor }}>{regime.available ? marketText(regime.regimeLabel) : "Market assessment not collected"}</p>
    <HeatStrip cells={sectorCells(sectors)} stamp={sectorStamp} hideStamp />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {([c.btc, c.eth, c.spy] as const).map(symbol => {
        const raw = quotes?.[symbol];
        const quote = quoteStamp(symbol, symbol === c.spy ? 'equity' : 'crypto', raw);
        const measured = typeof raw?.price === 'number' && Number.isFinite(raw.price) && raw.price !== 0;
        return measured ? <StatCard key={symbol} label={symbol} value={priceText(quote.price)} /> : null;
      })}
      <StatCard label={c.sectorsUp} value={strength.total ? `${Math.round(strength.greenRatio * strength.total)} / ${strength.total}` : "Not collected"} />
    </div>
  </section>;
}
