/**
 * Educational scenario analysis for Golden Egg (Stage 5).
 *
 * Turns Golden Egg's setup/scenario data into an EDUCATIONAL scenario structure:
 * why an asset is interesting, supporting vs contradicting evidence, the primary
 * conditional scenario, an explicit alternative scenario, and the structural
 * invalidation level — all in conditional, non-instructional language.
 *
 * Language rules enforced here:
 *  - "Structural invalidation level" (never "stop loss").
 *  - "Reference / reaction zone" (never "profit target").
 *  - "Illustrative structure … hypothetical, for education only" for any R framing.
 *  - No buy/sell/enter/exit instructions; scenarios are conditional descriptions.
 *
 * Pure and dependency-light for easy testing/reuse.
 */

import type { EggDirection, EggBias } from './goldenEggConfluence';

export interface ScenarioKeyLevel {
  label: string;
  price: number;
  kind: 'support' | 'resistance' | 'pivot' | 'value';
}

export interface ScenarioInput {
  symbol: string;
  direction: EggDirection;
  setupType?: string;
  thesis?: string;
  primaryDriver?: string;
  primaryBlocker?: string;
  referenceTrigger?: string;
  referenceLevelPrice?: number;
  invalidationPrice?: number;
  invalidationLogic?: string;
  keyLevels?: ScenarioKeyLevel[];
  reactionZones?: Array<{ price: number; rMultiple?: number; note?: string }>;
  hypotheticalRr?: { expectedR: number; minR: number };
  /** Factor-group labels that currently support the thesis. */
  supportingFactors?: string[];
  /** Factor-group labels that currently contradict the thesis. */
  contradictingFactors?: string[];
}

export interface ScenarioBlock {
  title: string;
  direction: EggBias;
  text: string;
}

export interface ReferenceZone {
  label: string;
  price: number;
  note?: string;
}

export interface ScenarioAnalysis {
  symbol: string;
  whyInteresting: string;
  primaryScenario: ScenarioBlock;
  alternativeScenario: ScenarioBlock;
  thesisInvalidation: { label: string; text: string; price?: number };
  referenceZones: ReferenceZone[];
  illustrativeStructure?: string;
  supporting: string[];
  contradicting: string[];
}

function biasOf(direction: EggDirection): EggBias {
  if (direction === 'LONG') return 'bullish';
  if (direction === 'SHORT') return 'bearish';
  return 'neutral';
}

function fmtPrice(p?: number): string {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 'the reference level';
  // Compact price formatting without currency assumptions.
  return p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toPrecision(3);
}

function kindLabel(kind: ScenarioKeyLevel['kind']): string {
  switch (kind) {
    case 'support': return 'Reference support zone';
    case 'resistance': return 'Reference resistance zone';
    case 'pivot': return 'Pivot reference';
    default: return 'Value reference';
  }
}

export function buildScenarioAnalysis(input: ScenarioInput): ScenarioAnalysis {
  const bias = biasOf(input.direction);
  const dirWord = bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'mixed';
  const oppWord = bias === 'bullish' ? 'bearish' : bias === 'bearish' ? 'bullish' : 'bearish';
  const setup = input.setupType ? `${input.setupType.replace(/_/g, ' ')} setup` : 'setup';

  // Why interesting
  const driver = input.primaryDriver ? `, driven primarily by ${input.primaryDriver.toLowerCase()}` : '';
  const whyInteresting = input.thesis
    ? input.thesis
    : `${input.symbol} is highlighted as a ${dirWord} ${setup}${driver}. This is analytical context for further research, not a recommendation.`;

  // Primary conditional scenario (aligned to the current directional thesis)
  const refClause = input.referenceTrigger
    ? `confirms ${input.referenceTrigger}`
    : `confirms above the reference level`;
  const holdWord = bias === 'bearish' ? 'holds below' : 'holds above';
  const primaryText = bias === 'neutral'
    ? `Current evidence is mixed. A clearer directional bias would require price to resolve out of its current range with expanding participation before either scenario is favoured.`
    : `If price ${holdWord} ${fmtPrice(input.referenceLevelPrice)} and ${refClause} while participation increases, the current ${dirWord} thesis would remain supported. This describes a condition to observe, not an instruction to act.`;

  // Alternative scenario (the explicit opposite case)
  const blocker = input.primaryBlocker ? ` Watch ${input.primaryBlocker.toLowerCase()} as an early tell.` : '';
  const alternativeText = bias === 'neutral'
    ? `A decisive move in either direction, accompanied by a shift in relative strength and participation, would begin to favour that side.${blocker}`
    : `Failure ${input.referenceTrigger ? `to ${input.referenceTrigger}` : 'to confirm'}, followed by deterioration in relative strength, would increase the evidence for the alternative ${oppWord} scenario.${blocker}`;

  // Thesis invalidation — structural, not a "stop"
  const invalidDir = bias === 'bearish' ? 'above' : 'below';
  const invalidationText = typeof input.invalidationPrice === 'number'
    ? `A sustained move ${invalidDir} ${fmtPrice(input.invalidationPrice)} would materially weaken the current ${dirWord} structure${input.invalidationLogic ? ` (${input.invalidationLogic})` : ''}.`
    : `A sustained move against the current structure would materially weaken the ${dirWord} thesis.`;

  // Reference / reaction zones (educational — never "targets")
  const referenceZones: ReferenceZone[] = [
    ...(input.keyLevels ?? []).map((k) => ({ label: kindLabel(k.kind), price: k.price, note: k.label })),
    ...(input.reactionZones ?? []).map((z) => ({
      label: 'Potential reaction zone',
      price: z.price,
      note: z.note,
    })),
  ];

  // Illustrative structure (hypothetical R framing)
  const illustrativeStructure = input.hypotheticalRr
    ? `Illustrative structure based on observed technical levels: approximately ${input.hypotheticalRr.expectedR.toFixed(1)}R between the reference and structural-invalidation levels (hypothetical, for education only — not a recommendation to trade or a performance expectation).`
    : undefined;

  return {
    symbol: input.symbol,
    whyInteresting,
    primaryScenario: {
      title: bias === 'neutral' ? 'Primary read: mixed' : `Primary ${dirWord} scenario`,
      direction: bias,
      text: primaryText,
    },
    alternativeScenario: {
      title: `Alternative ${oppWord} scenario`,
      direction: oppWord as EggBias,
      text: alternativeText,
    },
    thesisInvalidation: {
      label: 'Structural invalidation level',
      text: invalidationText,
      price: input.invalidationPrice,
    },
    referenceZones,
    illustrativeStructure,
    supporting: input.supportingFactors ?? [],
    contradicting: input.contradictingFactors ?? [],
  };
}
