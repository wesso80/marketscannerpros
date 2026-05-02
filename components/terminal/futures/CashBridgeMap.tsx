import type { CashBridgeState } from '@/lib/terminal/futures/cashBridgeMap';

type CashBridgeMapProps = {
  symbol: string;
  cashBridge?: CashBridgeState;
  fallbackMessage: string;
};

export default function CashBridgeMap({ symbol, cashBridge, fallbackMessage }: CashBridgeMapProps) {
  if (!cashBridge) {
    return (
      <section className="rounded-lg border border-slate-700 bg-slate-950/50 p-3" aria-label="Cash bridge map">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Commodity Session Map</div>
        <p className="mt-1 text-xs text-slate-400">{fallbackMessage}</p>
        <p className="mt-1 text-xs text-slate-500">Symbol {symbol} uses futures-only session context.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-sky-500/25 bg-slate-950/50 p-3" aria-label="Cash bridge map">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-sky-200">Cash Bridge</div>
      <div className="rounded border border-white/10 bg-slate-900/60 p-2 text-sm font-black text-white">{cashBridge.label}</div>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1 text-slate-200">Future: {cashBridge.future}</div>
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1 text-slate-200">ETF: {cashBridge.etf}</div>
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1 text-slate-200">Cash Index: {cashBridge.cashIndex}</div>
      </div>
      <p className="mt-2 text-xs text-slate-400">This bridge highlights timing alignment and divergence context across futures and cash instruments.</p>
    </section>
  );
}
