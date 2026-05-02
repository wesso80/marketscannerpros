import type { FuturesTerminalResponse } from '@/app/v2/_lib/api';
import { getCashBridgeFallbackMessage } from '@/lib/terminal/futures/cashBridgeMap';
import FuturesRiskNotice from '@/components/terminal/futures/FuturesRiskNotice';
import FuturesSessionCard from '@/components/terminal/futures/FuturesSessionCard';
import FuturesCloseClusterTimeline from '@/components/terminal/futures/FuturesCloseClusterTimeline';
import PhantomTimeCard from '@/components/terminal/futures/PhantomTimeCard';
import CashBridgeMap from '@/components/terminal/futures/CashBridgeMap';
import LiquidityParticipationCard from '@/components/terminal/futures/LiquidityParticipationCard';
import { estimateFuturesLiquidityParticipation } from '@/lib/terminal/futures/liquidityParticipation';

export type FuturesWorkbenchTab =
  | 'Close Calendar'
  | 'Futures Session'
  | 'Cash Bridge'
  | 'Commodity Session Map'
  | 'Liquidity & Volume';

type FuturesTerminalPanelProps = {
  data: FuturesTerminalResponse | null;
  loading: boolean;
  error: string | null;
  tab: FuturesWorkbenchTab;
  symbol: string;
};

function DataUnavailable() {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Data unavailable from current feed</div>
      <p className="mt-1 text-xs text-slate-500">Session and timing modules remain available while provider coverage is limited.</p>
    </section>
  );
}

export default function FuturesTerminalPanel({ data, loading, error, tab, symbol }: FuturesTerminalPanelProps) {
  if (loading) {
    return <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-8 text-center text-xs text-slate-500">Loading Futures Terminal...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>;
  }

  if (!data) {
    return <DataUnavailable />;
  }

  const providerDataUnavailable =
    data.errors.some((issue) => issue.toLowerCase().includes('data unavailable from current feed')) ||
    data.dataState === 'error';
  const liquidityEstimate = estimateFuturesLiquidityParticipation(symbol, data.session);

  return (
    <div className="space-y-3">
      <FuturesRiskNotice message={data.riskNotice} />

      {tab === 'Close Calendar' && <FuturesCloseClusterTimeline closeCalendar={data.closeCalendar} />}
      {tab === 'Futures Session' && <FuturesSessionCard session={data.session} />}
      {tab === 'Cash Bridge' && <CashBridgeMap symbol={symbol} cashBridge={data.cashBridge} fallbackMessage={getCashBridgeFallbackMessage()} />}
      {tab === 'Commodity Session Map' && <CashBridgeMap symbol={symbol} fallbackMessage={getCashBridgeFallbackMessage()} />}
      {tab === 'Liquidity & Volume' && (providerDataUnavailable ? <DataUnavailable /> : <LiquidityParticipationCard estimate={liquidityEstimate} />)}

      {data.phantomTime && <PhantomTimeCard phantomTime={data.phantomTime} />}

      {data.errors.length > 0 && (
        <section className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <div className="font-bold uppercase tracking-[0.1em]">Data State: {data.dataState}</div>
          <ul className="mt-1 space-y-1 text-amber-50/90">
            {data.errors.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
