export interface ResearchDeltaInput {
  previous: Record<string, unknown> | null | undefined;
  current: Record<string, unknown>;
}

export interface ResearchDelta {
  scoreDelta: number;
  lifecycleDelta: string;
  dataTrustDelta: number;
  newEvidence: string[];
  removedEvidence: string[];
  newContradictions: string[];
  resolvedContradictions: string[];
  newRisks: string[];
  changedContexts: string[];
}

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function keyDiff(next: string[], prev: string[]) {
  const nextSet = new Set(next);
  const prevSet = new Set(prev);
  return {
    added: next.filter((x) => !prevSet.has(x)),
    removed: prev.filter((x) => !nextSet.has(x)),
  };
}

export function computeResearchDelta(input: ResearchDeltaInput): ResearchDelta {
  const currentScore = numberOr(input.current.trustAdjustedScore, numberOr(input.current.score));
  const prevScore = numberOr(input.previous?.trustAdjustedScore, numberOr(input.previous?.score));

  const currentLifecycle = String(input.current.lifecycle || "UNKNOWN");
  const prevLifecycle = String(input.previous?.lifecycle || "UNKNOWN");

  const currentTrust = numberOr(input.current.dataTrustScore);
  const prevTrust = numberOr(input.previous?.dataTrustScore);

  const currentEvidence = stringArray(input.current.evidence);
  const prevEvidence = stringArray(input.previous?.evidence);
  const evidenceDiff = keyDiff(currentEvidence, prevEvidence);

  const currentContradictions = stringArray(input.current.contradictionFlags);
  const prevContradictions = stringArray(input.previous?.contradictionFlags);
  const contradictionDiff = keyDiff(currentContradictions, prevContradictions);

  const currentRisks = stringArray(input.current.risks);
  const prevRisks = stringArray(input.previous?.risks);
  const riskDiff = keyDiff(currentRisks, prevRisks);

  const changedContexts: string[] = [];
  const contextKeys = [
    "macroContext",
    "newsContext",
    "earningsContext",
    "volatilityState",
    "timeConfluence",
    "optionsIntelligence",
  ];
  for (const key of contextKeys) {
    const prevRaw = JSON.stringify(input.previous?.[key] ?? null);
    const currRaw = JSON.stringify(input.current[key] ?? null);
    if (prevRaw !== currRaw) changedContexts.push(key);
  }

  return {
    scoreDelta: Math.round((currentScore - prevScore) * 100) / 100,
    lifecycleDelta: currentLifecycle === prevLifecycle ? "UNCHANGED" : `${prevLifecycle} -> ${currentLifecycle}`,
    dataTrustDelta: Math.round((currentTrust - prevTrust) * 100) / 100,
    newEvidence: evidenceDiff.added,
    removedEvidence: evidenceDiff.removed,
    newContradictions: contradictionDiff.added,
    resolvedContradictions: contradictionDiff.removed,
    newRisks: riskDiff.added,
    changedContexts,
  };
}
