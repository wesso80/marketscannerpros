'use client';

type Props = {
  setupType: string;
  timeframe: string;
};

type Horizon = {
  label: string;
  duration: string;
  icon: string;
  active: boolean;
};

function deriveHorizon(setupType: string, timeframe: string): 'intraday' | 'swing' | 'position' {
  const tf = timeframe.toLowerCase();
  if (tf.includes('1m') || tf.includes('5m') || tf.includes('15m') || tf.includes('intraday')) return 'intraday';
  if (tf.includes('weekly') || tf.includes('monthly') || tf.includes('position')) return 'position';

  // Derive from setup type
  if (setupType === 'squeeze' || setupType === 'breakout') return 'swing';
  if (setupType === 'trend' || setupType === 'mean_reversion') return 'swing';
  if (setupType === 'range') return 'intraday';
  if (setupType === 'reversal') return 'position';

  return 'swing';
}

function durationLabel(horizon: string, setupType: string): string {
  if (horizon === 'intraday') return 'Hours to 1 day';
  if (horizon === 'swing') {
    if (setupType === 'squeeze') return '1-3 day expectation';
    if (setupType === 'breakout') return '2-5 day expectation';
    return '2-5 day expectation';
  }
  return '1-4 week expectation';
}

export default function GETimeframeContext({ setupType, timeframe }: Props) {
  const active = deriveHorizon(setupType, timeframe);

  const horizons: Horizon[] = [
    { label: 'Intraday', duration: 'Hours to 1 day', icon: '⚡', active: active === 'intraday' },
    { label: 'Swing Trade', duration: durationLabel('swing', setupType), icon: '🔄', active: active === 'swing' },
    { label: 'Position', duration: '1-4 week hold', icon: '🏗️', active: active === 'position' },
  ];

  const activeH = horizons.find(h => h.active)!;

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-400">Signal Horizon</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {horizons.map((h) => (
          <div
            key={h.label}
            className={`rounded-xl border p-3 text-center transition ${
              h.active
                ? 'border-sky-500/30 bg-sky-500/10 shadow-lg shadow-sky-500/5'
                : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            <div className="text-lg">{h.icon}</div>
            <div className={`mt-1 text-xs font-bold ${h.active ? 'text-sky-300' : 'text-slate-500'}`}>
              {h.label}
            </div>
            {h.active && (
              <div className="mt-1 h-0.5 mx-auto w-6 rounded-full bg-sky-500" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2.5 text-center">
        <span className="text-base">{activeH.icon}</span>
        <span className="ml-2 text-sm font-medium text-white">{activeH.label}</span>
        <span className="mx-2 text-slate-600">—</span>
        <span className="text-sm text-slate-400">{activeH.duration}</span>
      </div>
    </div>
  );
}
