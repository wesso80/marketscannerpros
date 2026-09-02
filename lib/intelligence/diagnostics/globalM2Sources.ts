// Global M2 source parity diagnostic — DEV/TEST ONLY. Not wired to any route.
// Mirrors the per-bloc source view (native, FX, USD levels, USD ROCs) at the
// configured confirmation lag so live normalization can be audited vs TradingView.
import type { NormalizedM2Bloc } from '../data/globalM2Normalize';

export interface GlobalM2SourceDiag {
  bloc: string;
  source: string;
  localObservationMonth: string | null;
  nativeLevel: number | null;
  fxPair: string | null;
  fxDate: string | null;
  fxRate: number | null;
  usdLevel: number | null;
  usdLevel1: number | null;
  usdLevel3: number | null;
  usdLevel12: number | null;
  r1: number | null;
  r3: number | null;
  r12: number | null;
  classification: string;
  stale: boolean;
}

function pct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return 100 * (a / b - 1);
}

/** Produce a per-bloc source diagnostic at the given confirmation lag (default 1). */
export function diagnoseGlobalM2Sources(blocs: NormalizedM2Bloc[], lag = 1): GlobalM2SourceDiag[] {
  return blocs.map((b) => {
    const obs = b.observations;
    const cur = obs.length - 1 - lag;
    const at = (k: number) => (cur - k >= 0 ? obs[cur - k].usdM2 : null);
    const L0 = cur >= 0 ? obs[cur].usdM2 : null;
    const L1 = at(1), L3 = at(3), L12 = at(12);
    const curObs = cur >= 0 ? obs[cur] : null;
    return {
      bloc: b.id,
      source: `${b.provider}:${b.sourceSeries}`,
      localObservationMonth: curObs?.month ?? null,
      nativeLevel: curObs?.nativeM2 ?? null,
      fxPair: curObs?.fxPair ?? null,
      fxDate: curObs?.fxObservationDate ?? null,
      fxRate: curObs?.fxRate ?? null,
      usdLevel: L0,
      usdLevel1: L1,
      usdLevel3: L3,
      usdLevel12: L12,
      r1: pct(L0, L1),
      r3: pct(L0, L3),
      r12: pct(L0, L12),
      classification: b.classification,
      stale: b.freshness.stale,
    };
  });
}
