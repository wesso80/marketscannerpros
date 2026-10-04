import React from 'react';
import type { sectorCells } from '@/lib/overview/today';
import StampLine, { type StampLineProps } from './StampLine';
import { COPY } from './copy';
export default function HeatStrip({ cells, stamp }: { cells: ReturnType<typeof sectorCells>; stamp: StampLineProps }) {
  return <figure className="min-w-0 space-y-3">
    {cells.length ? <div role="img" aria-label={`${COPY.today.sectors}: ${cells.map(c => `${c.symbol} ${c.valueLabel}`).join(', ')}`} className="flex">
      {cells.map(cell => <div key={cell.symbol} data-sector-cell={cell.symbol} title={`${cell.name} (${cell.symbol}): ${cell.valueLabel}`}
        className="relative min-w-0 flex-1 overflow-hidden border border-[var(--msp-panel)] py-4 text-center" style={{ color: cell.tone.color }}>
        <span aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: cell.tone.color, opacity: cell.tone.opacity }} />
        <span aria-hidden="true" className="relative block text-[10px] font-bold">{cell.symbol}</span>
        <span aria-hidden="true" className={`relative text-[9px] ${cell.changePercent === null ? 'block' : 'hidden sm:block'}`}>{cell.valueLabel}</span>
      </div>)}
    </div> : <p>{COPY.today.noSectors}</p>}
    <figcaption><p className="text-xs text-[var(--msp-text-muted)]">{COPY.today.sectors}</p><StampLine {...stamp} /></figcaption>
  </figure>;
}
