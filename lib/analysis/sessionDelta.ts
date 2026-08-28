/* ---------------------------------------------------------------------------
   SESSION DELTA — "what changed since last session" (pure, testable)

   Compares a lightweight snapshot of the market environment captured on the
   user's previous Command Center visit against the current one, and produces a
   short, descriptive digest of what materially changed.

   Educational framing only: every item DESCRIBES an observed change in the
   environment. Nothing here is a trade instruction, a prediction, or a
   probability. Thresholds exist so we never surface trivial noise as "change".
   --------------------------------------------------------------------------- */

export type RiskTone = 'risk_on' | 'risk_off' | 'mixed';

export interface SessionSnapshotInput {
  regime: string | null;
  riskTone: RiskTone;
  /** 0..1 share of sampled sectors that are positive. */
  greenRatio: number;
  /** 24h total crypto market-cap change, in percent. */
  cryptoCapChange?: number;
  strongestSector?: string;
  weakestSector?: string;
  /** Human label for crypto participation (e.g. "Broad participation"). */
  cryptoParticipationLabel?: string;
  /** Tickers currently classified BUILDING / EXPANDING. */
  buildingSymbols?: string[];
  /** Name of the next high-importance scheduled event, if any. */
  nextHighImpactEvent?: string;
}

export interface SessionSnapshot extends SessionSnapshotInput {
  /** Epoch millis when the snapshot was captured. */
  ts: number;
  buildingSymbols: string[];
}

export type SessionDeltaKind =
  | 'regime'
  | 'risk'
  | 'sector'
  | 'crypto'
  | 'building'
  | 'event';

export interface SessionDeltaItem {
  kind: SessionDeltaKind;
  label: string;
  detail: string;
}

export interface SessionDelta {
  /** Human label for time elapsed since the previous snapshot. */
  elapsedLabel: string;
  /** Ordered, de-duplicated list of material changes. Empty = quiet. */
  items: SessionDeltaItem[];
  /** True when nothing material changed. */
  quiet: boolean;
}

/** Percentage-point breadth swing required to report a change. */
const BREADTH_SWING = 0.2;
/** Percentage-point crypto-cap swing required to report a change. */
const CRYPTO_CAP_SWING = 2;
/** Max building tickers listed in a single item. */
const MAX_BUILDING_LISTED = 5;

const RISK_TONE_LABEL: Record<RiskTone, string> = {
  risk_on: 'Risk-on',
  risk_off: 'Risk-off',
  mixed: 'Mixed',
};

export function buildSessionSnapshot(input: SessionSnapshotInput, now: number = Date.now()): SessionSnapshot {
  return {
    ts: now,
    regime: input.regime ?? null,
    riskTone: input.riskTone,
    greenRatio: clamp01(input.greenRatio),
    cryptoCapChange: input.cryptoCapChange,
    strongestSector: input.strongestSector,
    weakestSector: input.weakestSector,
    cryptoParticipationLabel: input.cryptoParticipationLabel,
    buildingSymbols: dedupeStrings(input.buildingSymbols ?? []),
    nextHighImpactEvent: input.nextHighImpactEvent,
  };
}

export function diffSessionSnapshots(prev: SessionSnapshot, curr: SessionSnapshot): SessionDelta {
  const items: SessionDeltaItem[] = [];

  // Regime shift — the highest-signal change.
  if (prev.regime && curr.regime && prev.regime !== curr.regime) {
    items.push({
      kind: 'regime',
      label: 'Market regime shifted',
      detail: `${prev.regime} → ${curr.regime}`,
    });
  }

  // Risk tone flip.
  if (prev.riskTone !== curr.riskTone) {
    items.push({
      kind: 'risk',
      label: 'Risk tone changed',
      detail: `${RISK_TONE_LABEL[prev.riskTone]} → ${RISK_TONE_LABEL[curr.riskTone]}`,
    });
  }

  // Sector breadth swing (only if it crosses the noise threshold).
  const breadthDelta = curr.greenRatio - prev.greenRatio;
  if (Math.abs(breadthDelta) >= BREADTH_SWING) {
    items.push({
      kind: 'sector',
      label: breadthDelta > 0 ? 'Breadth broadened' : 'Breadth narrowed',
      detail: `${pct(prev.greenRatio)} → ${pct(curr.greenRatio)} of sectors positive`,
    });
  }

  // Sector leadership rotation.
  if (prev.strongestSector && curr.strongestSector && prev.strongestSector !== curr.strongestSector) {
    items.push({
      kind: 'sector',
      label: 'Sector leadership rotated',
      detail: `${prev.strongestSector} → ${curr.strongestSector} now leading`,
    });
  }

  // Crypto participation label change.
  if (
    prev.cryptoParticipationLabel &&
    curr.cryptoParticipationLabel &&
    prev.cryptoParticipationLabel !== curr.cryptoParticipationLabel
  ) {
    items.push({
      kind: 'crypto',
      label: 'Crypto participation changed',
      detail: `${prev.cryptoParticipationLabel} → ${curr.cryptoParticipationLabel}`,
    });
  } else if (
    typeof prev.cryptoCapChange === 'number' &&
    typeof curr.cryptoCapChange === 'number' &&
    Math.abs(curr.cryptoCapChange - prev.cryptoCapChange) >= CRYPTO_CAP_SWING
  ) {
    // Fall back to a cap-swing note only when the qualitative label was stable.
    items.push({
      kind: 'crypto',
      label: 'Crypto participation shifted',
      detail: `24h cap change ${signed(prev.cryptoCapChange)} → ${signed(curr.cryptoCapChange)}`,
    });
  }

  // New names building (present now, absent before).
  const prevBuilding = new Set(prev.buildingSymbols);
  const newBuilding = curr.buildingSymbols.filter((s) => !prevBuilding.has(s));
  if (newBuilding.length > 0) {
    const shown = newBuilding.slice(0, MAX_BUILDING_LISTED);
    const more = newBuilding.length - shown.length;
    items.push({
      kind: 'building',
      label: 'New names building',
      detail: more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', '),
    });
  }

  // High-impact event newly on the clock.
  if (curr.nextHighImpactEvent && curr.nextHighImpactEvent !== prev.nextHighImpactEvent) {
    items.push({
      kind: 'event',
      label: 'High-impact event ahead',
      detail: curr.nextHighImpactEvent,
    });
  }

  return {
    elapsedLabel: formatElapsed(curr.ts - prev.ts),
    items,
    quiet: items.length === 0,
  };
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'earlier';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return 'over a month ago';
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function pct(ratio: number): string {
  return `${Math.round(clamp01(ratio) * 100)}%`;
}

function signed(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((s) => typeof s === 'string' && s.length > 0)));
}
