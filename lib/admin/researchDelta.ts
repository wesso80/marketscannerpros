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

/**
 * Format a ResearchDelta into a short operator-grade one-line summary.
 * Used by getAdminResearchPacket to fill packet.whatChanged with real
 * deltas instead of a placeholder.
 *
 * Per data-integrity rule: if there is no prior snapshot, callers must
 * use the honest fallback string and not call this function.
 *
 * Priority order (only top-3 fragments emitted to keep the line scannable):
 *   1. Lifecycle transitions (most decision-altering)
 *   2. New risks (decision-altering)
 *   3. New contradictions
 *   4. Score delta (>=2 pts)
 *   5. Data trust delta (>=5 pts)
 *   6. New evidence
 *   7. Resolved contradictions
 *   8. Context shifts (macro / news / earnings / vol / time / options)
 */
export function summarizeResearchDelta(delta: ResearchDelta, priorCreatedAtIso?: string): string {
  const fragments: string[] = [];

  if (delta.lifecycleDelta !== "UNCHANGED") {
    fragments.push(`lifecycle ${delta.lifecycleDelta}`);
  }

  if (delta.newRisks.length > 0) {
    const first = delta.newRisks[0];
    const extra = delta.newRisks.length > 1 ? ` (+${delta.newRisks.length - 1})` : "";
    fragments.push(`new risk: ${first}${extra}`);
  }

  if (delta.newContradictions.length > 0) {
    const first = delta.newContradictions[0];
    const extra = delta.newContradictions.length > 1 ? ` (+${delta.newContradictions.length - 1})` : "";
    fragments.push(`new contradiction: ${first}${extra}`);
  }

  if (Math.abs(delta.scoreDelta) >= 2) {
    const sign = delta.scoreDelta > 0 ? "+" : "";
    fragments.push(`score ${sign}${delta.scoreDelta}`);
  }

  if (Math.abs(delta.dataTrustDelta) >= 5) {
    const sign = delta.dataTrustDelta > 0 ? "+" : "";
    fragments.push(`trust ${sign}${delta.dataTrustDelta}`);
  }

  if (delta.newEvidence.length > 0 && fragments.length < 3) {
    fragments.push(`+evidence: ${delta.newEvidence[0]}`);
  }

  if (delta.resolvedContradictions.length > 0 && fragments.length < 3) {
    fragments.push(`resolved: ${delta.resolvedContradictions[0]}`);
  }

  if (delta.changedContexts.length > 0 && fragments.length < 3) {
    fragments.push(`context shift: ${delta.changedContexts.slice(0, 2).join(", ")}`);
  }

  const top = fragments.slice(0, 3);

  if (top.length === 0) {
    return priorCreatedAtIso
      ? `No material change since prior scan at ${formatPriorTime(priorCreatedAtIso)}.`
      : "No material change since prior scan.";
  }

  const sinceClause = priorCreatedAtIso ? ` since ${formatPriorTime(priorCreatedAtIso)}` : "";
  return `${top.join("; ")}${sinceClause}.`;
}

function formatPriorTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}Z`;
  } catch {
    return iso;
  }
}
