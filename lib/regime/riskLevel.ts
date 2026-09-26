/**
 * Risk level, permission and data quality for /api/regime (OV-12).
 *
 * The risk level comes only from the classified regime, which comes from the input values (VIX level and 5-day
 * change, credit spreads, SPY/QQQ trend). Stale inputs are a data-quality caution, reported in `dataQuality`.
 * They no longer raise the risk level: before OV-12 a stale VIX of 14 showed as "Elevated volatility stress".
 *
 * No server imports, so client components can use these helpers too.
 */

export type RegimeRiskLevel = 'low' | 'moderate' | 'elevated' | 'extreme';
export type RegimePermission = 'YES' | 'CONDITIONAL' | 'NO';

export interface RegimeDataQuality {
  /** True when any signal that decided the regime is stale. */
  stale: boolean;
  /** Sources of the stale deciding signals. */
  staleSources: string[];
  /** Caution text for the UI, e.g. "Stale inputs: market data as of 2026-09-22. …". Null when inputs are current. */
  note: string | null;
}

interface SignalLike {
  source: string;
  stale: boolean;
  counted?: boolean;
  kind?: 'market' | 'workspace';
  asOf?: string | null;
}

/** Risk level from the regime (the values) only. Staleness is not an input. */
export function deriveRiskLevel(regime: string): RegimeRiskLevel {
  if (regime === 'RISK_OFF_STRESS') return 'extreme';
  if (regime === 'VOL_EXPANSION') return 'elevated';
  if (regime === 'TREND_DOWN') return 'moderate';
  return 'low';
}

/**
 * Informational regime posture — NOT a trade gate (no scoring or authorization path may consume it).
 * Direction-neutral: a down-trend is not riskier than an up-trend for a strategy that can go short, so TREND_DOWN does
 * not imply CONDITIONAL. Only the value-based risk level tightens it; stale inputs are reported in `dataQuality`.
 */
export function derivePermission(riskLevel: RegimeRiskLevel): RegimePermission {
  if (riskLevel === 'extreme') return 'NO';
  if (riskLevel === 'elevated') return 'CONDITIONAL';
  return 'YES';
}

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

/** Data-quality caution from the signals that decided the regime (`counted !== false`). */
export function deriveDataQuality(signals: SignalLike[]): RegimeDataQuality {
  const stale = signals.filter((s) => s.counted !== false && s.stale);
  if (stale.length === 0) return { stale: false, staleSources: [], note: null };
  const parts = stale.map((s) => {
    const name = s.source === 'market_data' || s.kind === 'market' ? 'market data' : s.source.replace(/_/g, ' ');
    const asOf = day(s.asOf);
    return asOf ? `${name} as of ${asOf}` : name;
  });
  return {
    stale: true,
    staleSources: stale.map((s) => s.source),
    note: `Stale inputs: ${parts.join(', ')}. Risk level reflects the latest available values; treat it with caution.`,
  };
}

/** Data quality for a client-side regime body: uses `dataQuality` when present, else the signals' stale flags. */
export function regimeDataQuality(data: { dataQuality?: RegimeDataQuality | null; signals?: SignalLike[] | null } | null | undefined): RegimeDataQuality {
  if (data?.dataQuality && typeof data.dataQuality.stale === 'boolean') return data.dataQuality;
  return deriveDataQuality(data?.signals ?? []);
}

/** True for the risk levels that should read as elevated risk in the UI. */
export function isElevatedRisk(riskLevel: string | null | undefined): boolean {
  return riskLevel === 'elevated' || riskLevel === 'extreme';
}
