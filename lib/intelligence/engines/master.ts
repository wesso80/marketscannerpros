// Master fusion engine — native TypeScript port of the MSP Master Command Centre.
//
// This is a PURE function: given the five engine readings it reproduces the
// composite / context / execution / bias / edge / agreement / conflict / risk /
// playbook / decision-gates / trigger-ladder exactly as the TradingView Master
// dashboard computes them. Because it takes no market data of its own, its
// output can be verified against TradingView for identical engine inputs
// (see test/intelligence/masterParity.test.ts).
//
// Thresholds are captured in MASTER_CONFIG so they can be tuned to match the
// deployed Pine version without touching the logic.

import type {
  MasterResult,
  EngineResult,
  EngineKey,
  ModuleDir,
  GateState,
  SemanticState,
  DecisionGate,
  TriggerRung,
  TriggerLadderResult,
} from '../types';

export interface MasterEngineInput {
  key: EngineKey;
  label: string;
  /** Native engine reading (may be signed). */
  raw: number;
  /** Normalised 0..100 orientation (50 = neutral). */
  orientation: number;
  /** Composite weight (percent). */
  weight: number;
  /** Which block the engine feeds: macro/structure = context, exec = execution. */
  bucket: 'context' | 'execution';
  role: string;
  /** Gate pass threshold for this engine's orientation. */
  gateRequired: number;
  status: EngineResult['status'];
  symbol?: string;
  timeframe?: string;
  confidence?: number;
  trend?: EngineResult['trend'];
}

export interface MasterConfig {
  moduleLong: number;       // orientation ≥ → module dir LONG (agreement)
  moduleShort: number;      // orientation ≤ → module dir SHORT (agreement)
  readyEdge: number;        // raw edge ≥ → edge gate PASS
  watchEdge: number;        // display edge ≥ → PRE-EDGE (else NO EDGE)
  minAgreement: number;     // agreement ≥ → agreement gate PASS
  structureRequired: number;
  // Conflict ladder (context vs execution gap).
  gapMildTension: number;   // ≥ → MILD TENSION
  gapDivergent: number;     // ≥ → DIVERGENT
  gapHardConflict: number;  // ≥ → HARD CONFLICT
  // Risk mode.
  hardFragility: number;    // structure orientation ≤ → NO NEW TRADE
  hardGap: number;          // gap ≥ → NO NEW TRADE
  reducedFragility: number; // structure orientation ≤ → REDUCED SIZE
  reducedAgreement: number; // agreement < → REDUCED SIZE
  reducedGap: number;       // gap ≥ → REDUCED SIZE
  // Ready-gate directional-support thresholds.
  leadLagRequired: number;
  pressureRequired: number;
  auctionRequired: number;
  ladderRequired: { structure: number; leadLag: number; pressure: number; auction: number; agreement: number; edge: number };
}

// Deployed Master Command Centre v1.2 "Watch Zones" thresholds.
export const MASTER_CONFIG: MasterConfig = {
  moduleLong: 55,
  moduleShort: 45,
  readyEdge: 70,
  watchEdge: 55,
  minAgreement: 75,
  structureRequired: 58,
  gapMildTension: 12,
  gapDivergent: 20,
  gapHardConflict: 30,
  hardFragility: 28,
  hardGap: 30,
  reducedFragility: 40,
  reducedAgreement: 60,
  reducedGap: 20,
  leadLagRequired: 65,
  pressureRequired: 60,
  auctionRequired: 62,
  ladderRequired: { structure: 58, leadLag: 65, pressure: 60, auction: 62, agreement: 75, edge: 70 },
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function weightedMean(items: { orientation: number; weight: number }[]): number {
  const w = items.reduce((s, i) => s + i.weight, 0);
  if (w <= 0) return 50;
  return items.reduce((s, i) => s + i.orientation * i.weight, 0) / w;
}

function moduleDir(orientation: number, cfg: MasterConfig): ModuleDir {
  if (orientation >= cfg.moduleLong) return 'LONG';
  if (orientation <= cfg.moduleShort) return 'SHORT';
  return 'NEUTRAL';
}

interface BiasBand {
  label: string;
  dir: 1 | 0 | -1;
  full: boolean; // true only for LONG / SHORT — the states that may go READY
  semantic: SemanticState;
}

// v1.2 bias ladder — exactly LONG / LEAN LONG / NEUTRAL / LEAN SHORT / SHORT.
function classifyBias(composite: number): BiasBand {
  if (composite >= 58) return { label: 'LONG', dir: 1, full: true, semantic: 'positive' };
  if (composite >= 55) return { label: 'LEAN LONG', dir: 1, full: false, semantic: 'positive' };
  if (composite > 45) return { label: 'NEUTRAL', dir: 0, full: false, semantic: 'neutral' };
  if (composite > 42) return { label: 'LEAN SHORT', dir: -1, full: false, semantic: 'warning' };
  return { label: 'SHORT', dir: -1, full: true, semantic: 'negative' };
}

// Per-engine orientation → display state (its own strong/long/neutral bands).
function classifyEngineState(o: number): { label: string; semantic: SemanticState } {
  if (o >= 68) return { label: 'Strong Long', semantic: 'strong-positive' };
  if (o >= 56) return { label: 'Long', semantic: 'positive' };
  if (o > 44) return { label: 'Neutral', semantic: 'neutral' };
  if (o >= 32) return { label: 'Short', semantic: 'negative' };
  return { label: 'Strong Short', semantic: 'critical' };
}

export function computeMaster(
  inputs: MasterEngineInput[],
  cfg: MasterConfig = MASTER_CONFIG,
  timestamp: string = new Date().toISOString(),
): MasterResult {
  const composite = weightedMean(inputs);
  const context = weightedMean(inputs.filter((i) => i.bucket === 'context'));
  const execution = weightedMean(inputs.filter((i) => i.bucket === 'execution'));
  const gap = Math.abs(context - execution);

  const band = classifyBias(composite);
  const biasDir = band.dir;

  // Agreement: share of directional engines aligned with the composite bias.
  let active = 0;
  let aligned = 0;
  for (const i of inputs) {
    const dir = moduleDir(i.orientation, cfg);
    if (dir === 'NEUTRAL') continue;
    active += 1;
    const sign = dir === 'LONG' ? 1 : -1;
    if (sign === biasDir) aligned += 1;
  }
  const agreement = biasDir === 0 ? 50 : active > 0 ? (100 * aligned) / active : 50;

  // Directional support = orientation for longs, mirror for shorts.
  const support = (o: number): number => (biasDir > 0 ? o : biasDir < 0 ? 100 - o : 50);
  const contextSupport = weightedMean(inputs.filter((i) => i.bucket === 'context').map((i) => ({ orientation: support(i.orientation), weight: i.weight })));
  const executionSupport = weightedMean(inputs.filter((i) => i.bucket === 'execution').map((i) => ({ orientation: support(i.orientation), weight: i.weight })));

  const rawEdge = biasDir === 0 ? 0 : clamp(contextSupport * 0.35 + executionSupport * 0.4 + agreement * 0.25, 0, 100);
  // Watch behaviour: a full bias (LONG/SHORT) reports the raw edge; a lean bias
  // reports a PRE-EDGE tempered toward the composite (never forced to zero);
  // neutral has no edge.
  const displayEdge = biasDir === 0 ? 0 : band.full ? rawEdge : (rawEdge + composite) / 2;
  const edgeReady = band.full && rawEdge >= cfg.readyEdge;
  const edgeState = edgeReady ? 'EDGE' : displayEdge >= cfg.watchEdge ? 'PRE-EDGE' : 'NO EDGE';

  // Conflict ladder — four bands driven purely by the context/execution gap.
  let conflict: string;
  let conflictSemantic: SemanticState;
  if (gap >= cfg.gapHardConflict) {
    conflict = 'HARD CONFLICT';
    conflictSemantic = 'critical';
  } else if (gap >= cfg.gapDivergent) {
    conflict = 'DIVERGENT';
    conflictSemantic = 'warning';
  } else if (gap >= cfg.gapMildTension) {
    conflict = 'MILD TENSION';
    conflictSemantic = 'warning';
  } else {
    conflict = 'ALIGNED';
    conflictSemantic = 'strong-positive';
  }

  // Risk mode (structure engine = the fragility bucket member).
  const structureEngine = inputs.find((i) => i.key === 'fragility');
  const structureOrient = structureEngine?.orientation ?? context;
  const hardRisk = structureOrient <= cfg.hardFragility || gap >= cfg.hardGap;
  const reducedRisk = !hardRisk && (structureOrient <= cfg.reducedFragility || agreement < cfg.reducedAgreement || gap >= cfg.reducedGap);
  const risk = hardRisk ? 'NO NEW TRADE' : reducedRisk ? 'REDUCED SIZE' : 'NORMAL';
  const riskSemantic: SemanticState = hardRisk ? 'critical' : reducedRisk ? 'warning' : 'strong-positive';

  // Gate readiness — directional-support based.
  const macro = inputs.find((i) => i.key === 'macro');
  const pressure = inputs.find((i) => i.key === 'nq-pressure');
  const auction = inputs.find((i) => i.key === 'auction');
  const leadLag = inputs.find((i) => i.key === 'lead-lag');
  const leadLagSupport = support(leadLag?.orientation ?? 50);
  const pressureSupport = support(pressure?.orientation ?? 50);
  const auctionSupport = support(auction?.orientation ?? 50);
  const structureGate = biasDir !== 0 && contextSupport >= cfg.structureRequired;
  const leadLagGate = biasDir !== 0 && leadLagSupport >= cfg.leadLagRequired;
  const pressureGate = biasDir !== 0 && pressureSupport >= cfg.pressureRequired;
  const auctionGate = biasDir !== 0 && auctionSupport >= cfg.auctionRequired;
  const agreementGate = agreement >= cfg.minAgreement;

  // READY is reserved for a FULL directional bias with every execution gate met.
  const ready = band.full && edgeReady && agreementGate && leadLagGate && pressureGate && auctionGate;

  // Playbook.
  let playbook: string;
  let playbookSemantic: SemanticState;
  if (risk === 'NO NEW TRADE') {
    playbook = 'RISK GATE — NO NEW TRADE';
    playbookSemantic = 'critical';
  } else if (biasDir === 0) {
    playbook = 'NEUTRAL — WAIT FOR CONFLUENCE';
    playbookSemantic = 'neutral';
  } else if (ready) {
    playbook = `${band.label} READY — EXECUTION CONFIRMED`;
    playbookSemantic = 'strong-positive';
  } else if (displayEdge >= cfg.watchEdge && !agreementGate && band.full) {
    playbook = `${band.label} — MODULES DISAGREE`;
    playbookSemantic = 'warning';
  } else if (displayEdge >= cfg.watchEdge) {
    playbook = `${band.label} — WAIT FOR EXECUTION`;
    playbookSemantic = 'warning';
  } else {
    playbook = `${band.label} — NO ENTRY EDGE`;
    playbookSemantic = 'neutral';
  }

  // Per-engine result rows.
  const engines: EngineResult[] = inputs.map((i) => {
    const dir = moduleDir(i.orientation, cfg);
    const st = classifyEngineState(i.orientation);
    const gate: GateState = i.orientation >= i.gateRequired && dir !== 'NEUTRAL' ? 'PASS' : 'WAIT';
    return {
      engine: i.key,
      label: i.label,
      timestamp,
      symbol: i.symbol,
      timeframe: i.timeframe,
      rawValue: i.raw,
      orientation: round2(i.orientation),
      score: round2(i.orientation),
      state: st.label,
      semantic: st.semantic,
      confidence: i.confidence,
      trend: i.trend ?? 'stable',
      gate,
      weightPct: i.weight,
      dirSupport: round2(support(i.orientation)),
      moduleDir: dir,
      role: i.role,
      status: i.status,
    };
  });

  const gates: DecisionGate[] = [
    { label: 'Structure', state: structureGate ? 'PASS' : 'WAIT' },
    { label: 'Lead/Lag', state: leadLagGate ? 'PASS' : 'WAIT' },
    { label: 'Pressure', state: pressureGate ? 'PASS' : 'WAIT' },
    { label: 'Auction', state: auctionGate ? 'PASS' : 'WAIT' },
    { label: 'Agreement', state: agreementGate ? 'PASS' : 'WAIT' },
    { label: 'Edge', state: edgeReady ? 'PASS' : displayEdge >= cfg.watchEdge ? 'PRE-EDGE' : 'WAIT' },
  ];

  // Trigger ladder — how close each gate is to passing (edge uses display edge).
  const structureCurrent = macro && structureEngine ? (macro.orientation + structureEngine.orientation) / 2 : context;
  const ladder = buildLadder(
    {
      structure: structureCurrent,
      leadLag: leadLag?.orientation ?? 50,
      pressure: pressure?.orientation ?? 50,
      auction: auction?.orientation ?? 50,
      agreement,
      edge: displayEdge,
    },
    cfg.ladderRequired,
  );

  return {
    timestamp,
    composite: Math.round(composite),
    bias: band.label,
    biasSemantic: band.semantic,
    edge: Math.round(displayEdge),
    edgeLabel: `${edgeState} ${Math.round(displayEdge)}`,
    agreement: Math.round(agreement),
    risk,
    riskSemantic,
    conflict,
    conflictSemantic,
    playbook,
    playbookSemantic,
    context: Math.round(context),
    execution: Math.round(execution),
    gap: round2(gap),
    engines,
    gates,
    ladder,
  };
}

function buildLadder(
  current: { structure: number; leadLag: number; pressure: number; auction: number; agreement: number; edge: number },
  required: MasterConfig['ladderRequired'],
): TriggerLadderResult {
  const make = (gate: string, cur: number, req: number): TriggerRung => {
    const distance = Math.round(cur - req);
    const passed = cur >= req;
    let status: GateState;
    if (passed) status = 'PASS';
    else if (gate === 'Edge') status = 'PRE-EDGE';
    else status = 'WAIT';
    return { gate, current: Math.round(cur), required: req, distance, status, passed };
  };

  const rungs: TriggerRung[] = [
    make('Structure', current.structure, required.structure),
    make('Lead/Lag', current.leadLag, required.leadLag),
    make('Pressure', current.pressure, required.pressure),
    make('Auction', current.auction, required.auction),
    make('Agreement', current.agreement, required.agreement),
    make('Edge', current.edge, required.edge),
  ];

  const failing = rungs.filter((r) => !r.passed);
  const primaryBlocker = failing.length
    ? failing.reduce((worst, r) => (r.distance < worst.distance ? r : worst)).gate
    : null;
  failing.forEach((r) => {
    if (r.gate === primaryBlocker) r.status = 'BLOCKER';
  });
  const nextClosest = failing
    .filter((r) => r.gate !== primaryBlocker)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 2)
    .map((r) => r.gate);

  return { rungs, primaryBlocker, nextClosest };
}
