'use client';

export type DiamondValidationStage =
  | 'REJECT'
  | 'BELOW_WATCH'
  | 'WATCH'
  | 'EMERGING'
  | 'PROVISIONAL_DIAMOND'
  | 'CONFIRMED_DIAMOND';

export interface DiamondHistoryView {
  firstSeenAt: string;
  firstDetectedAt: string | null;
  firstTrendingAt: string | null;
  confirmedAt: string | null;
  scanCount: number;
  qualifyingScanCount: number;
  diamondScanCount: number;
  deepCheckCount: number;
  scoreDelta5m: number;
  liquidityChangePct: number | null;
  detectedMinutesAgo: number | null;
  discoveryLeadMinutes: number | null;
  confirmation: {
    validationStage: DiamondValidationStage;
    passed: number;
    required: number;
    blockers: string[];
  };
}

const LABEL: Record<DiamondValidationStage, string> = {
  REJECT: 'Rejected',
  BELOW_WATCH: 'Below watch',
  WATCH: 'Watch',
  EMERGING: 'Emerging',
  PROVISIONAL_DIAMOND: 'Provisional Diamond',
  CONFIRMED_DIAMOND: 'Confirmed Diamond',
};

function badgeClass(stage: DiamondValidationStage): string {
  if (stage === 'CONFIRMED_DIAMOND') return 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100';
  if (stage === 'PROVISIONAL_DIAMOND') return 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200';
  if (stage === 'EMERGING') return 'border-violet-400/40 bg-violet-500/10 text-violet-200';
  if (stage === 'WATCH') return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-600 bg-slate-800/40 text-slate-300';
}

function elapsed(minutes: number | null): string {
  if (minutes == null) return 'not detected';
  if (minutes < 60) return Math.round(minutes) + 'm';
  if (minutes < 1440) return (minutes / 60).toFixed(1) + 'h';
  return (minutes / 1440).toFixed(1) + 'd';
}

function signed(value: number | null, suffix: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value > 0 ? '+' : '') + value.toFixed(1) + suffix;
}

export default function DiamondV2Status(props: {
  history: DiamondHistoryView;
  score: number;
  attention: 'EARLY' | 'POOL_TRENDING' | 'COINGECKO_TRENDING' | 'QUIET';
}) {
  const history = props.history;
  const confirmation = history.confirmation;
  const stage = confirmation.validationStage;
  const width = Math.min(100, (confirmation.passed / Math.max(confirmation.required, 1)) * 100);
  const lead = history.discoveryLeadMinutes != null
    ? 'Detected ' + history.discoveryLeadMinutes.toFixed(1) + 'm before CoinGecko trending'
    : props.attention === 'EARLY' || props.attention === 'QUIET'
      ? 'Still ahead of CoinGecko trending'
      : 'Trending lead not established';

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={'rounded-full border px-2 py-0.5 text-[10px] font-bold ' + badgeClass(stage)}>
            {LABEL[stage]} · {props.score}
          </span>
          <span className="text-[10px] text-cyan-300/80">{lead}</span>
        </div>
        <div className="text-[10px] text-slate-500">
          detected {elapsed(history.detectedMinutesAgo)} ago · {history.scanCount} tracked scans
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 p-2">
          <div className="text-[9px] uppercase text-slate-600">Score Δ</div>
          <div className="text-xs font-semibold text-slate-200">{history.scanCount < 2 ? 'Awaiting repeat scan' : signed(history.scoreDelta5m, '/5m')}</div>
        </div>
        <div className="rounded-lg border border-slate-800 p-2">
          <div className="text-[9px] uppercase text-slate-600">Liquidity Δ</div>
          <div className="text-xs font-semibold text-slate-200">{history.scanCount < 2 ? 'Awaiting repeat scan' : signed(history.liquidityChangePct, '%')}</div>
        </div>
        <div className="rounded-lg border border-slate-800 p-2">
          <div className="text-[9px] uppercase text-slate-600">Diamond+ scans</div>
          <div className="text-xs font-semibold text-slate-200">{history.diamondScanCount}</div>
        </div>
        <div className="rounded-lg border border-slate-800 p-2">
          <div className="text-[9px] uppercase text-slate-600">Confirmation</div>
          <div className="text-xs font-semibold text-slate-200">{confirmation.passed}/{confirmation.required}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-400" style={{ width: String(width) + '%' }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(confirmation.blockers.length ? confirmation.blockers : ['All confirmation gates passed']).map((item) => (
            <span
              key={item}
              className={
                'rounded-md border px-2 py-1 text-[10px] ' +
                (confirmation.blockers.length
                  ? 'border-amber-500/20 bg-amber-500/5 text-amber-200/80'
                  : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200')
              }
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
