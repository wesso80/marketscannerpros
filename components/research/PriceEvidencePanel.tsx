'use client';
import type { PriceEvidence } from '@/lib/research/priceEvidence';
import { PRICE_EVIDENCE } from '@/lib/research/priceEvidence';

const num = (v: number | null | undefined, dp = 2) => (v == null ? 'Not available' : v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
const pct = (v: number | null | undefined) => (v == null ? '' : ` (${v >= 0 ? '+' : ''}${v.toFixed(2)}% from close)`);

/** Measured price and volatility observations with their basis (no score, grade or forecast). `section="price"` leaves out the volatility rows, which the Symbol page shows in its own Volatility section. */
export default function PriceEvidencePanel({ e, section = 'all' }: { e: PriceEvidence; section?: 'all' | 'price' }) {
  const P = PRICE_EVIDENCE;
  const all: { label: string; value: string; note?: string; vol?: boolean }[] = [
    { label: 'Close', value: num(e.close, 4) },
    ...e.averages.map((a) => ({ label: `${a.kind}${a.length}`, value: `${num(a.value, 4)}${pct(a.pctFromClose)}`, note: a.side ? `close ${a.side}` : undefined })),
    { label: 'ADX14 (+DI / −DI)', value: e.adx.adx == null ? 'Not available' : `${num(e.adx.adx, 1)} (${num(e.adx.plusDI, 1)} / ${num(e.adx.minusDI, 1)})`, note: e.states.trend ? `${e.states.trend}: below ${P.adx.developing} weak, ${P.adx.strong}+ strong` : undefined },
    { label: 'RSI14', value: num(e.rsi14, 1) },
    { vol: true, label: 'ATR14', value: e.atr14 == null ? 'Not available' : `${num(e.atr14, 4)} (${num(e.atrPct, 2)}% of close)` },
    { vol: true, label: 'Realised volatility (20 days, annualised)', value: e.realisedVol20 == null ? 'Not available' : `${e.realisedVol20}%` },
    { vol: true, label: 'BBWP (band-width percentile, 1 year)', value: num(e.bbwp, 1), note: e.states.volatility ? `${e.states.volatility}: below ${P.bbwp.compressed} compressed, above ${P.bbwp.expanded} expanded` : undefined },
    { label: `Volume vs prior ${P.volumeLookback} sessions`, value: e.volumeRatio == null ? 'Not available' : `${e.volumeRatio}×`, note: e.states.volume ?? undefined },
  ];
  const rows = section === 'price' ? all.filter((r) => !r.vol) : all;
  const summary = section === 'price' ? e.summary.slice(0, 1) : e.summary;
  return (
    <div className="space-y-2 text-sm" data-price-evidence>
      {summary.map((s) => <p key={s}>{s}</p>)}
      <p className="text-xs text-slate-400" data-evidence-basis>
        Daily measures use the completed bar of {e.basis.lastCompletedBar ?? 'n/a'} ({e.basis.barsUsed} bars{e.basis.source ? `, ${e.basis.source}` : ''}).
        {e.basis.excludedPartialBar ? ` The unfinished ${e.basis.excludedPartialBar} bar is excluded.` : ''}
        {e.quote ? ` Latest price ${num(e.quote.price, 4)}${e.quote.at ? ` (as of ${e.quote.at})` : ''}, which can differ from the close used here.` : ''}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1">
            <dt className="text-slate-400">{r.label}</dt>
            <dd className="text-right">{r.value}{r.note ? <span className="block text-xs text-slate-500">{r.note}</span> : null}</dd>
          </div>
        ))}
      </dl>
      {e.missing.length > 0 && <p className="text-xs text-slate-500">Not available: {e.missing.join('; ')}.</p>}
      <p className="text-xs text-slate-500">Descriptions use the stated thresholds. They describe the current bar; they are not forecasts.</p>
    </div>
  );
}
