/**
 * Which underlying input each piece of evidence comes from (ticker research page, Phase 2). Several readings computed
 * from the same daily closes (moving averages, RSI, MACD, ADX, stochastic, extension, time cycles) are one source of
 * evidence: when they agree, that is not several independent confirmations. Views tag each point with its input and
 * report how many independent inputs stand behind a list, instead of counting lines.
 */
export const EVIDENCE_INPUTS = { version: 'evidence-inputs-v1' } as const;

export type EvidenceInput =
  | 'price-history' | 'volume' | 'options' | 'derivatives' | 'cross-market'
  | 'fundamentals' | 'calendar' | 'news' | 'risk-flags' | 'data-quality';

export const INPUT_LABEL: Record<EvidenceInput, string> = {
  'price-history': 'price history',
  volume: 'volume',
  options: 'options chain',
  derivatives: 'crypto derivatives',
  'cross-market': 'other markets',
  fundamentals: 'company reports',
  calendar: 'scheduled events',
  news: 'news',
  'risk-flags': 'risk checks',
  'data-quality': 'data quality',
};

/** Inputs that describe the data or combine several inputs, so they are not counted as a market input. */
const NOT_COUNTED: ReadonlySet<EvidenceInput> = new Set<EvidenceInput>(['data-quality', 'risk-flags']);

export type TaggedPoint = { text: string; input: EvidenceInput };
export type Independence = { points: number; inputs: Array<{ input: EvidenceInput; label: string; points: number }>; independentInputs: number; note: string };

export function independence(points: TaggedPoint[], noun = 'points'): Independence {
  const counts = new Map<EvidenceInput, number>();
  for (const p of points) counts.set(p.input, (counts.get(p.input) ?? 0) + 1);
  const inputs = [...counts].map(([input, n]) => ({ input, label: INPUT_LABEL[input], points: n })).sort((a, b) => b.points - a.points);
  const counted = inputs.filter((i) => !NOT_COUNTED.has(i.input));
  const independentInputs = counted.length;
  const breakdown = inputs.map((i) => `${i.label} ${i.points}`).join(', ');
  const shared = counted.some((i) => i.points > 1);
  const note = !points.length ? `No ${noun}.`
    : `${points.length} ${noun} from ${independentInputs} independent input${independentInputs === 1 ? '' : 's'} (${breakdown}).${shared ? ' Points from the same input count as one source of evidence, not separate confirmations.' : ''}`;
  return { points: points.length, inputs, independentInputs, note };
}
