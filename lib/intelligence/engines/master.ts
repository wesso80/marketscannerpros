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
  moduleLong: number;      // orientation ≥ → module dir LONG
  moduleShort: number;     // orientation ≤ → module dir SHORT
  biasBands: { min: number; label: string; dir: 1 | 0 | -1; semantic: SemanticState }[];
  readyEdge: number;
  watchEdge: number;
  minAgreement: number;
  structureRequired: number;
  conflictGap: number;     // context vs execution gap → DIVERGENT
  hardGap: number;         // + opposite blocks → HARD CONFLICT
  hardFragility: number;   // structure orientation ≤ → NO NEW TRADE
  reducedFragility: number;
  ladderRequired: { structure: number; leadLag: number; pressure: number; auction: number; agreement: number; edge: number };
}

// Defaults calibrated to reproduce the deployed 5-engine Master dashboard.
export const MASTER_CONFIG: MasterConfig = {
  moduleLong: 55,
  moduleShort: 45,
  biasBands: [
    { min: 68, label: 'STRONG LONG', dir: 1, semantic: 'strong-positive' },
    { min: 62, label: 'LONG', dir: 1, semantic: 'positive' },
    { min: 55, label: 'LEAN LONG', dir: 1, semantic: 'positive' },
    { min: 45, label: 'NEUTRAL', dir: 0, semantic: 'neutral' },
    { min: 38, label: 'LEAN SHORT', dir: -1, semantic: 'warning' },
    { min: 32, label: 'SHORT', dir: -1, semantic: 'negative' },
    { min: -Infinity, label: 'STRONG SHORT', dir: -1, semantic: 'critical' },
  ],
  readyEdge: 70,
  watchEdge: 55,
  minAgreement: 75,
  structureRequired: 58,
  conflictGap: 20,
  hardGap: 35,
  hardFragility: 28,
  reducedFragility: 40,
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

const DIR_SEMANTIC: Record<ModuleDir, SemanticState> = {
  LONG: 'positive',
  SHORT: 'negative',
  NEUTRAL: 'neutral',
};

export function computeMaster(
  inputs: MasterEngineInput[],
  cfg: MasterConfig = MASTER_CONFIG,
  timestamp: string = new Date().toISOString(),
): MasterResult {
  const composite = weightedMean(inputs);
  const context = weightedMean(inputs.filter((i) => i.bucket === 'context'));
  const execution = weightedMean(inputs.filter((i) => i.bucket === 'execution'));
  const gap = Math.abs(context - execution);

  const band = cfg.biasBands.find((b) => composite >= b.min) ?? cfg.biasBands[cfg.biasBands.length - 1];
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

  const compositeEdge = biasDir === 0 ? 0 : clamp(contextSupport * 0.35 + executionSupport * 0.4 + agreement * 0.25, 0, 100);

  // Conflict.
  const oppositeBlocks = (context >= 58 && execution <= 42) || (context <= 42 && execution >= 58);
  let conflict = 'ALIGNED';
  let conflictSemantic: SemanticState = 'strong-positive';
  if (oppositeBlocks && gap >= cfg.hardGap) {
    conflict = 'HARD CONFLICT';
    conflictSemantic = 'critical';
  } else if (gap >= cfg.conflictGap) {
    conflict = 'DIVERGENT';
    conflictSemantic = 'warning';
  }

  // Risk mode (structure engine = the fragility bucket member).
  const structureEngine = inputs.find((i) => i.key === 'fragility');
  const structureOrient = structureEngine?.orientation ?? context;
  const hardRisk = structureOrient <= cfg.hardFragility || (oppositeBlocks && gap >= cfg.hardGap);
  const reducedRisk = !hardRisk && (structureOrient <= cfg.reducedFragility || agreement < 60 || gap >= cfg.conflictGap);
  const risk = hardRisk ? 'NO NEW TRADE' : reducedRisk ? 'REDUCED SIZE' : 'NORMAL';
  const riskSemantic: SemanticState = hardRisk ? 'critical' : reducedRisk ? 'warning' : 'strong-positive';

  // Gate readiness.
  const pressure = inputs.find((i) => i.key === 'nq-pressure');
  const auction = inputs.find((i) => i.key === 'auction');
  const leadLag = inputs.find((i) => i.key === 'lead-lag');
  const pressureReady = biasDir !== 0 && support(pressure?.orientation ?? 50) >= cfg.ladderRequired.pressure;
  const auctionReady = biasDir !== 0 && support(auction?.orientation ?? 50) >= cfg.ladderRequired.auction;
  const structureReady = biasDir !== 0 && contextSupport >= cfg.structureRequired;
  const agreementReady = agreement >= cfg.minAgreement;
  const leadLagReady = biasDir !== 0 && moduleDir(leadLag?.orientation ?? 50, cfg) === (biasDir > 0 ? 'LONG' : 'SHORT');
  const edgeReady = compositeEdge >= cfg.readyEdge;

  // Playbook.
  let playbook: string;
  let playbookSemantic: SemanticState;
  if (risk === 'NO NEW TRADE') {
    playbook = 'RISK GATE — NO NEW TRADE';
    playbookSemantic = 'critical';
  } else if (biasDir === 0) {
    playbook = 'NEUTRAL — WAIT FOR CONFLUENCE';
    playbookSemantic = 'neutral';
  } else if (edgeReady && agreementReady && pressureReady && auctionReady) {
    playbook = `${band.label} READY — EXECUTION CONFIRMED`;
    playbookSemantic = 'strong-positive';
  } else if (compositeEdge >= cfg.watchEdge && (!pressureReady || !auctionReady)) {
    playbook = `${band.label} — WAIT FOR EXECUTION`;
    playbookSemantic = 'warning';
  } else if (compositeEdge >= cfg.watchEdge && !agreementReady) {
    playbook = `${band.label} — MODULES DISAGREE`;
    playbookSemantic = 'warning';
  } else {
    playbook = `${band.label} — NO ENTRY EDGE`;
    playbookSemantic = 'neutral';
  }

  const edgeState = edgeReady ? 'EDGE' : compositeEdge >= cfg.watchEdge ? 'PRE-EDGE' : 'NO EDGE';

  // Per-engine result rows.
  const engines: EngineResult[] = inputs.map((i) => {
    const dir = moduleDir(i.orientation, cfg);
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
      state: dir === 'LONG' ? 'Strong Long' : dir === 'SHORT' ? 'Short' : 'Neutral',
      semantic: DIR_SEMANTIC[dir],
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
    { label: 'Structure', state: structureReady ? 'PASS' : 'WAIT' },
    { label: 'Lead/Lag', state: leadLagReady ? 'PASS' : 'WAIT' },
    { label: 'Pressure', state: pressureReady ? 'PASS' : 'WAIT' },
    { label: 'Auction', state: auctionReady ? 'PASS' : 'WAIT' },
    { label: 'Agreement', state: agreementReady ? 'PASS' : 'WAIT' },
    { label: 'Edge', state: edgeReady ? 'PASS' : compositeEdge >= cfg.watchEdge ? 'PRE-EDGE' : 'WAIT' },
  ];

  // Trigger ladder — how close each gate is to passing.
  const macro = inputs.find((i) => i.key === 'macro');
  const structureCurrent = macro && structureEngine ? (macro.orientation + structureEngine.orientation) / 2 : context;
  const ladder = buildLadder(
    {
      structure: structureCurrent,
      leadLag: leadLag?.orientation ?? 50,
      pressure: pressure?.orientation ?? 50,
      auction: auction?.orientation ?? 50,
      agreement,
      edge: compositeEdge,
    },
    cfg.ladderRequired,
  );

  return {
    timestamp,
    composite: Math.round(composite),
    bias: band.label,
    biasSemantic: band.semantic,
    edge: Math.round(compositeEdge),
    edgeLabel: `${edgeState} ${Math.round(compositeEdge)}`,
    agreement: Math.round(agreement),
    risk,
    riskSemantic,
    conflict,
    conflictSemantic,
    playbook,
    playbookSemantic,
    context: Math.round(context),
    execution: Math.round(execution),
    gap: Math.round(gap),
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
