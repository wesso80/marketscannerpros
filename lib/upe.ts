import { q } from '@/lib/db';

export type AssetClass = 'equity' | 'crypto';
export type Eligibility = 'eligible' | 'conditional' | 'blocked';
export type CapitalMode = 'normal' | 'reduced' | 'defensive';

type ProfilePreset = 'conservative' | 'balanced' | 'aggressive';
type VolTolerance = 'low' | 'med' | 'high';

export type GlobalSnapshot = {
  id: string;
  snapshotType: 'open' | 'close';
  regime: 'risk_on' | 'neutral' | 'risk_off';
  capitalMode: CapitalMode;
  volatilityState: string | null;
  liquidityState: string | null;
  adaptiveConfidence: number | null;
  components: Record<string, unknown>;
  createdAt: string;
};

export type CrcsSnapshotRow = {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  cluster: string | null;
  globalEligibility: Eligibility;
  confluenceScore: number;
  rarScore: number;
  crcsBase: number;
  microAdjustment: number;
  crcsFinal: number;
  capitalMode: CapitalMode;
  computedAt: string;
};

export type TenantProfile = {
  userId: string;
  preset: ProfilePreset;
  sizingModifier: number;
  volTolerance: VolTolerance;
  blockMicrocaps: boolean;
  blockHighBeta: boolean;
  onlyLargeMid: boolean;
};

export type OverlayResult = {
  profileName: ProfilePreset;
  globalEligibility: Eligibility;
  eligibilityUser: Eligibility;
  crcsFinal: number;
  crcsUser: number;
  sizingCap: number;
  overlayReasons: string[];
};

function toNum(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function eligibilityRank(value: Eligibility): number {
  if (value === 'blocked') return 3;
  if (value === 'conditional') return 2;
  return 1;
}

function tightenEligibility(base: Eligibility, next: Eligibility): Eligibility {
  return eligibilityRank(next) > eligibilityRank(base) ? next : base;
}

function capitalModeCap(mode: CapitalMode): number {
  if (mode === 'defensive') return 0.6;
  if (mode === 'reduced') return 0.8;
  return 1.0;
}

function isMicroLikeCluster(cluster: string | null): boolean {
  if (!cluster) return false;
  return cluster === 'micro_cap' || cluster === 'top_51_200';
}

function isLargeMidCluster(cluster: string | null): boolean {
  if (!cluster) return false;
  return cluster === 'large_cap' || cluster === 'mid_cap' || cluster === 'top_10' || cluster === 'top_11_50';
}

function isHighBetaCluster(cluster: string | null): boolean {
  return cluster === 'high_beta';
}

export async function getLatestGlobalSnapshot(): Promise<GlobalSnapshot | null> {
  const rows = await q<any>(
    `SELECT id, snapshot_type, regime, capital_mode, volatility_state, liquidity_state, adaptive_confidence, components_json, created_at
       FROM global_regime_snapshots
      ORDER BY created_at DESC
      LIMIT 1`,
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    id: String(row.id),
    snapshotType: row.snapshot_type,
    regime: row.regime,
    capitalMode: row.capital_mode,
    volatilityState: row.volatility_state ?? null,
    liquidityState: row.liquidity_state ?? null,
    adaptiveConfidence: row.adaptive_confidence !== null ? toNum(row.adaptive_confidence, 0) : null,
    components: row.components_json ?? {},
    createdAt: row.created_at,
  };
}

export async function getLatestMicroStates(): Promise<Record<AssetClass, { microState: string; adjustmentCap: number | null; computedAt: string }>> {
  const rows = await q<any>(
    `SELECT DISTINCT ON (asset_class) asset_class, micro_state, adjustment_cap, computed_at
       FROM micro_regime_snapshots
      WHERE asset_class IN ('equity', 'crypto')
      ORDER BY asset_class, computed_at DESC`,
  );

  const output: Record<string, { microState: string; adjustmentCap: number | null; computedAt: string }> = {};
  for (const row of rows) {
    output[row.asset_class] = {
      microState: row.micro_state,
      adjustmentCap: row.adjustment_cap !== null ? toNum(row.adjustment_cap, 0) : null,
      computedAt: row.computed_at,
    };
  }

  return output as Record<AssetClass, { microState: string; adjustmentCap: number | null; computedAt: string }>;
}

export async function getTenantProfile(userId: string): Promise<TenantProfile> {
  const rows = await q<any>(
    `SELECT user_id, preset, sizing_modifier, vol_tolerance, block_microcaps, block_high_beta, only_large_mid
       FROM tenant_profiles
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );

  if (!rows.length) {
    return {
      userId,
      preset: 'balanced',
      sizingModifier: 0.85,
      volTolerance: 'med',
      blockMicrocaps: false,
      blockHighBeta: false,
      onlyLargeMid: false,
    };
  }

  const row = rows[0];
  return {
    userId: String(row.user_id),
    preset: row.preset,
    sizingModifier: clamp(toNum(row.sizing_modifier, 0.85), 0.6, 1.0),
    volTolerance: row.vol_tolerance,
    blockMicrocaps: Boolean(row.block_microcaps),
    blockHighBeta: Boolean(row.block_high_beta),
    onlyLargeMid: Boolean(row.only_large_mid),
  };
}

export async function getLatestCrcsRows(assetClass: AssetClass, limit = 100): Promise<CrcsSnapshotRow[]> {
  const latest = await q<{ computed_at: string }>(
    `SELECT computed_at
       FROM crcs_hourly_base
      WHERE asset_class = $1
      ORDER BY computed_at DESC
      LIMIT 1`,
    [assetClass],
  );

  if (!latest.length) return [];

  const rows = await q<any>(
    `SELECT id, symbol, asset_class, cluster, global_eligibility, confluence_score, rar_score, crcs_base, micro_adjustment, crcs_final, capital_mode, computed_at
       FROM crcs_hourly_base
      WHERE asset_class = $1
        AND computed_at = $2
      ORDER BY
        CASE global_eligibility WHEN 'eligible' THEN 1 WHEN 'conditional' THEN 2 ELSE 3 END,
        crcs_final DESC,
        confluence_score DESC,
        symbol ASC
      LIMIT $3`,
    [assetClass, latest[0].computed_at, Math.max(1, Math.min(limit, 500))],
  );

  return rows.map((row) => ({
    id: String(row.id),
    symbol: String(row.symbol),
    assetClass: row.asset_class,
    cluster: row.cluster ?? null,
    globalEligibility: row.global_eligibility,
    confluenceScore: toNum(row.confluence_score),
    rarScore: toNum(row.rar_score),
    crcsBase: toNum(row.crcs_base),
    microAdjustment: toNum(row.micro_adjustment),
    crcsFinal: toNum(row.crcs_final),
    capitalMode: row.capital_mode,
    computedAt: row.computed_at,
  }));
}

export async function getLatestCrcsBySymbol(symbol: string, assetClass?: AssetClass): Promise<CrcsSnapshotRow | null> {
  const params: any[] = [symbol.toUpperCase()];
  let query =
    `SELECT id, symbol, asset_class, cluster, global_eligibility, confluence_score, rar_score, crcs_base, micro_adjustment, crcs_final, capital_mode, computed_at
       FROM crcs_hourly_base
      WHERE symbol = $1`;

  if (assetClass) {
    params.push(assetClass);
    query += ' AND asset_class = $2';
  }

  query += ' ORDER BY computed_at DESC LIMIT 1';

  const rows = await q<any>(query, params);
  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    assetClass: row.asset_class,
    cluster: row.cluster ?? null,
    globalEligibility: row.global_eligibility,
    confluenceScore: toNum(row.confluence_score),
    rarScore: toNum(row.rar_score),
    crcsBase: toNum(row.crcs_base),
    microAdjustment: toNum(row.micro_adjustment),
    crcsFinal: toNum(row.crcs_final),
    capitalMode: row.capital_mode,
    computedAt: row.computed_at,
  };
}

export function applyTenantOverlay(row: CrcsSnapshotRow, profile: TenantProfile): OverlayResult {
  const reasons: string[] = [];
  let eligibilityUser = row.globalEligibility;

  if (row.globalEligibility === 'blocked') {
    reasons.push('global_blocked');
  }

  if (profile.onlyLargeMid && !isLargeMidCluster(row.cluster)) {
    eligibilityUser = tightenEligibility(eligibilityUser, 'blocked');
    reasons.push('profile_only_large_mid');
  }

  if (profile.blockMicrocaps && isMicroLikeCluster(row.cluster)) {
    eligibilityUser = tightenEligibility(eligibilityUser, 'blocked');
    reasons.push('profile_block_microcaps');
  }

  if (profile.blockHighBeta && isHighBetaCluster(row.cluster)) {
    eligibilityUser = tightenEligibility(eligibilityUser, 'blocked');
    reasons.push('profile_block_high_beta');
  }

  if (profile.volTolerance === 'low' && isHighBetaCluster(row.cluster)) {
    eligibilityUser = tightenEligibility(eligibilityUser, 'blocked');
    reasons.push('vol_tolerance_low_high_beta');
  }

  if (profile.volTolerance === 'med' && isHighBetaCluster(row.cluster) && row.globalEligibility === 'eligible') {
    eligibilityUser = tightenEligibility(eligibilityUser, 'conditional');
    reasons.push('vol_tolerance_med_high_beta');
  }

  const cap = capitalModeCap(row.capitalMode);
  const sizingCap = clamp(Math.min(cap, profile.sizingModifier), 0.6, 1.0);

  let crcsUser = row.crcsFinal;
  if (eligibilityUser === 'blocked') {
    crcsUser = Math.min(crcsUser, 39.99);
  } else if (eligibilityUser === 'conditional' && row.globalEligibility === 'eligible') {
    crcsUser = Math.min(crcsUser, 69.99);
  }

  return {
    profileName: profile.preset,
    globalEligibility: row.globalEligibility,
    eligibilityUser,
    crcsFinal: row.crcsFinal,
    crcsUser: Number(crcsUser.toFixed(2)),
    sizingCap: Number(sizingCap.toFixed(2)),
    overlayReasons: Array.from(new Set(reasons)),
  };
}
