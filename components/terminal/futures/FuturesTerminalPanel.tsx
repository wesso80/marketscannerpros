import SourceLine from '@/components/visual/SourceLine';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
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
      <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">No market observations collected</div>
      <p className="mt-1 text-xs text-slate-500">Try refreshing this view. Session schedules are separate from live market observations.</p>
    </section>
  );
}

export default function FuturesTerminalPanel({ data, loading, error, tab, symbol }: FuturesTerminalPanelProps) {
  if (loading) {
    return <div role="status" className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-8 text-center text-xs text-slate-500">Loading Futures Terminal...</div>;
  }

  if (error) {
    return <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Futures context could not be loaded. Refresh this view to try again.</div>;
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
      <p data-futures-summary role="status" className="text-sm font-semibold">{data.dataState === 'error' ? 'Market observations could not be loaded; schedule context only.' : data.dataState === 'partial' || data.errors.length > 0 ? 'Futures context has limited data coverage.' : 'Futures context loaded.'}</p>
      <FuturesRiskNotice message={data.riskNotice} />

      {tab === 'Close Calendar' && <FuturesCloseClusterTimeline closeCalendar={data.closeCalendar} />}
      {tab === 'Futures Session' && <FuturesSessionCard session={data.session} />}
      {tab === 'Cash Bridge' && <CashBridgeMap symbol={symbol} cashBridge={data.cashBridge} fallbackMessage={getCashBridgeFallbackMessage()} />}
      {tab === 'Commodity Session Map' && <CashBridgeMap symbol={symbol} fallbackMessage={getCashBridgeFallbackMessage()} />}
      {tab === 'Liquidity & Volume' && (providerDataUnavailable ? <DataUnavailable /> : <LiquidityParticipationCard estimate={liquidityEstimate} />)}

      {data.phantomTime && <PhantomTimeCard phantomTime={data.phantomTime} />}

      {data.errors.length > 0 && (
        <CollapsibleSection title="Data coverage" summary={`${data.errors.length} reported ${data.errors.length === 1 ? 'issue' : 'issues'}`}>
          <p className="text-sm text-amber-200">Some requested market observations could not be collected. Session schedules and model estimates do not replace missing market data.</p>
        </CollapsibleSection>
      )}
      <SourceLine source="Futures session schedules and derived context" basis="Schedule-based calculations · provider observation time not supplied; not a live price or volume feed" />
    </div>
  );
}
