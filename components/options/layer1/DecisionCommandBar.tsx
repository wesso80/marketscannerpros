import { DecisionActions, DecisionModel } from '@/types/optionsScanner';

type ScanModeType =
  | 'scalping'
  | 'intraday_30m'
  | 'intraday_1h'
  | 'intraday_4h'
  | 'swing_1d'
  | 'swing_3d'
  | 'swing_1w'
  | 'macro_monthly'
  | 'macro_yearly';

const TIMEFRAME_OPTIONS: ScanModeType[] = ['intraday_1h', 'intraday_4h', 'swing_1d', 'swing_1w', 'macro_monthly'];

type DecisionCommandBarProps = {
  decision: DecisionModel;
  symbol: string;
  scanMode: ScanModeType;
  loading: boolean;
  onSymbolChange: (next: string) => void;
  onScanModeChange: (next: ScanModeType) => void;
  onRunScan: () => void;
  actions: DecisionActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

function tone(permission: DecisionModel['permission']): { border: string; dot: string } {
  if (permission === 'GO') return { border: 'border-emerald-500/30', dot: 'bg-emerald-400' };
  if (permission === 'WAIT') return { border: 'border-amber-500/30', dot: 'bg-amber-400' };
  return { border: 'border-rose-500/30', dot: 'bg-rose-400' };
}

function riskLabel(permission: DecisionModel['permission']) {
  if (permission === 'BLOCK') return 'HIGH';
  if (permission === 'WAIT') return 'MOD';
  return 'LOW';
}

function rrEstimate(quality: DecisionModel['quality']) {
  if (quality === 'High') return '2.5';
  if (quality === 'Med') return '1.8';
  return '1.2';
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-[88px] rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export default function DecisionCommandBar({
  decision,
  symbol,
  scanMode,
  loading,
  onSymbolChange,
  onScanModeChange,
  onRunScan,
  actions,
  viewMode,
  onToggleViewMode,
}: DecisionCommandBarProps) {
  const t = tone(decision.permission);

  return (
    <div className={`w-full rounded-2xl border bg-slate-900/40 px-4 lg:px-6 ${t.border}`}>
      <div className="grid min-h-[88px] grid-cols-1 items-center gap-3 py-3 lg:grid-cols-[1.3fr_0.9fr_1.2fr] lg:py-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input
              value={symbol}
              onChange={(event) => onSymbolChange(event.target.value)}
              placeholder="SYMBOL"
              className="w-24 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-sm font-semibold text-slate-100"
            />
            <select
              value={scanMode}
              onChange={(event) => onScanModeChange(event.target.value as ScanModeType)}
              className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRunScan}
              disabled={loading}
              className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40"
            >
              {loading ? 'Scanning…' : 'Run'}
            </button>
          </div>
          <div className="mt-1.5 truncate text-xs text-slate-400">
            {decision.direction} • {scanMode} • {decision.validityLabel}
          </div>
        </div>

        <div className="flex justify-start lg:justify-center">
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2">
            <div className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
            <div className="text-sm font-semibold tracking-wide text-slate-100">{decision.permission}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <div className="grid grid-cols-3 gap-2">
            <MetricPill label="Conf" value={`${decision.confidence}%`} />
            <MetricPill label="Risk" value={riskLabel(decision.permission)} />
            <MetricPill label="R:R" value={rrEstimate(decision.quality)} />
          </div>
          <div className="hidden gap-1.5 xl:flex">
            <button disabled={!actions.deployEnabled} onClick={actions.onDeploy} className="rounded-lg border border-slate-700 bg-emerald-500/15 px-2 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-40">Deploy</button>
            <button disabled={!actions.alertEnabled} onClick={actions.onAlert} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40">Alert</button>
            <button disabled={!actions.watchlistEnabled} onClick={actions.onWatchlist} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40">Watch</button>
            <button disabled={!actions.journalEnabled} onClick={actions.onJournal} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40">Journal</button>
            <button onClick={onToggleViewMode} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs text-slate-100">{viewMode === 'normal' ? 'Compact' : 'Normal'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
