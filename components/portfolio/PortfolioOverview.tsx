import StatTile from '@/components/visual/StatTile';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import { formatMoney, formatSignedMoney } from '@/lib/portfolio/formatMoney';

type Allocation = { symbol: string; value: number; percentage: number };
/** Presentation only. An open P&L value is never passed off as today's movement. */
export default function PortfolioOverview({ value, openPL, allocation, limit }: {
  value: number; openPL: number; allocation: Allocation[]; limit: number;
}) {
  const largest = allocation[0];
  const shades = ['#e2e8f0', '#94a3b8', '#64748b', '#475569', '#334155'];
  let offset = 0;
  return <section className="min-w-0 space-y-3" aria-label="Portfolio overview">
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 lg:grid-cols-4 [&_[data-stat-card]>p:first-child]:whitespace-nowrap [&_[data-stat-card]>p:first-child]:break-normal">
      <StatTile label="Value simulated" value={formatMoney(value)} />
      <div className="[&_[data-stat-card]]:h-full [&_[data-stat-card]>p:first-child]:text-base"><StatTile label="Today" value="Not measured" /></div>
      <StatTile label="Open P&L" value={formatSignedMoney(openPL)} />
      <StatTile label="Largest position" value={largest ? `${largest.percentage.toFixed(1)}%` : null} warning={Boolean(largest && largest.percentage > limit)} />
    </div>
    <p className="text-xs text-slate-400">A daily change needs a matching prior-session valuation. Open P&amp;L uses recorded cost.</p>
    <figure className="rounded-lg border border-slate-700 p-3">
      <figcaption className="text-sm font-semibold">Allocation · {allocation.length} positions</figcaption>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 120 120" role="img" aria-label="Allocation by recorded position value" className="h-36 w-36 shrink-0">
          <circle cx="60" cy="60" r="42" fill="none" stroke="#334155" strokeWidth="16" />
          {allocation.map((item, i) => {
            const start = offset; offset += item.percentage;
            return <circle key={`${item.symbol}-${i}`} cx="60" cy="60" r="42" pathLength="100" fill="none" stroke={shades[i % shades.length]} strokeWidth="16" strokeDasharray={`${item.percentage} ${100 - item.percentage}`} strokeDashoffset={-start} transform="rotate(-90 60 60)"><title>{item.symbol}: {item.percentage.toFixed(1)}%</title></circle>;
          })}
        </svg>
        <ul className="min-w-0 flex-1 space-y-1 text-sm">{allocation.slice(0, 5).map((item, i) => <li className="flex justify-between gap-3" key={`${item.symbol}-${i}`}><span>{item.symbol}</span><span>{item.percentage.toFixed(1)}%</span></li>)}</ul>
      </div>
      {allocation.length > 5 && <CollapsibleSection title="All allocations" summary={`${allocation.length} positions`}><ul className="space-y-1 text-sm">{allocation.map((item, i) => <li key={`${item.symbol}-${i}`}>{item.symbol} · {item.percentage.toFixed(1)}% · {formatMoney(item.value)}</li>)}</ul></CollapsibleSection>}
    </figure>
  </section>;
}
