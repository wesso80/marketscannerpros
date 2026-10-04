import React from 'react';
import HeroStrip from '@/components/visual/HeroStrip';
import HeatStrip from '@/components/visual/HeatStrip';
import StatCard from '@/components/visual/StatCard';
import { COPY } from '@/components/visual/copy';
import { sectorCells, type SectorInput } from '@/lib/overview/today';
import { quoteStamp, type DisplayQuote } from '@/lib/market/quotePresentation';
import { priceText } from '@/lib/market/priceStamp';
import type { StrengthRanking } from '@/lib/analysis/commandCenter';
export default function TodayStrip({ regime, loading, hasRegimeData, regimeColor, sectors, sectorTime, sectorDay, strength, quotes }: {
  regime: { regimeLabel: string; available: boolean; stale: boolean; asOf: string | null };
  loading: boolean; hasRegimeData: boolean; regimeColor: string;
  sectors: SectorInput[]; sectorTime?: string | null; sectorDay?: string | null;
  strength: StrengthRanking; quotes?: Record<string, DisplayQuote>;
}) {
  const c = COPY.today;
  const freshness = loading && !hasRegimeData ? c.loading : !regime.available ? c.unavailable : regime.stale ? c.stale : c.current;
  const sectorStamp = { source: c.sectorSource, asOf: sectorTime, tradingDay: sectorDay, basis: c.lastClose };
  return <section data-today-strip className="min-w-0 space-y-3 border border-white/10 bg-[var(--msp-panel)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }}>
    <HeroStrip subject={c.overview} headline={regime.regimeLabel} color={regimeColor} freshness={freshness} stamp={{ source: c.regime, asOf: regime.asOf, basis: c.snapshot }} />
    <HeatStrip cells={sectorCells(sectors)} stamp={sectorStamp} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {([c.btc, c.eth, c.spy] as const).map(symbol => {
        const quote = quoteStamp(symbol, symbol === c.spy ? 'equity' : 'crypto', quotes?.[symbol]);
        return <StatCard key={symbol} label={symbol} value={priceText(quote.price)} stamp={{ quote }} />;
      })}
      <StatCard label={c.sectorsUp} value={strength.total ? `${Math.round(strength.greenRatio * strength.total)} / ${strength.total}` : c.na} stamp={sectorStamp} />
    </div>
  </section>;
}
