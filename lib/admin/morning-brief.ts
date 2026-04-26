import { q } from "@/lib/db";
import { runScan } from "@/lib/operator/orchestrator";
import type { ScanContext } from "@/lib/operator/orchestrator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { scanResultToHealth, scanResultToHits } from "@/lib/admin/serializer";
import type { ScannerHit, SystemHealth } from "@/lib/admin/types";
import type { Market } from "@/types/operator";

export type DeskState = "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";

export type MorningCatalyst = {
  ticker: string;
  source: string;
  headline: string;
  url?: string | null;
  catalystType?: string | null;
  catalystSubtype?: string | null;
  eventTimestampEt?: string | null;
};

export type MorningRiskState = {
  openExposure: number;
  dailyDrawdown: number;
  correlationRisk: number;
  maxPositions: number;
  activePositions: number;
  killSwitchActive: boolean;
  permission: string;
  sizeMultiplier: number;
};

export type MorningLearningSnapshot = {
  totalSignals: number;
  labeled: number;
  pending: number;
  accuracyRate: number | null;
  briefFeedbackTotal: number;
  briefFeedbackByAction: Record<string, number>;
};

export type MorningBrief = {
  generatedAt: string;
  market: Market;
  timeframe: string;
  deskState: DeskState;
  headline: string;
  operatorNote: string;
  topPlays: ScannerHit[];
  watchlist: ScannerHit[];
  avoidList: ScannerHit[];
  catalysts: MorningCatalyst[];
  risk: MorningRiskState;
  learning: MorningLearningSnapshot;
  health: SystemHealth;
  nextImprovements: string[];
};

const DEFAULT_SYMBOLS = ["ADA", "SUI", "MATIC", "FET", "SOL", "AVAX", "DOT", "LINK"];

const DEFAULT_CONTEXT: ScanContext = {
  portfolioState: {
    equity: 100000,
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
    buyingPower: 100000,
    accountRiskUnit: 0.01,
  },
  instrumentMeta: {},
  healthContext: {
    symbolTrustScore: 0.7,
    playbookHealthScore: 0.7,
    modelHealthScore: 0.7,
  },
  metaHealthThrottle: 1.0,
};

const FALLBACK_RISK: MorningRiskState = {
  openExposure: 0,
  dailyDrawdown: 0,
  correlationRisk: 0,
  maxPositions: 10,
  activePositions: 0,
  killSwitchActive: false,
  permission: "WAIT",
  sizeMultiplier: 1,
};

const FALLBACK_LEARNING: MorningLearningSnapshot = {
  totalSignals: 0,
  labeled: 0,
  pending: 0,
  accuracyRate: null,
  briefFeedbackTotal: 0,
  briefFeedbackByAction: {},
};

export async function buildMorningBrief(options: {
  symbols?: string[];
  market?: Market;
  timeframe?: string;
} = {}): Promise<MorningBrief> {
  const symbols = (options.symbols?.length ? options.symbols : DEFAULT_SYMBOLS)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
  const market = options.market ?? "CRYPTO";
  const timeframe = options.timeframe ?? "15m";

  const [risk, learning] = await Promise.all([
    loadRiskState(),
    loadLearningSnapshot(),
  ]);

  const context: ScanContext = {
    ...DEFAULT_CONTEXT,
    portfolioState: {
      ...DEFAULT_CONTEXT.portfolioState,
      openRisk: risk.openExposure,
      drawdownPct: risk.dailyDrawdown,
      correlationRisk: risk.correlationRisk,
      activePositions: risk.activePositions,
      killSwitchActive: risk.killSwitchActive,
    },
  };

  const scan = await runScan({ symbols, market, timeframe }, context, alphaVantageProvider);
  const hits = scanResultToHits(scan);
  const health = scanResultToHealth(scan, true);
  const catalysts = await loadCatalysts(symbols);

  const topPlays = hits.filter((hit) => hit.permission === "GO").slice(0, 5);
  const watchlist = hits.filter((hit) => hit.permission === "WAIT").slice(0, 8);
  const avoidList = hits.filter((hit) => hit.permission === "BLOCK").slice(0, 6);
  const deskState = resolveDeskState(risk, health, topPlays, watchlist);

  return {
    generatedAt: new Date().toISOString(),
    market,
    timeframe,
    deskState,
    headline: buildHeadline(deskState, topPlays, catalysts),
    operatorNote: buildOperatorNote(deskState, topPlays, watchlist, risk, learning),
    topPlays,
    watchlist,
    avoidList,
    catalysts,
    risk,
    learning,
    health,
    nextImprovements: [
      "Add accepted/ignored/missed buttons to train playbook ranking from your morning actions.",
      "Persist each daily brief so tomorrow can compare what changed overnight.",
      "Connect broker/account state so risk permission is based on actual exposure, not default context.",
    ],
  };
}

export function renderMorningBriefEmail(brief: MorningBrief): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.marketscannerpros.app";
  const topRows = brief.topPlays.length > 0
    ? brief.topPlays.map((play) => playRow(play, appUrl)).join("")
    : emptyRow("No GO candidates. Stand down or wait for triggers.");
  const watchRows = brief.watchlist.length > 0
    ? brief.watchlist.slice(0, 5).map((play) => playRow(play, appUrl)).join("")
    : emptyRow("No watchlist candidates worth forcing.");
  const catalystRows = brief.catalysts.length > 0
    ? brief.catalysts.slice(0, 8).map((event) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:#e2e8f0;font-weight:700;">${escapeHtml(event.ticker)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(event.headline)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:#94a3b8;text-align:right;">${escapeHtml(event.source)}</td>
      </tr>`).join("")
    : emptyRow("No fresh catalyst events found for the scanned symbols.", 3);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;">
  <div style="max-width:760px;margin:0 auto;background:#101826;border:1px solid #233044;border-radius:14px;overflow:hidden;">
    <div style="padding:24px;border-bottom:1px solid #233044;background:#111d2e;">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#10b981;font-weight:800;">MSP Private Morning Brief</div>
      <h1 style="font-size:28px;line-height:1.15;margin:10px 0 8px;color:#f8fafc;">${escapeHtml(brief.headline)}</h1>
      <p style="margin:0;color:#94a3b8;font-size:14px;">${escapeHtml(brief.operatorNote)}</p>
    </div>
    <div style="padding:20px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <tr>
          ${statCell("Desk State", brief.deskState)}
          ${statCell("Top Plays", String(brief.topPlays.length))}
          ${statCell("Risk", brief.risk.killSwitchActive ? "Kill Active" : brief.risk.permission)}
          ${statCell("Learning", brief.learning.accuracyRate == null ? "Pending" : `${brief.learning.accuracyRate.toFixed(1)}%`)}
        </tr>
      </table>

      ${section("Best Plays", `<table style="width:100%;border-collapse:collapse;">${topRows}</table>`)}
      ${section("Watch, Do Not Chase", `<table style="width:100%;border-collapse:collapse;">${watchRows}</table>`)}
      ${section("News And Catalyst Risk", `<table style="width:100%;border-collapse:collapse;">${catalystRows}</table>`)}

      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/admin/morning-brief" style="display:inline-block;background:#10b981;color:#07111f;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:800;">Open Morning Brief</a>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

async function loadRiskState(): Promise<MorningRiskState> {
  try {
    const rows = await q<{ context_state: Record<string, any> }>(
      "SELECT context_state FROM operator_state ORDER BY created_at DESC LIMIT 1",
    );
    const ctx = rows[0]?.context_state;
    if (!ctx) return FALLBACK_RISK;
    return {
      openExposure: Number(ctx.openRisk ?? 0),
      dailyDrawdown: Number(ctx.dailyDrawdown ?? 0),
      correlationRisk: Number(ctx.correlationRisk ?? 0),
      maxPositions: Number(ctx.maxPositions ?? 10),
      activePositions: Number(ctx.activePositions ?? 0),
      killSwitchActive: Boolean(ctx.killSwitchActive),
      permission: ctx.killSwitchActive ? "BLOCK" : String(ctx.permission ?? "WAIT"),
      sizeMultiplier: Number(ctx.sizeMultiplier ?? 1),
    };
  } catch {
    return FALLBACK_RISK;
  }
}

async function loadLearningSnapshot(): Promise<MorningLearningSnapshot> {
  try {
    const rows = await q<Omit<MorningLearningSnapshot, "briefFeedbackTotal" | "briefFeedbackByAction">>(`
      SELECT
        COUNT(*)::int AS "totalSignals",
        COUNT(*) FILTER (WHERE outcome != 'pending')::int AS labeled,
        COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending,
        ROUND((COUNT(*) FILTER (WHERE outcome = 'correct')::numeric / NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending'), 0)) * 100, 1)::float AS "accuracyRate"
      FROM ai_signal_log
      WHERE signal_at > NOW() - INTERVAL '30 days'
    `);
    const feedbackRows = await q<{ action: string; count: number }>(`
      SELECT action, COUNT(*)::int AS count
      FROM admin_morning_brief_feedback
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
    `).catch(() => []);
    const briefFeedbackByAction = Object.fromEntries(
      feedbackRows.map((row) => [row.action, Number(row.count ?? 0)]),
    );
    const briefFeedbackTotal = feedbackRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    return {
      ...(rows[0] ?? FALLBACK_LEARNING),
      briefFeedbackTotal,
      briefFeedbackByAction,
    };
  } catch {
    return FALLBACK_LEARNING;
  }
}

async function loadCatalysts(symbols: string[]): Promise<MorningCatalyst[]> {
  try {
    const rows = await q<any>(`
      SELECT ticker, source, headline, url, catalyst_type, catalyst_subtype, event_timestamp_et
      FROM catalyst_events
      WHERE event_timestamp_utc >= NOW() - INTERVAL '36 hours'
        AND ticker = ANY($1::text[])
      ORDER BY event_timestamp_et DESC
      LIMIT 20
    `, [symbols]);
    return rows.map((row) => ({
      ticker: row.ticker,
      source: row.source,
      headline: row.headline,
      url: row.url,
      catalystType: row.catalyst_type,
      catalystSubtype: row.catalyst_subtype,
      eventTimestampEt: row.event_timestamp_et,
    }));
  } catch {
    return [];
  }
}

function resolveDeskState(
  risk: MorningRiskState,
  health: SystemHealth,
  topPlays: ScannerHit[],
  watchlist: ScannerHit[],
): DeskState {
  if (risk.killSwitchActive || risk.dailyDrawdown >= 0.04 || health.errorsCount && health.errorsCount > 3) return "BLOCK";
  if (risk.correlationRisk >= 0.65 || risk.dailyDrawdown >= 0.02) return "DEFENSIVE";
  if (topPlays.length > 0) return "TRADE";
  if (watchlist.length > 0) return "WAIT";
  return "WAIT";
}

function buildHeadline(state: DeskState, topPlays: ScannerHit[], catalysts: MorningCatalyst[]): string {
  if (state === "BLOCK") return "Risk is blocking new action this morning";
  if (state === "DEFENSIVE") return "Defensive session: only clean triggers deserve attention";
  if (topPlays.length > 0) return `${topPlays.length} live play candidate${topPlays.length === 1 ? "" : "s"} on deck`;
  if (catalysts.length > 0) return "Catalysts are active, but scanner wants patience";
  return "No forced trades: wait for the market to show its hand";
}

function buildOperatorNote(
  state: DeskState,
  topPlays: ScannerHit[],
  watchlist: ScannerHit[],
  risk: MorningRiskState,
  learning: MorningLearningSnapshot,
): string {
  const learningText = learning.accuracyRate == null
    ? "Learning sample is still building."
    : `Recent signal accuracy is ${learning.accuracyRate.toFixed(1)}%.`;
  if (state === "BLOCK") return `Stand down until risk clears. Drawdown ${(risk.dailyDrawdown * 100).toFixed(1)}%, correlation ${(risk.correlationRisk * 100).toFixed(0)}%. ${learningText}`;
  if (state === "DEFENSIVE") return `Trade smaller, require clean trigger confirmation, and avoid correlated exposure. ${learningText}`;
  if (topPlays.length > 0) return `Start with ${topPlays[0].symbol}; confirm trigger, invalidation, and catalyst risk before taking any exposure. ${learningText}`;
  if (watchlist.length > 0) return `${watchlist.length} setups are worth watching, but none are green-lit yet. ${learningText}`;
  return `No high-quality setup is ready. Protect attention and wait for better structure. ${learningText}`;
}

function playRow(play: ScannerHit, appUrl: string) {
  const href = `${appUrl}/admin/terminal/${encodeURIComponent(play.symbol)}`;
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #263244;">
        <a href="${href}" style="color:#f8fafc;text-decoration:none;font-weight:800;">${escapeHtml(play.symbol)}</a>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(String(play.playbook ?? "No playbook"))}</div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(play.bias)} / ${escapeHtml(String(play.regime))}</td>
      <td style="padding:12px 0;border-bottom:1px solid #263244;color:#10b981;text-align:right;font-weight:800;">${play.confidence}%</td>
    </tr>`;
}

function section(title: string, content: string) {
  return `
    <div style="margin:18px 0;padding:16px;background:#0f172a;border:1px solid #233044;border-radius:10px;">
      <div style="color:#f8fafc;font-size:15px;font-weight:800;margin-bottom:8px;">${escapeHtml(title)}</div>
      ${content}
    </div>`;
}

function statCell(label: string, value: string) {
  return `
    <td style="background:#0f172a;border:1px solid #233044;border-radius:10px;padding:12px;">
      <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;">${escapeHtml(label)}</div>
      <div style="color:#f8fafc;font-size:18px;font-weight:900;margin-top:4px;">${escapeHtml(value)}</div>
    </td>`;
}

function emptyRow(message: string, colSpan = 1) {
  return `<tr><td colspan="${colSpan}" style="padding:12px 0;color:#94a3b8;">${escapeHtml(message)}</td></tr>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}