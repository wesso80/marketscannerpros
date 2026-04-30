/**
 * ScoreTypeBadge — Algorithm Truth Labels
 *
 * Every score in MarketScanner Pros must display one of these badges so
 * users understand the nature and reliability of the number shown.
 * Do NOT display scores as calibrated probabilities without this label.
 */

export type ScoreType =
  | 'heuristic'       // Rule-based weights, not calibrated to outcomes
  | 'historical'      // Computed from historical data only
  | 'sample-limited'  // Fewer than minimum reliable sample size
  | 'partial'         // Some evidence layers are missing
  | 'stale'           // Underlying data is older than threshold
  | 'simulated'       // Synthesized / demo data
  | 'live'            // Live provider data, all layers present
  | 'evidence-alignment'; // Multi-factor confluence, not single probability

const SCORE_TYPE_META: Record<ScoreType, {
  label: string;
  title: string;
  bg: string;
  border: string;
  text: string;
}> = {
  heuristic: {
    label: 'Heuristic',
    title: 'Score is rule-based and has not been calibrated against outcome data. Do not treat as probability.',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
  },
  historical: {
    label: 'Historical',
    title: 'Score is back-calculated from historical data. Past patterns do not indicate future results.',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-300',
  },
  'sample-limited': {
    label: 'Sample-Limited',
    title: 'Insufficient sample size. Results are exploratory only and not statistically significant.',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
  },
  partial: {
    label: 'Partial',
    title: 'One or more evidence layers are missing. Score may understate or overstate alignment.',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
  },
  stale: {
    label: 'Stale',
    title: 'Underlying market data is older than the expected refresh threshold. May not reflect current conditions.',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-300',
  },
  simulated: {
    label: 'Simulated',
    title: 'Data is synthesized or from a demo feed. Not real market data.',
    bg: 'bg-slate-800/60',
    border: 'border-slate-600',
    text: 'text-slate-400',
  },
  live: {
    label: 'Live',
    title: 'All evidence layers are present and data is within expected freshness thresholds.',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
  },
  'evidence-alignment': {
    label: 'Evidence Alignment',
    title: 'Multi-factor confluence score. Reflects how many indicators agree, not a probability of any outcome.',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-300',
  },
};

type ScoreTypeBadgeProps = {
  type: ScoreType;
  compact?: boolean;
  className?: string;
};

export default function ScoreTypeBadge({ type, compact = false, className = '' }: ScoreTypeBadgeProps) {
  const meta = SCORE_TYPE_META[type] ?? SCORE_TYPE_META.heuristic;
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      title={meta.title}
      className={`inline-flex cursor-help items-center rounded border font-black uppercase tracking-[0.06em] ${meta.bg} ${meta.border} ${meta.text} ${size} ${className}`}
    >
      {meta.label}
    </span>
  );
}

/** Derive the appropriate ScoreType from available metadata */
export function deriveScoreType(opts: {
  isSimulated?: boolean;
  isStale?: boolean;
  missingEvidence?: boolean;
  sampleLimited?: boolean;
  isLive?: boolean;
}): ScoreType {
  if (opts.isSimulated) return 'simulated';
  if (opts.isStale) return 'stale';
  if (opts.sampleLimited) return 'sample-limited';
  if (opts.missingEvidence) return 'partial';
  if (opts.isLive) return 'evidence-alignment';
  return 'heuristic';
}
