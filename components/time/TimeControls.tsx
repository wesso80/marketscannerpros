type TimeControlsProps = {
  symbol: string;
  onSymbolChange: (value: string) => void;
  primaryTf: string;
  onPrimaryTfChange: (value: string) => void;
  onRunScan: () => void;
  loading?: boolean;
};

export default function TimeControls({
  symbol,
  onSymbolChange,
  primaryTf,
  onPrimaryTfChange,
  onRunScan,
  loading = false,
}: TimeControlsProps) {
  return (
    <div className="mt-4 rounded-2xl border border-white/5 bg-white/3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Symbol</span>
          <input
            className="h-9 w-40 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none"
            value={symbol}
            onChange={(event) => onSymbolChange(event.target.value.toUpperCase())}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Primary TF</span>
          <select
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none"
            value={primaryTf}
            onChange={(event) => onPrimaryTfChange(event.target.value)}
          >
            <option value="intraday_1h">1H</option>
            <option value="intraday_4h">4H</option>
            <option value="swing_1d">1D</option>
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            className="h-9 rounded-lg bg-emerald-500/80 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            onClick={onRunScan}
            disabled={loading}
          >
            {loading ? 'Scanning…' : 'Find Confluence Setup'}
          </button>
          <button className="h-9 rounded-lg bg-white/5 px-4 text-sm font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10">
            Set Alert
          </button>
        </div>
      </div>
    </div>
  );
}
