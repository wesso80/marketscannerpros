import { q } from "@/lib/db";
import { measureDailyRisk, type RiskEquitySnapshot } from "./riskSnapshotMetrics";
import type { ScanContext } from "@/lib/operator/orchestrator";

export type AdminRiskSource = "portfolio_journal" | "operator_state" | "fallback";

export type AdminRiskSnapshot = {
  equity: number;
  dailyPnl: number;
  dailyDrawdown: number;
  dailyDrawdownKnown?: boolean;
  dailyRiskBaselineEquity?: number | null;
  dailyRiskAsOf?: string | null;
  dailyRiskBasis?: string;
  openExposure: number;
  openRiskUsd: number;
  exposureUsd: number;
  correlationRisk: number;
  activePositions: number;
  maxPositions: number;
  killSwitchActive: boolean;
  permission: "GO" | "WAIT" | "BLOCK";
  sizeMultiplier: number;
  source: AdminRiskSource;
  workspaceId: string | null;
  lastUpdatedAt: string | null;
  notes: string[];
  /** True when portfolio/risk state would restrict NEW trade execution. Discovery unaffected. */
  operatorGuardActive: boolean;
  /** Human-readable reasons for operator guard (warnings only, not discovery blocks). */
  operatorGuardReasons: string[];
};

const UNKNOWN_EQUITY = 0;
const LIVE_ACCOUNT_RISK_UNIT = 0.01;

export const DEFAULT_ADMIN_SCAN_CONTEXT: ScanContext = {
  portfolioState: {
    equity: UNKNOWN_EQUITY,
    dailyPnl: 0,
    drawdownPct: 0,
    openRisk: 0,
    correlationRisk: 0,
    activePositions: 0,
    killSwitchActive: false,
  },
  riskPolicy: {
    maxDailyLossPct: 0.02,
    maxDrawdownPct: 0.06,
    maxOpenRiskPct: 0.05,
    maxCorrelationRisk: 0.7,
  },
  executionEnvironment: {
    brokerConnected: false,
    estimatedSlippageBps: 10,
    minLiquidityOk: true,
  },
  accountState: {
    buyingPower: UNKNOWN_EQUITY,
    accountRiskUnit: 0,
  },
  instrumentMeta: {},
  healthContext: {
    symbolTrustScore: 0.7,
    playbookHealthScore: 0.7,
    modelHealthScore: 0.7,
  },
  metaHealthThrottle: 1.0,
};

export const FALLBACK_ADMIN_RISK: AdminRiskSnapshot = {
  equity: UNKNOWN_EQUITY,
  dailyPnl: 0,
  dailyDrawdown: 0,
  openExposure: 0,
  openRiskUsd: 0,
  exposureUsd: 0,
  correlationRisk: 0,
  activePositions: 0,
  maxPositions: 0,
  killSwitchActive: false,
  permission: "WAIT",
  sizeMultiplier: 0,
  dailyDrawdownKnown: false,
  dailyRiskBasis: "unavailable",
  source: "fallback",
  workspaceId: null,
  lastUpdatedAt: null,
  notes: ["No live portfolio or operator risk state found; scanner permissions are research-only WAIT with no sizing context."],
  operatorGuardActive: false,
  operatorGuardReasons: [],
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

async function loadOperatorRiskState(workspaceId?: string): Promise<AdminRiskSnapshot> {
  try {
    const rows = await q<{ context_state: Record<string, any>; updated_at: string | null }>(
      `SELECT context_state, updated_at::text FROM operator_state
       ${workspaceId ? "WHERE workspace_id = $1" : ""}
       ORDER BY updated_at DESC LIMIT 1`,
      workspaceId ? [workspaceId] : [],
    );
    const ctx = rows[0]?.context_state;
    if (!ctx) return FALLBACK_ADMIN_RISK;

    const rawEquity = Number(ctx.equity ?? 0);
    const hasLiveEquity = Number.isFinite(rawEquity) && rawEquity > 0;
    const equity = hasLiveEquity ? rawEquity : UNKNOWN_EQUITY;
    const openExposure = Number(ctx.openRisk ?? 0);
    const killSwitchActive = Boolean(ctx.killSwitchActive) || ctx.permission === "BLOCK" || Number(ctx.dailyDrawdown) >= 0.04;
    const reportedDrawdown = Number(ctx.dailyDrawdown ?? 0);
    const dailyDrawdown = Number.isFinite(reportedDrawdown) ? Math.max(0, reportedDrawdown) : 0;
    const correlationRisk = Number(ctx.correlationRisk ?? 0);
    const activePositions = Number(ctx.activePositions ?? 0);
    const maxPositions = Number(ctx.maxPositions ?? 10);
    const permission = killSwitchActive
      ? "BLOCK"
      : !hasLiveEquity
      ? "WAIT"
      : dailyDrawdown >= 0.02 || correlationRisk >= 0.65 || activePositions >= maxPositions
        ? "WAIT"
        : String(ctx.permission ?? "WAIT") === "GO"
          ? "GO"
          : "WAIT";

    return {
      equity,
      dailyPnl: Number(ctx.dailyPnl ?? 0),
      dailyDrawdown,
      openExposure,
      openRiskUsd: hasLiveEquity ? openExposure * equity : 0,
      exposureUsd: Number(ctx.exposureUsd ?? 0),
      correlationRisk,
      activePositions,
      maxPositions,
      killSwitchActive,
      permission,
      sizeMultiplier: !hasLiveEquity || permission === "BLOCK" ? 0 : Number(ctx.sizeMultiplier ?? (permission === "GO" ? 1 : 0.5)),
      dailyDrawdownKnown: false,
      dailyRiskBasis: "Operator-reported value; daily baseline unverified",
      source: "operator_state",
      workspaceId: workspaceId ?? null,
      lastUpdatedAt: rows[0]?.updated_at ?? null,
      notes: [
        "Risk read from latest operator state; portfolio/journal sync was unavailable.",
        ...(hasLiveEquity ? [] : ["Operator state has no live equity value; sizing is disabled and permission is capped at WAIT."]),
      ],
      operatorGuardActive: permission === "BLOCK" || permission === "WAIT",
      operatorGuardReasons: [
        ...(killSwitchActive ? ["Kill switch active"] : []),
        ...(dailyDrawdown >= 0.02 ? [`Snapshot daily loss ${(dailyDrawdown * 100).toFixed(1)}%`] : []),
        ...(correlationRisk >= 0.65 ? ["Correlation risk elevated"] : []),
        ...(!hasLiveEquity ? ["No live equity value"] : []),
      ],
    };
  } catch {
    return FALLBACK_ADMIN_RISK;
  }
}

async function resolveOperatorWorkspaceId(): Promise<string | null> {
  const configured = process.env.ADMIN_WORKSPACE_ID || process.env.OPERATOR_WORKSPACE_ID || process.env.PRIMARY_WORKSPACE_ID;
  if (configured) return configured;
  try {
    const rows = await q<{ workspace_id: string }>(`
      SELECT workspace_id
      FROM (
        SELECT workspace_id, MAX(updated_at) AS last_activity FROM journal_entries GROUP BY workspace_id
        UNION ALL
        SELECT workspace_id, MAX(updated_at) AS last_activity FROM portfolio_positions GROUP BY workspace_id
        UNION ALL
        SELECT workspace_id, MAX(created_at) AS last_activity FROM portfolio_closed GROUP BY workspace_id
      ) activity
      WHERE workspace_id IS NOT NULL
      ORDER BY last_activity DESC NULLS LAST
      LIMIT 1
    `);
    return rows[0]?.workspace_id ?? null;
  } catch {
    return null;
  }
}

export async function loadAdminRiskSnapshot(workspaceIdOverride?: string): Promise<AdminRiskSnapshot> {
  const workspaceId = workspaceIdOverride ?? await resolveOperatorWorkspaceId();
  const operatorRisk = await loadOperatorRiskState(workspaceId ?? undefined);
  if (!workspaceId) return { ...operatorRisk, permission: operatorRisk.killSwitchActive ? "BLOCK" : "WAIT", sizeMultiplier: 0 };

  try {
    const [positionRows, journalRows, performanceRows] = await Promise.all([
      q<{ active_positions: number; exposure_usd: string | null; unrealized_pl: string | null; largest_symbol_exposure: string | null; last_updated_at: string | null }>(`
        SELECT
          COUNT(*)::int AS active_positions,
          COALESCE(SUM(ABS(quantity::numeric * current_price::numeric)), 0)::text AS exposure_usd,
          COALESCE(SUM(CASE WHEN side = 'LONG' THEN (current_price::numeric - entry_price::numeric) * quantity::numeric ELSE (entry_price::numeric - current_price::numeric) * quantity::numeric END), 0)::text AS unrealized_pl,
          COALESCE(MAX(symbol_exposure), 0)::text AS largest_symbol_exposure,
          MAX(updated_at)::text AS last_updated_at
        FROM (
          SELECT *, SUM(ABS(quantity::numeric * current_price::numeric)) OVER (PARTITION BY symbol) AS symbol_exposure
          FROM portfolio_positions
          WHERE workspace_id = $1
        ) positions
      `, [workspaceId]),
      q<{ open_risk_usd: string | null; daily_pl: string | null; closed_trades_today: number; last_updated_at: string | null }>(`
        SELECT
          COALESCE(SUM(risk_amount::numeric) FILTER (WHERE is_open = TRUE), 0)::text AS open_risk_usd,
          COALESCE(SUM(pl::numeric) FILTER (WHERE is_open = FALSE AND COALESCE(exit_date, trade_date) = (NOW() AT TIME ZONE 'UTC')::date), 0)::text AS daily_pl,
          COUNT(*) FILTER (WHERE is_open = FALSE AND COALESCE(exit_date, trade_date) = CURRENT_DATE)::int AS closed_trades_today,
          MAX(updated_at)::text AS last_updated_at
        FROM journal_entries
        WHERE workspace_id = $1
      `, [workspaceId]),
      q<RiskEquitySnapshot & { legacy_peak_equity?: string }>(`
        SELECT snapshot_date::text, total_value::text, total_pl::text, snapshot_basis,
          MAX(total_value) OVER ()::text AS legacy_peak_equity
        FROM portfolio_performance
        WHERE workspace_id = $1
        ORDER BY snapshot_date DESC LIMIT 2
      `, [workspaceId]),
    ]);

    const positions = positionRows[0];
    const journal = journalRows[0];
    const dailyRisk = measureDailyRisk(performanceRows);
    const exposureUsd = Number(positions?.exposure_usd ?? 0);
    const openRiskUsd = Number(journal?.open_risk_usd ?? 0);
    const { equity, dailyPnl, dailyDrawdown, dailyDrawdownKnown } = dailyRisk;
    const hasLiveEquity = equity > 0;
    // Preserve a hard stop from legacy inputs while the corrected baseline is unavailable.
    // This signal is never presented as a measured daily loss.
    const legacyEquity = Number(performanceRows[0]?.total_value) || operatorRisk.equity;
    const legacyPnl = Number(journal?.daily_pl ?? 0) + Number(positions?.unrealized_pl ?? 0);
    const legacyPeak = Number(performanceRows[0]?.legacy_peak_equity);
    const unverifiedLossStop = !dailyDrawdownKnown && legacyEquity > 0 && (
      legacyPnl / legacyEquity <= -0.04 || (legacyPeak > 0 && (legacyPeak - legacyEquity) / legacyPeak >= 0.04)
    );
    const largestSymbolExposure = Number(positions?.largest_symbol_exposure ?? 0);
    const correlationRisk = Math.max(operatorRisk.correlationRisk, exposureUsd > 0 ? largestSymbolExposure / exposureUsd : 0);
    const activePositions = Number(positions?.active_positions ?? 0);
    const openExposure = hasLiveEquity && openRiskUsd > 0 ? openRiskUsd / equity : hasLiveEquity && exposureUsd > 0 ? Math.min(0.05, (exposureUsd / equity) * 0.25) : 0;
    const killSwitchActive = operatorRisk.killSwitchActive || dailyDrawdown >= 0.04 || unverifiedLossStop;
    const permission = killSwitchActive ? "BLOCK" : !hasLiveEquity || !dailyDrawdownKnown ? "WAIT" : dailyDrawdown >= 0.02 || correlationRisk >= 0.65 ? "WAIT" : activePositions >= operatorRisk.maxPositions ? "WAIT" : "GO";
    const sizeMultiplier = !hasLiveEquity || !dailyDrawdownKnown ? 0 : permission === "GO"
      ? Math.max(0.25, Math.min(1, 1 - Math.max(dailyDrawdown / 0.04, correlationRisk / 1.4)))
      : permission === "WAIT" ? 0.5 : 0;

    return {
      ...dailyRisk,
      openExposure,
      openRiskUsd,
      exposureUsd,
      correlationRisk,
      activePositions,
      maxPositions: operatorRisk.maxPositions,
      killSwitchActive,
      permission,
      sizeMultiplier,
      source: "portfolio_journal",
      workspaceId,
      lastUpdatedAt: positions?.last_updated_at ?? journal?.last_updated_at ?? dailyRisk.dailyRiskAsOf ?? null,
      notes: [
        dailyDrawdownKnown
          ? `Snapshot daily loss as of ${dailyRisk.dailyRiskAsOf} UTC; baseline ${formatUsd(dailyRisk.dailyRiskBaselineEquity!)}. Cumulative P&L change excludes cash flows; this is not an intraday high-water drawdown.`
          : "Daily loss unavailable: consecutive current-day and prior-day UTC account_equity_v2 snapshots are required. Legacy position values and lifetime unrealized P&L are not daily loss.",
        ...(unverifiedLossStop ? ["Legacy loss signal remains blocked pending verified daily account snapshots; it is not a measured daily loss."] : []),
        `Risk synced from workspace portfolio/journal (${activePositions} open position${activePositions === 1 ? "" : "s"}).`,
        ...(hasLiveEquity
          ? [`Open risk ${formatUsd(openRiskUsd)} on ${formatUsd(equity)} equity; exposure ${formatUsd(exposureUsd)}.`]
          : ["No live portfolio equity value found; sizing is disabled and permission is capped at WAIT."]),
      ],
      operatorGuardActive: permission === "BLOCK" || permission === "WAIT",
      operatorGuardReasons: [
        ...(operatorRisk.killSwitchActive ? ["Existing operator hard stop active"] : []),
        ...(dailyDrawdown >= 0.04 ? ["Verified daily loss hard stop active"] : []),
        ...(unverifiedLossStop ? ["Unverified legacy loss signal: reconcile account snapshots"] : []),
        ...(!dailyDrawdownKnown ? ["Daily account baseline unavailable; sizing disabled"] : []),
        ...(dailyDrawdown >= 0.02 ? [`Snapshot daily loss ${(dailyDrawdown * 100).toFixed(1)}%`] : []),
        ...(correlationRisk >= 0.65 ? [`Correlation risk ${(correlationRisk * 100).toFixed(0)}%`] : []),
        ...(activePositions >= operatorRisk.maxPositions ? [`Max positions (${activePositions}) reached`] : []),
        ...(!hasLiveEquity ? ["No live equity - sizing disabled"] : []),
      ],
    };
  } catch {
    return {
      ...operatorRisk, workspaceId,
      permission: operatorRisk.permission === "BLOCK" ? "BLOCK" : "WAIT",
      sizeMultiplier: 0, operatorGuardActive: true,
      notes: [...operatorRisk.notes, "Portfolio/journal risk reads failed; clearance and sizing are withheld."],
      operatorGuardReasons: [...operatorRisk.operatorGuardReasons, "Portfolio/journal risk unavailable"],
    };
  }
}

export async function buildAdminScanContext(workspaceId?: string): Promise<{ context: ScanContext; risk: AdminRiskSnapshot }> {
  const risk = await loadAdminRiskSnapshot(workspaceId);
  const fallbackThrottle = risk.source === "fallback" ? 0.25 : 1.0;
  // metaHealthThrottle controls discovery scoring. Portfolio risk (drawdown, kill
  // switch, permission) must NOT throttle it -- those are operator guard warnings only.
  const context: ScanContext = {
    ...DEFAULT_ADMIN_SCAN_CONTEXT,
    portfolioState: {
      ...DEFAULT_ADMIN_SCAN_CONTEXT.portfolioState,
      equity: risk.equity,
      dailyPnl: risk.dailyPnl,
      openRisk: risk.openRiskUsd,
      drawdownPct: risk.dailyDrawdown,
      correlationRisk: risk.correlationRisk,
      activePositions: risk.activePositions,
      killSwitchActive: risk.killSwitchActive,
    },
    accountState: {
      ...DEFAULT_ADMIN_SCAN_CONTEXT.accountState,
      buyingPower: risk.equity > 0 ? Math.max(0, risk.equity - risk.exposureUsd) : 0,
      accountRiskUnit: risk.equity > 0 && risk.source !== "fallback" ? LIVE_ACCOUNT_RISK_UNIT : 0,
    },
    metaHealthThrottle: fallbackThrottle,
  };
  return { context, risk };
}
