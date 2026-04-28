import { q } from "@/lib/db";
import type { ScanContext } from "@/lib/operator/orchestrator";

export type AdminRiskSource = "portfolio_journal" | "operator_state" | "fallback";

export type AdminRiskSnapshot = {
  equity: number;
  dailyPnl: number;
  dailyDrawdown: number;
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
  source: "fallback",
  workspaceId: null,
  lastUpdatedAt: null,
  notes: ["No live portfolio or operator risk state found; scanner permissions are research-only WAIT with no sizing context."],
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

async function loadOperatorRiskState(): Promise<AdminRiskSnapshot> {
  try {
    const rows = await q<{ context_state: Record<string, any>; updated_at: string | null }>(
      "SELECT context_state, updated_at::text FROM operator_state ORDER BY created_at DESC LIMIT 1",
    );
    const ctx = rows[0]?.context_state;
    if (!ctx) return FALLBACK_ADMIN_RISK;

    const rawEquity = Number(ctx.equity ?? 0);
    const hasLiveEquity = Number.isFinite(rawEquity) && rawEquity > 0;
    const equity = hasLiveEquity ? rawEquity : UNKNOWN_EQUITY;
    const openExposure = Number(ctx.openRisk ?? 0);
    const killSwitchActive = Boolean(ctx.killSwitchActive);
    const dailyDrawdown = Number(ctx.dailyDrawdown ?? 0);
    const correlationRisk = Number(ctx.correlationRisk ?? 0);
    const activePositions = Number(ctx.activePositions ?? 0);
    const maxPositions = Number(ctx.maxPositions ?? 10);
    const permission = !hasLiveEquity
      ? "WAIT"
      : killSwitchActive
      ? "BLOCK"
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
      source: "operator_state",
      workspaceId: null,
      lastUpdatedAt: rows[0]?.updated_at ?? null,
      notes: [
        "Risk read from latest operator state; portfolio/journal sync was unavailable.",
        ...(hasLiveEquity ? [] : ["Operator state has no live equity value; sizing is disabled and permission is capped at WAIT."]),
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

export async function loadAdminRiskSnapshot(): Promise<AdminRiskSnapshot> {
  const operatorRisk = await loadOperatorRiskState();
  const workspaceId = await resolveOperatorWorkspaceId();
  if (!workspaceId) return operatorRisk;

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
      `, [workspaceId]).catch(() => []),
      q<{ open_risk_usd: string | null; daily_pl: string | null; closed_trades_today: number; last_updated_at: string | null }>(`
        SELECT
          COALESCE(SUM(risk_amount::numeric) FILTER (WHERE is_open = TRUE), 0)::text AS open_risk_usd,
          COALESCE(SUM(pl::numeric) FILTER (WHERE COALESCE(exit_date, trade_date) = CURRENT_DATE), 0)::text AS daily_pl,
          COUNT(*) FILTER (WHERE is_open = FALSE AND COALESCE(exit_date, trade_date) = CURRENT_DATE)::int AS closed_trades_today,
          MAX(updated_at)::text AS last_updated_at
        FROM journal_entries
        WHERE workspace_id = $1
      `, [workspaceId]).catch(() => []),
      q<{ latest_equity: string | null; peak_equity: string | null; latest_snapshot: string | null }>(`
        SELECT
          (SELECT total_value::text FROM portfolio_performance WHERE workspace_id = $1 ORDER BY snapshot_date DESC LIMIT 1) AS latest_equity,
          (SELECT MAX(total_value)::text FROM portfolio_performance WHERE workspace_id = $1) AS peak_equity,
          (SELECT MAX(snapshot_date)::text FROM portfolio_performance WHERE workspace_id = $1) AS latest_snapshot
      `, [workspaceId]).catch(() => []),
    ]);

    const positions = positionRows[0];
    const journal = journalRows[0];
    const performance = performanceRows[0];
    const exposureUsd = Number(positions?.exposure_usd ?? 0);
    const openRiskUsd = Number(journal?.open_risk_usd ?? 0);
    const dailyPnl = Number(journal?.daily_pl ?? 0) + Number(positions?.unrealized_pl ?? 0);
    const rawEquity = Number(performance?.latest_equity ?? 0) || operatorRisk.equity;
    const hasLiveEquity = Number.isFinite(rawEquity) && rawEquity > 0;
    const equity = hasLiveEquity ? rawEquity : UNKNOWN_EQUITY;
    const peakEquity = hasLiveEquity ? Math.max(equity, Number(performance?.peak_equity ?? equity)) : UNKNOWN_EQUITY;
    const dailyDrawdown = hasLiveEquity
      ? Math.max(operatorRisk.dailyDrawdown, dailyPnl < 0 ? Math.abs(dailyPnl) / equity : 0, peakEquity > 0 ? Math.max(0, (peakEquity - equity) / peakEquity) : 0)
      : operatorRisk.dailyDrawdown;
    const largestSymbolExposure = Number(positions?.largest_symbol_exposure ?? 0);
    const correlationRisk = Math.max(operatorRisk.correlationRisk, exposureUsd > 0 ? largestSymbolExposure / exposureUsd : 0);
    const activePositions = Number(positions?.active_positions ?? 0);
    const openExposure = hasLiveEquity && openRiskUsd > 0 ? openRiskUsd / equity : hasLiveEquity && exposureUsd > 0 ? Math.min(0.05, (exposureUsd / equity) * 0.25) : 0;
    const killSwitchActive = operatorRisk.killSwitchActive || dailyDrawdown >= 0.04;
    const permission = !hasLiveEquity ? "WAIT" : killSwitchActive ? "BLOCK" : dailyDrawdown >= 0.02 || correlationRisk >= 0.65 ? "WAIT" : activePositions >= operatorRisk.maxPositions ? "WAIT" : "GO";
    const sizeMultiplier = !hasLiveEquity ? 0 : permission === "GO"
      ? Math.max(0.25, Math.min(1, 1 - Math.max(dailyDrawdown / 0.04, correlationRisk / 1.4)))
      : permission === "WAIT" ? 0.5 : 0;

    return {
      equity,
      dailyPnl,
      dailyDrawdown,
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
      lastUpdatedAt: positions?.last_updated_at ?? journal?.last_updated_at ?? performance?.latest_snapshot ?? null,
      notes: [
        `Risk synced from workspace portfolio/journal (${activePositions} open position${activePositions === 1 ? "" : "s"}).`,
        ...(hasLiveEquity
          ? [`Open risk ${formatUsd(openRiskUsd)} on ${formatUsd(equity)} equity; exposure ${formatUsd(exposureUsd)}.`]
          : ["No live portfolio equity value found; sizing is disabled and permission is capped at WAIT."]),
      ],
    };
  } catch {
    return operatorRisk;
  }
}

export async function buildAdminScanContext(): Promise<{ context: ScanContext; risk: AdminRiskSnapshot }> {
  const risk = await loadAdminRiskSnapshot();
  const fallbackThrottle = risk.source === "fallback" ? 0.25 : 1.0;
  const riskThrottle = risk.permission === "BLOCK" ? 0 : risk.permission === "WAIT" ? 0.5 : risk.sizeMultiplier;
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
    metaHealthThrottle: Math.min(fallbackThrottle, riskThrottle),
  };
  return { context, risk };
}
