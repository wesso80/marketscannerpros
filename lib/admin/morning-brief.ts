import { q } from "@/lib/db";
import { runScan } from "@/lib/operator/orchestrator";
import type { ScanContext } from "@/lib/operator/orchestrator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { scanResultToHealth, scanResultToHits } from "@/lib/admin/serializer";
import type { ScannerHit, SystemHealth } from "@/lib/admin/types";
import type { Market } from "@/types/operator";
import { DEFAULT_WATCHLISTS } from "@/lib/operator/watchlists";
import { enrichHitsWithExpectancy } from "@/lib/admin/expectancy";

export type DeskState = "TRADE" | "WAIT" | "DEFENSIVE" | "BLOCK";

export type MorningCatalyst = {
  ticker: string;
  source: string;
  headline: string;
  url?: string | null;
  catalystType?: string | null;
  catalystSubtype?: string | null;
  eventTimestampEt?: string | null;
  severity?: string | null;
  confidence?: number | null;
  impactScore: number;
  impactLabel: "LOW" | "MED" | "HIGH" | "CRITICAL";
  impactReason: string;
};

export type MorningRiskState = {
  openExposure: number;
  openRiskUsd: number;
  exposureUsd: number;
  equity: number;
  dailyPnl: number;
  dailyDrawdown: number;
  correlationRisk: number;
  maxPositions: number;
  activePositions: number;
  killSwitchActive: boolean;
  permission: string;
  sizeMultiplier: number;
  source: "portfolio_journal" | "operator_state" | "fallback";
  workspaceId?: string | null;
  lastUpdatedAt?: string | null;
  notes: string[];
};

export type MorningLearningSnapshot = {
  totalSignals: number;
  labeled: number;
  pending: number;
  accuracyRate: number | null;
  briefFeedbackTotal: number;
  briefFeedbackByAction: Record<string, number>;
  feedbackInsights: MorningFeedbackInsight[];
  playbookScorecard: MorningPlaybookScorecard;
  playbookEvolution: MorningPlaybookEvolution;
};

export type MorningPlaybookEvolution = {
  promotedPlaybooks: MorningScorecardItem[];
  demotedPlaybooks: MorningScorecardItem[];
  boostedSymbols: MorningScorecardItem[];
  suppressedSymbols: MorningScorecardItem[];
  rules: string[];
};

export type MorningSessionScoreReport = {
  reviewDate: string;
  feedbackCount: number;
  worked: number;
  failed: number;
  missed: number;
  ruleBreaks: number;
  closedTrades: number;
  totalPl: number;
  totalR: number;
  winRate: number | null;
  disciplineScore: number;
  executionScore: number;
  summary: string;
  bestSymbol: string | null;
  weakestSymbol: string | null;
};

export type MorningFeedbackInsight = {
  label: string;
  metric: string;
  note: string;
  tone: "green" | "yellow" | "red" | "blue" | "neutral";
};

export type MorningScorecardItem = {
  key: string;
  positive: number;
  caution: number;
  score: number;
  note: string;
};

export type MorningPlaybookScorecard = {
  bestSymbols: MorningScorecardItem[];
  cautionSymbols: MorningScorecardItem[];
  bestPlaybooks: MorningScorecardItem[];
  missedSetups: MorningScorecardItem[];
  ruleBreaks: MorningScorecardItem[];
};

export type MorningBriefHistoryItem = {
  briefId: string;
  generatedAt: string;
  deskState: DeskState;
  headline: string;
  topPlayCount: number;
  catalystCount: number;
};

export type MorningBriefComparison = {
  previousBriefId: string | null;
  previousGeneratedAt: string | null;
  deskStateChanged: boolean;
  previousDeskState: DeskState | null;
  newTopPlays: string[];
  droppedTopPlays: string[];
  retainedTopPlays: string[];
  newCatalystSymbols: string[];
  summary: string;
};

export type MorningExecutionChecklistItem = {
  label: string;
  status: "PASS" | "WAIT" | "BLOCK" | "INFO";
  instruction: string;
};

export type MorningExecutionChecklist = {
  mode: DeskState;
  allowedSetups: string[];
  blockedConditions: string[];
  firstAction: string;
  invalidationRule: string;
  sizingRule: string;
  checklist: MorningExecutionChecklistItem[];
};

export type MorningOutcomeGrade = {
  briefId: string | null;
  gradedAt: string;
  generatedAt: string | null;
  totalPlays: number;
  worked: number;
  failed: number;
  missed: number;
  invalidated: number;
  unreviewed: number;
  closedTrades: number;
  totalPl: number;
  totalR: number;
  grade: "A" | "B" | "C" | "D" | "INC";
  summary: string;
  plays: Array<{
    symbol: string;
    action: string | null;
    pl: number;
    r: number;
    verdict: "worked" | "failed" | "missed" | "invalidated" | "unreviewed";
    note: string;
  }>;
};

export type MorningExpectancyItem = {
  key: string;
  sample: number;
  winRate: number | null;
  avgR: number;
  totalR: number;
  profitFactor: number | null;
  note: string;
};

export type MorningExpectancyDashboard = {
  generatedAt: string;
  sampleTrades: number;
  bestSymbols: MorningExpectancyItem[];
  weakestSymbols: MorningExpectancyItem[];
  bestPlaybooks: MorningExpectancyItem[];
  weakestPlaybooks: MorningExpectancyItem[];
  notes: string[];
};

export type MorningRiskGovernor = {
  mode: "NORMAL" | "THROTTLED" | "DEFENSIVE" | "LOCKED";
  maxTradesToday: number;
  tradesUsedToday: number;
  remainingTrades: number;
  maxRiskPerTradePct: number;
  maxRiskPerTradeUsd: number;
  dailyStopUsd: number;
  portfolioHeatLimitUsd: number;
  currentHeatUsd: number;
  lockouts: string[];
  instructions: string[];
};

export type MorningScenarioTree = {
  symbol: string;
  bias: string;
  baseCase: string;
  bullishPath: string;
  bearishPath: string;
  chopPath: string;
  confirmation: string;
  invalidation: string;
  riskAdjustment: string;
};

export type MorningCommanderView = {
  permission: string;
  primaryAction: string;
  topSymbols: string[];
  maxRiskLine: string;
  scenarioFocus: string;
  reviewFocus: string;
  blocks: string[];
};

export type MorningUniverseSource = {
  source: string;
  count: number;
  sample: string[];
};

export type MorningUniverseMeta = {
  mode: "custom" | "dynamic";
  totalCandidates: number;
  scannedCount: number;
  scanLimit: number;
  symbols: string[];
  sources: MorningUniverseSource[];
  workerStatus: MorningWorkerStatus;
  note: string;
};

export type MorningWorkerStatus = {
  lastWorkerRunAt: string | null;
  lastWorkerName: string | null;
  lastWorkerStatus: string | null;
  lastWorkerErrors: number;
  latestQuoteAt: string | null;
  latestIndicatorAt: string | null;
  latestScannerCacheAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
  note: string;
};

export type MorningBrief = {
  briefId: string;
  generatedAt: string;
  market: Market;
  timeframe: string;
  deskState: DeskState;
  headline: string;
  operatorNote: string;
  topPlays: ScannerHit[];
  watchlist: ScannerHit[];
  researchSetups: ScannerHit[];
  avoidList: ScannerHit[];
  catalysts: MorningCatalyst[];
  risk: MorningRiskState;
  learning: MorningLearningSnapshot;
  sessionScore: MorningSessionScoreReport;
  health: SystemHealth;
  universe: MorningUniverseMeta;
  recentBriefs: MorningBriefHistoryItem[];
  comparison: MorningBriefComparison;
  executionChecklist: MorningExecutionChecklist;
  outcomeGrade: MorningOutcomeGrade;
  expectancy: MorningExpectancyDashboard;
  riskGovernor: MorningRiskGovernor;
  scenarioTree: MorningScenarioTree[];
  commander: MorningCommanderView;
  nextImprovements: string[];
};

export type MorningTradePlan = {
  planId: string;
  createdAt: string;
  briefId: string;
  symbol: string;
  market: Market;
  timeframe: string;
  bias: string;
  permission: string;
  confidence: number;
  playbook: string;
  entryTrigger: string;
  invalidation: string;
  sizing: string;
  riskNotes: string[];
  catalystWarnings: string[];
  checklist: MorningExecutionChecklistItem[];
  reviewPrompt: string;
};

export type MorningOpenRescore = {
  generatedAt: string;
  headline: string;
  previousDeskState: DeskState;
  currentDeskState: DeskState;
  promoted: string[];
  demoted: string[];
  stillValid: string[];
  summary: string;
  brief: MorningBrief;
};

export type MorningBrokerFillSyncReport = {
  generatedAt: string;
  workspaceId: string | null;
  source: "journal_broker_fields" | "portfolio_journal" | "unavailable";
  brokerLinked: boolean;
  brokerTaggedTrades: number;
  openBrokerTaggedTrades: number;
  portfolioPositions: number;
  unmatchedOpenTrades: number;
  totalBrokerTaggedPl: number;
  notes: string[];
};

export type MorningDailyReview = {
  generatedAt: string;
  reviewDate: string;
  sessionScore: MorningSessionScoreReport;
  risk: MorningRiskState;
  outcomeGrade: MorningOutcomeGrade;
  expectancy: MorningExpectancyDashboard;
  riskGovernor: MorningRiskGovernor;
  feedbackByAction: Record<string, number>;
  recentBriefs: MorningBriefHistoryItem[];
  brokerSync: MorningBrokerFillSyncReport;
  lessons: string[];
};

const DEFAULT_SYMBOLS_BY_MARKET: Record<string, string[]> = {
  CRYPTO: ["BTC", "ETH", "SOL", "XRP", "ADA", "AVAX", "DOGE", "LINK", "DOT", "MATIC", "SUI", "FET", "RNDR", "INJ", "NEAR", "AAVE"],
  EQUITIES: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "AMD", "PLTR", "COIN", "MSTR", "AVGO", "JPM", "LLY", "UNH", "NFLX"],
  FOREX: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF", "EURGBP"],
};
const DEFAULT_SCAN_LIMIT = 50;
const MAX_SCAN_LIMIT = 80;
const STABLE_CRYPTO_SYMBOLS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "BUSD"]);
const AV_CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "TRX", "LINK",
  "DOT", "MATIC", "SHIB", "LTC", "BCH", "UNI", "XLM", "NEAR", "ATOM", "XMR",
  "ETC", "APT", "ARB", "OP", "FIL", "VET", "HBAR", "INJ", "AAVE", "GRT",
  "ALGO", "FTM", "SAND", "MANA", "AXS", "THETA", "XTZ", "EOS", "FLOW", "CHZ",
  "CRV", "LDO", "MKR", "SNX", "COMP", "SUSHI", "YFI", "BAL", "ENS", "LRC",
  "IMX", "FET", "RNDR", "OCEAN", "AGIX", "TAO", "WLD", "SEI", "SUI", "TIA",
  "PYTH", "JUP", "BONK", "PEPE", "FLOKI", "GALA", "ENJ", "GMT", "RAY", "ORCA",
  "JTO", "ZRO", "STRK", "ZK", "KAS",
]);

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
  openRiskUsd: 0,
  exposureUsd: 0,
  equity: 100000,
  dailyPnl: 0,
  dailyDrawdown: 0,
  correlationRisk: 0,
  maxPositions: 10,
  activePositions: 0,
  killSwitchActive: false,
  permission: "WAIT",
  sizeMultiplier: 1,
  source: "fallback",
  workspaceId: null,
  lastUpdatedAt: null,
  notes: ["No live portfolio or operator risk state found; using conservative fallback."],
};

const FALLBACK_LEARNING: MorningLearningSnapshot = {
  totalSignals: 0,
  labeled: 0,
  pending: 0,
  accuracyRate: null,
  briefFeedbackTotal: 0,
  briefFeedbackByAction: {},
  feedbackInsights: [],
  playbookScorecard: {
    bestSymbols: [],
    cautionSymbols: [],
    bestPlaybooks: [],
    missedSetups: [],
    ruleBreaks: [],
  },
  playbookEvolution: {
    promotedPlaybooks: [],
    demotedPlaybooks: [],
    boostedSymbols: [],
    suppressedSymbols: [],
    rules: ["No feedback sample yet; rank from scanner evidence first."],
  },
};

export async function buildMorningBrief(options: {
  symbols?: string[];
  market?: Market;
  timeframe?: string;
  scanLimit?: number;
} = {}): Promise<MorningBrief> {
  const market = options.market ?? "CRYPTO";
  const timeframe = options.timeframe ?? "15m";
  const scanLimit = clampScanLimit(options.scanLimit);
  const generatedAt = new Date().toISOString();
  const briefId = `${sydneyDateKey(generatedAt)}:${market}:${timeframe}`;

  const [risk, learning, recentBriefs, sessionScore, expectancy, outcomeGrade] = await Promise.all([
    loadRiskState(),
    loadLearningSnapshot(),
    loadRecentBriefs(),
    loadSessionScoreReport(),
    loadExpectancyDashboard(),
    buildPreviousBriefOutcomeGrade(),
  ]);
  const universe = options.symbols?.length
    ? buildCustomUniverse(options.symbols, market, scanLimit)
    : await buildMorningUniverse(market, learning, scanLimit);
  const symbols = universe.symbols;

  const context: ScanContext = {
    ...DEFAULT_CONTEXT,
    portfolioState: {
      ...DEFAULT_CONTEXT.portfolioState,
      equity: risk.equity,
      dailyPnl: risk.dailyPnl,
      openRisk: risk.openExposure,
      drawdownPct: risk.dailyDrawdown,
      correlationRisk: risk.correlationRisk,
      activePositions: risk.activePositions,
      killSwitchActive: risk.killSwitchActive,
    },
  };

  const scan = await runScan({ symbols, market, timeframe }, context, alphaVantageProvider);
  const hits = await enrichHitsWithExpectancy(scanResultToHits(scan).map((hit) => ({ ...hit, riskSource: risk.source })));
  const health = scanResultToHealth(scan, true);
  const catalysts = await loadCatalysts(symbols, hits);
  const rankedHits = rankHitsWithLearning(hits, learning, catalysts);

  const topPlays = rankedHits.filter((hit) => hit.permission === "GO").slice(0, 5);
  const watchlist = rankedHits.filter((hit) => hit.permission === "WAIT").slice(0, 8);
  const avoidList = rankedHits.filter((hit) => hit.permission === "BLOCK").slice(0, 6);
  const researchSetups = buildResearchSetups(rankedHits, topPlays, watchlist, risk);
  const deskState = resolveDeskState(risk, health, topPlays, watchlist);
  const comparison = await buildBriefComparison(briefId, market, timeframe, deskState, topPlays, catalysts);
  const executionChecklist = buildExecutionChecklist(deskState, topPlays, watchlist.length ? watchlist : researchSetups, catalysts, risk, learning, comparison);
  const riskGovernor = buildMorningRiskGovernor(risk, sessionScore, expectancy);
  const scenarioTree = buildScenarioTree(topPlays, watchlist, researchSetups, catalysts, riskGovernor, expectancy);
  const commander = buildCommanderView(deskState, risk, topPlays, researchSetups, executionChecklist, riskGovernor, outcomeGrade, scenarioTree);

  return {
    briefId,
    generatedAt,
    market,
    timeframe,
    deskState,
    headline: buildHeadline(deskState, topPlays, catalysts),
    operatorNote: buildOperatorNote(deskState, topPlays, watchlist, risk, learning),
    topPlays,
    watchlist,
    researchSetups,
    avoidList,
    catalysts,
    risk,
    learning,
    sessionScore,
    health,
    universe,
    recentBriefs,
    comparison,
    executionChecklist,
    outcomeGrade,
    expectancy,
    riskGovernor,
    scenarioTree,
    commander,
    nextImprovements: [
      "Use the commander view first; it compresses permission, top candidates, risk limits, and review focus into one trading screen.",
      "Let the auto-grade compare yesterday's brief with journal outcomes before trusting repeated symbols today.",
      "Build expectancy sample size by keeping playbook tags clean on closed journal trades.",
    ],
  };
}

export async function saveMorningBriefSnapshot(brief: MorningBrief, source: "admin" | "email" | "cron" = "admin") {
  try {
    await ensureMorningBriefTables();
    await q(
      `INSERT INTO admin_morning_briefs (
        brief_id, generated_at, market, timeframe, desk_state, headline,
        top_play_count, watch_count, avoid_count, catalyst_count, source, snapshot, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW())
       ON CONFLICT (brief_id) DO UPDATE SET
        generated_at = EXCLUDED.generated_at,
        market = EXCLUDED.market,
        timeframe = EXCLUDED.timeframe,
        desk_state = EXCLUDED.desk_state,
        headline = EXCLUDED.headline,
        top_play_count = EXCLUDED.top_play_count,
        watch_count = EXCLUDED.watch_count,
        avoid_count = EXCLUDED.avoid_count,
        catalyst_count = EXCLUDED.catalyst_count,
        source = CASE
          WHEN admin_morning_briefs.source IN ('cron', 'email') AND EXCLUDED.source = 'admin' THEN admin_morning_briefs.source
          ELSE EXCLUDED.source
        END,
        snapshot = EXCLUDED.snapshot,
        updated_at = NOW()`,
      [
        brief.briefId,
        brief.generatedAt,
        brief.market,
        brief.timeframe,
        brief.deskState,
        brief.headline,
        brief.topPlays.length,
        brief.watchlist.length,
        brief.avoidList.length,
        brief.catalysts.length,
        source,
        JSON.stringify(brief),
      ],
    );
  } catch (error) {
    console.warn("[morning-brief] Snapshot save failed:", error);
  }
}

export async function buildMorningTradePlan(brief: MorningBrief, play: ScannerHit): Promise<MorningTradePlan> {
  const createdAt = new Date().toISOString();
  const symbolCatalysts = brief.catalysts.filter((event) => event.ticker === play.symbol);
  const highImpactCatalysts = symbolCatalysts.filter((event) => event.impactLabel === "HIGH" || event.impactLabel === "CRITICAL");
  const riskNotes = [
    `Desk state ${brief.deskState}; risk permission ${brief.risk.permission}; size multiplier ${brief.risk.sizeMultiplier.toFixed(2)}x.`,
    `Open risk ${formatUsd(brief.risk.openRiskUsd)} on ${formatUsd(brief.risk.equity)} equity; daily P&L ${formatUsd(brief.risk.dailyPnl)}.`,
  ];
  if (brief.risk.killSwitchActive) riskNotes.unshift("Kill switch active. Plan is review-only until risk permission resets.");
  if (brief.risk.correlationRisk >= 0.65) riskNotes.push("Correlation is elevated; reduce size or wait for exposure to compress.");

  return {
    planId: `mbp_${brief.briefId.replace(/[^A-Za-z0-9]/g, "_")}_${play.symbol}`,
    createdAt,
    briefId: brief.briefId,
    symbol: play.symbol,
    market: brief.market,
    timeframe: brief.timeframe,
    bias: play.bias,
    permission: play.permission,
    confidence: play.confidence,
    playbook: play.playbook || play.regime || "Unclassified",
    entryTrigger: buildTradePlanEntryTrigger(play, brief),
    invalidation: buildTradePlanInvalidation(play, highImpactCatalysts),
    sizing: buildTradePlanSizing(brief, play, highImpactCatalysts),
    riskNotes,
    catalystWarnings: symbolCatalysts.length
      ? symbolCatalysts.map((event) => `${event.impactLabel} ${event.impactScore}: ${event.headline}`)
      : ["No fresh scanned catalyst attached to this symbol."],
    checklist: [
      { label: "Risk", status: brief.risk.killSwitchActive ? "BLOCK" : "PASS", instruction: brief.risk.killSwitchActive ? "Do not trade while kill switch is active." : "Confirm size before entry." },
      { label: "Trigger", status: play.permission === "GO" ? "PASS" : "WAIT", instruction: play.permission === "GO" ? "Use planned trigger only; no late chase." : "Wait for permission to clear before action." },
      { label: "Catalyst", status: highImpactCatalysts.length ? "WAIT" : "PASS", instruction: highImpactCatalysts.length ? "Review high-impact catalyst before committing size." : "No high-impact catalyst conflict found." },
      { label: "Review", status: "INFO", instruction: "After the session, label worked, failed, missed, invalidated, or rule broken." },
    ],
    reviewPrompt: `After trading ${play.symbol}, record whether the ${play.playbook || play.regime} plan worked, failed, was missed, or involved a rule break.`,
  };
}

export async function saveMorningTradePlan(plan: MorningTradePlan) {
  await ensureMorningActionTables();
  await q(
    `INSERT INTO admin_morning_trade_plans (plan_id, brief_id, symbol, market, timeframe, bias, permission, confidence, playbook, plan, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW())
     ON CONFLICT (plan_id) DO UPDATE SET
      brief_id = EXCLUDED.brief_id,
      symbol = EXCLUDED.symbol,
      market = EXCLUDED.market,
      timeframe = EXCLUDED.timeframe,
      bias = EXCLUDED.bias,
      permission = EXCLUDED.permission,
      confidence = EXCLUDED.confidence,
      playbook = EXCLUDED.playbook,
      plan = EXCLUDED.plan,
      updated_at = NOW()`,
    [plan.planId, plan.briefId, plan.symbol, plan.market, plan.timeframe, plan.bias, plan.permission, plan.confidence, plan.playbook, JSON.stringify(plan)],
  );
}

export async function buildOpenRescore(brief: MorningBrief): Promise<MorningOpenRescore> {
  const symbols = uniqueSymbols([
    ...brief.topPlays.map((play) => play.symbol),
    ...brief.watchlist.map((play) => play.symbol),
    ...brief.universe.symbols.slice(0, 20),
  ], brief.market).slice(0, 30);
  const rescored = await buildMorningBrief({ symbols, market: brief.market, timeframe: "5m", scanLimit: Math.max(10, symbols.length) });
  const previousTop = new Set(brief.topPlays.map((play) => play.symbol));
  const currentTop = new Set(rescored.topPlays.map((play) => play.symbol));
  const promoted = [...currentTop].filter((symbol) => !previousTop.has(symbol));
  const demoted = [...previousTop].filter((symbol) => !currentTop.has(symbol));
  const stillValid = [...currentTop].filter((symbol) => previousTop.has(symbol));
  const stateChanged = brief.deskState !== rescored.deskState;
  return {
    generatedAt: new Date().toISOString(),
    headline: `Open re-score: ${rescored.deskState} with ${rescored.topPlays.length} GO candidate${rescored.topPlays.length === 1 ? "" : "s"}.`,
    previousDeskState: brief.deskState,
    currentDeskState: rescored.deskState,
    promoted,
    demoted,
    stillValid,
    summary: [
      stateChanged ? `Desk shifted from ${brief.deskState} to ${rescored.deskState}.` : `Desk stayed ${rescored.deskState}.`,
      promoted.length ? `New at-open candidates: ${promoted.join(", ")}.` : "No new at-open candidates.",
      demoted.length ? `Dropped from pre-market top plays: ${demoted.join(", ")}.` : "No pre-market top plays dropped.",
    ].join(" "),
    brief: rescored,
  };
}

export async function buildBrokerFillSyncReport(): Promise<MorningBrokerFillSyncReport> {
  const generatedAt = new Date().toISOString();
  const workspaceId = await resolveOperatorWorkspaceId();
  if (!workspaceId) {
    return {
      generatedAt,
      workspaceId: null,
      source: "unavailable",
      brokerLinked: false,
      brokerTaggedTrades: 0,
      openBrokerTaggedTrades: 0,
      portfolioPositions: 0,
      unmatchedOpenTrades: 0,
      totalBrokerTaggedPl: 0,
      notes: ["No operator workspace found, so broker/fill reconciliation could not run."],
    };
  }

  try {
    const [brokerRows, positionRows, unmatchedRows] = await Promise.all([
      q<{ broker_tagged: number; open_broker_tagged: number; total_pl: string | null }>(`
        SELECT
          COUNT(*) FILTER (WHERE broker_order_id IS NOT NULL OR execution_mode = 'LIVE' OR close_source = 'broker')::int AS broker_tagged,
          COUNT(*) FILTER (WHERE is_open = TRUE AND (broker_order_id IS NOT NULL OR execution_mode = 'LIVE'))::int AS open_broker_tagged,
          COALESCE(SUM(pl::numeric) FILTER (WHERE broker_order_id IS NOT NULL OR execution_mode = 'LIVE' OR close_source = 'broker'), 0)::text AS total_pl
        FROM journal_entries
        WHERE workspace_id = $1
      `, [workspaceId]).catch(() => []),
      q<{ positions: number }>(`
        SELECT COUNT(*)::int AS positions
        FROM portfolio_positions
        WHERE workspace_id = $1
      `, [workspaceId]).catch(() => []),
      q<{ unmatched: number }>(`
        SELECT COUNT(*)::int AS unmatched
        FROM journal_entries j
        WHERE j.workspace_id = $1
          AND j.is_open = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM portfolio_positions p
            WHERE p.workspace_id = j.workspace_id AND UPPER(p.symbol) = UPPER(j.symbol)
          )
      `, [workspaceId]).catch(() => []),
    ]);
    const broker = brokerRows[0];
    const positions = Number(positionRows[0]?.positions ?? 0);
    const brokerTaggedTrades = Number(broker?.broker_tagged ?? 0);
    const openBrokerTaggedTrades = Number(broker?.open_broker_tagged ?? 0);
    const unmatchedOpenTrades = Number(unmatchedRows[0]?.unmatched ?? 0);
    const report: MorningBrokerFillSyncReport = {
      generatedAt,
      workspaceId,
      source: brokerTaggedTrades > 0 ? "journal_broker_fields" : "portfolio_journal",
      brokerLinked: brokerTaggedTrades > 0,
      brokerTaggedTrades,
      openBrokerTaggedTrades,
      portfolioPositions: positions,
      unmatchedOpenTrades,
      totalBrokerTaggedPl: Number(broker?.total_pl ?? 0),
      notes: [
        brokerTaggedTrades > 0 ? `${brokerTaggedTrades} journal trade${brokerTaggedTrades === 1 ? "" : "s"} include broker/live fill markers.` : "No broker-tagged fills found yet; using portfolio/journal reconciliation.",
        `${positions} portfolio position${positions === 1 ? "" : "s"}; ${unmatchedOpenTrades} open journal trade${unmatchedOpenTrades === 1 ? "" : "s"} without matching portfolio position.`,
      ],
    };
    await ensureMorningActionTables();
    await q(
      `INSERT INTO admin_broker_fill_sync_runs (workspace_id, source, broker_linked, broker_tagged_trades, open_broker_tagged_trades, portfolio_positions, unmatched_open_trades, total_broker_tagged_pl, report)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [workspaceId, report.source, report.brokerLinked, report.brokerTaggedTrades, report.openBrokerTaggedTrades, report.portfolioPositions, report.unmatchedOpenTrades, report.totalBrokerTaggedPl, JSON.stringify(report)],
    );
    return report;
  } catch (error) {
    return {
      generatedAt,
      workspaceId,
      source: "unavailable",
      brokerLinked: false,
      brokerTaggedTrades: 0,
      openBrokerTaggedTrades: 0,
      portfolioPositions: 0,
      unmatchedOpenTrades: 0,
      totalBrokerTaggedPl: 0,
      notes: [`Broker/fill reconciliation failed: ${error instanceof Error ? error.message : "unknown error"}.`],
    };
  }
}

export async function buildDailyReview(): Promise<MorningDailyReview> {
  const [sessionScore, risk, learning, recentBriefs, brokerSync, outcomeGrade, expectancy] = await Promise.all([
    loadSessionScoreReport(),
    loadRiskState(),
    loadLearningSnapshot(),
    loadRecentBriefs(),
    buildBrokerFillSyncReport(),
    buildPreviousBriefOutcomeGrade(),
    loadExpectancyDashboard(),
  ]);
  const riskGovernor = buildMorningRiskGovernor(risk, sessionScore, expectancy);
  const lessons = buildDailyReviewLessons(sessionScore, risk, learning, brokerSync);
  return {
    generatedAt: new Date().toISOString(),
    reviewDate: sessionScore.reviewDate,
    sessionScore,
    risk,
    outcomeGrade,
    expectancy,
    riskGovernor,
    feedbackByAction: learning.briefFeedbackByAction,
    recentBriefs,
    brokerSync,
    lessons,
  };
}

export function renderDailyReviewEmail(review: MorningDailyReview): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.marketscannerpros.app";
  const feedbackRows = Object.entries(review.feedbackByAction).length
    ? Object.entries(review.feedbackByAction).map(([action, count]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(action.replace("_", " "))}</td><td style="padding:8px 0;border-bottom:1px solid #263244;color:#f8fafc;text-align:right;font-weight:800;">${count}</td></tr>`).join("")
    : emptyRow("No review labels recorded yet.", 2);
  const lessonRows = review.lessons.map((lesson) => `<li style="margin:0 0 8px;color:#cbd5e1;line-height:1.55;">${escapeHtml(lesson)}</li>`).join("");
  return `
<!DOCTYPE html>
<html><body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
  <div style="max-width:760px;margin:0 auto;background:#111827;border:1px solid #263244;border-radius:14px;padding:24px;">
    <div style="color:#10b981;font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:900;">MSP Daily Trading Review</div>
    <h1 style="margin:10px 0 8px;color:#f8fafc;font-size:28px;">Execution ${review.sessionScore.executionScore}/100 · Discipline ${review.sessionScore.disciplineScore}/100</h1>
    <p style="margin:0 0 18px;color:#94a3b8;line-height:1.55;">${escapeHtml(review.sessionScore.summary)}</p>
    ${section("Session Score", `<table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Closed P&L", formatUsd(review.sessionScore.totalPl))}${miniCell("Total R", review.sessionScore.totalR.toFixed(2))}${miniCell("Worked / Failed", `${review.sessionScore.worked}/${review.sessionScore.failed}`)}${miniCell("Missed / Rules", `${review.sessionScore.missed}/${review.sessionScore.ruleBreaks}`)}</tr></table>`)}
    ${section("Brief Auto-Grade", `<p style="margin:0 0 10px;color:#cbd5e1;line-height:1.55;">${escapeHtml(review.outcomeGrade.summary)}</p><table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Grade", review.outcomeGrade.grade)}${miniCell("Brief R", review.outcomeGrade.totalR.toFixed(2))}${miniCell("Brief P&L", formatUsd(review.outcomeGrade.totalPl))}${miniCell("Unreviewed", String(review.outcomeGrade.unreviewed))}</tr></table>`)}
    ${section("Tomorrow Risk Governor", `<table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Mode", review.riskGovernor.mode)}${miniCell("Trades Left", `${review.riskGovernor.remainingTrades}/${review.riskGovernor.maxTradesToday}`)}${miniCell("Risk / Idea", formatUsd(review.riskGovernor.maxRiskPerTradeUsd))}${miniCell("Heat", `${formatUsd(review.riskGovernor.currentHeatUsd)} / ${formatUsd(review.riskGovernor.portfolioHeatLimitUsd)}`)}</tr></table>`)}
    ${section("Expectancy", `<p style="margin:0;color:#cbd5e1;line-height:1.55;">${escapeHtml(review.expectancy.notes.join(" "))}</p>`)}
    ${section("Risk Close", `<table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Equity", formatUsd(review.risk.equity))}${miniCell("Daily P&L", formatUsd(review.risk.dailyPnl))}${miniCell("Open Risk", formatUsd(review.risk.openRiskUsd))}${miniCell("Source", review.risk.source.replace("_", " ").toUpperCase())}</tr></table>`)}
    ${section("Fill Sync", `<p style="margin:0 0 10px;color:#cbd5e1;line-height:1.55;">${escapeHtml(review.brokerSync.notes.join(" "))}</p><table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Broker Tagged", String(review.brokerSync.brokerTaggedTrades))}${miniCell("Open Tagged", String(review.brokerSync.openBrokerTaggedTrades))}${miniCell("Portfolio Positions", String(review.brokerSync.portfolioPositions))}${miniCell("Unmatched", String(review.brokerSync.unmatchedOpenTrades))}</tr></table>`)}
    ${section("Feedback Labels", `<table style="width:100%;border-collapse:collapse;">${feedbackRows}</table>`)}
    ${section("Tomorrow's Adjustments", `<ul style="padding-left:18px;margin:0;">${lessonRows}</ul>`)}
    <div style="text-align:center;margin-top:24px;"><a href="${appUrl}/admin/morning-brief" style="display:inline-block;background:#10b981;color:#07111f;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:900;">Open Morning Brief</a></div>
  </div>
</body></html>`;
}

export function renderMorningBriefEmail(brief: MorningBrief): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.marketscannerpros.app";
  const topRows = brief.topPlays.length > 0
    ? brief.topPlays.map((play) => playRow(play, appUrl)).join("")
    : emptyRow("No GO candidates. Stand down or wait for triggers.");
  const watchRows = brief.watchlist.length > 0
    ? brief.watchlist.slice(0, 5).map((play) => playRow(play, appUrl)).join("")
    : emptyRow("No watchlist candidates worth forcing.");
  const researchRows = brief.researchSetups.length > 0
    ? brief.researchSetups.slice(0, 6).map((play) => playRow(play, appUrl)).join("")
    : emptyRow("No research-only setups found while risk is locked.");
  const catalystRows = brief.catalysts.length > 0
    ? brief.catalysts.slice(0, 8).map((event) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:#e2e8f0;font-weight:700;">${escapeHtml(event.ticker)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(event.headline)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #263244;color:${event.impactLabel === "CRITICAL" || event.impactLabel === "HIGH" ? "#f87171" : event.impactLabel === "MED" ? "#fbbf24" : "#94a3b8"};text-align:right;font-weight:800;">${escapeHtml(event.impactLabel)}</td>
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
          ${statCell("Scanned", `${brief.universe.scannedCount}/${brief.universe.totalCandidates}`)}
          ${statCell("Risk", brief.risk.killSwitchActive ? "Kill Active" : brief.risk.permission)}
          ${statCell("Score", `${brief.sessionScore.executionScore}/100`)}
        </tr>
      </table>

      ${section("Real Account Risk", `
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            ${miniCell("Equity", formatUsd(brief.risk.equity))}
            ${miniCell("Open Risk", `${formatUsd(brief.risk.openRiskUsd)} (${(brief.risk.openExposure * 100).toFixed(1)}%)`)}
            ${miniCell("Daily P&L", formatUsd(brief.risk.dailyPnl))}
            ${miniCell("Source", brief.risk.source.replace("_", " ").toUpperCase())}
          </tr>
        </table>
        <p style="margin:12px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">${escapeHtml(brief.risk.notes.slice(0, 2).join(" "))}</p>
      `)}

      ${section("Commander View", `
        <p style="margin:0 0 12px;color:#e2e8f0;font-size:14px;line-height:1.55;"><strong>Primary action:</strong> ${escapeHtml(brief.commander.primaryAction)}</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            ${miniCell("Permission", brief.commander.permission)}
            ${miniCell("Governor", brief.riskGovernor.mode)}
            ${miniCell("Risk Budget", brief.commander.maxRiskLine)}
            ${miniCell("Top Symbols", brief.commander.topSymbols.join(", ") || "None")}
          </tr>
        </table>
      `)}

      ${section("Yesterday Auto-Grade", `
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.55;">${escapeHtml(brief.outcomeGrade.summary)}</p>
        <table style="width:100%;border-collapse:collapse;"><tr>${miniCell("Grade", brief.outcomeGrade.grade)}${miniCell("Brief R", brief.outcomeGrade.totalR.toFixed(2))}${miniCell("Brief P&L", formatUsd(brief.outcomeGrade.totalPl))}${miniCell("Unreviewed", String(brief.outcomeGrade.unreviewed))}</tr></table>
      `)}

      ${section("Expectancy And Scenarios", `
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.55;">${escapeHtml(brief.expectancy.notes.join(" "))}</p>
        <table style="width:100%;border-collapse:collapse;">${brief.scenarioTree.slice(0, 3).map(scenarioRow).join("") || emptyRow("No scenario candidates yet.", 3)}</table>
      `)}

      ${section("Post-Session Score", `
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.55;">${escapeHtml(brief.sessionScore.summary)}</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            ${miniCell("Execution", `${brief.sessionScore.executionScore}/100`)}
            ${miniCell("Discipline", `${brief.sessionScore.disciplineScore}/100`)}
            ${miniCell("Closed P&L", formatUsd(brief.sessionScore.totalPl))}
            ${miniCell("Total R", brief.sessionScore.totalR.toFixed(2))}
          </tr>
        </table>
      `)}

      ${section("Overnight Universe", `
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.55;">${escapeHtml(brief.universe.note)}</p>
        <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.5;"><strong>Worker freshness:</strong> ${escapeHtml(brief.universe.workerStatus.freshness.toUpperCase())} - ${escapeHtml(brief.universe.workerStatus.note)}</p>
        <table style="width:100%;border-collapse:collapse;">${brief.universe.sources.slice(0, 6).map(universeSourceRow).join("")}</table>
      `)}
      ${section("What Changed", `
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.55;">${escapeHtml(brief.comparison.summary)}</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            ${miniCell("New", brief.comparison.newTopPlays.join(", ") || "None")}
            ${miniCell("Dropped", brief.comparison.droppedTopPlays.join(", ") || "None")}
            ${miniCell("Catalysts", brief.comparison.newCatalystSymbols.join(", ") || "None")}
          </tr>
        </table>
      `)}
      ${section("Pre-Market Execution Checklist", `
        <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;line-height:1.55;"><strong>First action:</strong> ${escapeHtml(brief.executionChecklist.firstAction)}</p>
        <p style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.55;"><strong>Sizing:</strong> ${escapeHtml(brief.executionChecklist.sizingRule)}</p>
        <p style="margin:0 0 14px;color:#cbd5e1;font-size:14px;line-height:1.55;"><strong>Invalidation:</strong> ${escapeHtml(brief.executionChecklist.invalidationRule)}</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
          <tr>
            ${miniCell("Allowed", brief.executionChecklist.allowedSetups.slice(0, 3).join(" | "))}
            ${miniCell("Blocked", brief.executionChecklist.blockedConditions.slice(0, 3).join(" | "))}
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">${brief.executionChecklist.checklist.map(checklistRow).join("")}</table>
      `)}
      ${section("Best Plays", `<table style="width:100%;border-collapse:collapse;">${topRows}</table>`)}
      ${section("Watch, Do Not Chase", `<table style="width:100%;border-collapse:collapse;">${watchRows}</table>`)}
      ${section("Research Setups While Locked", `<p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.5;">These are market-structure candidates only. They are not executable while risk is blocked or locked.</p><table style="width:100%;border-collapse:collapse;">${researchRows}</table>`)}
      ${section("News And Catalyst Risk", `<table style="width:100%;border-collapse:collapse;">${catalystRows}</table>`)}
      ${section("Playbook Scorecard", `
        <table style="width:100%;border-collapse:collapse;">
          ${scorecardRow("Best Symbols", brief.learning.playbookScorecard.bestSymbols)}
          ${scorecardRow("Caution Symbols", brief.learning.playbookScorecard.cautionSymbols)}
          ${scorecardRow("Missed Setups", brief.learning.playbookScorecard.missedSetups)}
          ${scorecardRow("Rule Breaks", brief.learning.playbookScorecard.ruleBreaks)}
        </table>
      `)}
      ${section("Playbook Evolution", `
        <table style="width:100%;border-collapse:collapse;">
          ${scorecardRow("Promoted", brief.learning.playbookEvolution.promotedPlaybooks)}
          ${scorecardRow("Demoted", brief.learning.playbookEvolution.demotedPlaybooks)}
          ${scorecardRow("Boosted Symbols", brief.learning.playbookEvolution.boostedSymbols)}
          ${scorecardRow("Suppressed Symbols", brief.learning.playbookEvolution.suppressedSymbols)}
        </table>
      `)}

      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/admin/morning-brief" style="display:inline-block;background:#10b981;color:#07111f;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:800;">Open Morning Brief</a>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

async function loadRiskState(): Promise<MorningRiskState> {
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
    const equity = Math.max(1, Number(performance?.latest_equity ?? 0) || Number(operatorRisk.equity ?? 0) || DEFAULT_CONTEXT.portfolioState.equity);
    const peakEquity = Math.max(equity, Number(performance?.peak_equity ?? equity));
    const dailyDrawdown = Math.max(operatorRisk.dailyDrawdown, dailyPnl < 0 ? Math.abs(dailyPnl) / equity : 0, peakEquity > 0 ? Math.max(0, (peakEquity - equity) / peakEquity) : 0);
    const largestSymbolExposure = Number(positions?.largest_symbol_exposure ?? 0);
    const correlationRisk = Math.max(operatorRisk.correlationRisk, exposureUsd > 0 ? largestSymbolExposure / exposureUsd : 0);
    const activePositions = Number(positions?.active_positions ?? 0);
    const openExposure = openRiskUsd > 0 ? openRiskUsd / equity : exposureUsd > 0 ? Math.min(0.05, exposureUsd / equity * 0.25) : 0;
    const killSwitchActive = operatorRisk.killSwitchActive || dailyDrawdown >= 0.04;
    const permission = killSwitchActive ? "BLOCK" : dailyDrawdown >= 0.02 || correlationRisk >= 0.65 ? "WAIT" : activePositions >= operatorRisk.maxPositions ? "WAIT" : "GO";
    const sizeMultiplier = permission === "GO"
      ? Math.max(0.25, Math.min(1, 1 - Math.max(dailyDrawdown / 0.04, correlationRisk / 1.4)))
      : permission === "WAIT" ? 0.5 : 0;

    return {
      openExposure,
      openRiskUsd,
      exposureUsd,
      equity,
      dailyPnl,
      dailyDrawdown,
      correlationRisk,
      maxPositions: operatorRisk.maxPositions,
      activePositions,
      killSwitchActive,
      permission,
      sizeMultiplier,
      source: "portfolio_journal",
      workspaceId,
      lastUpdatedAt: positions?.last_updated_at ?? journal?.last_updated_at ?? performance?.latest_snapshot ?? null,
      notes: [
        `Risk synced from workspace portfolio/journal (${activePositions} open position${activePositions === 1 ? "" : "s"}).`,
        `Open risk ${formatUsd(openRiskUsd)} on ${formatUsd(equity)} equity; exposure ${formatUsd(exposureUsd)}.`,
      ],
    };
  } catch {
    return operatorRisk;
  }
}

async function loadOperatorRiskState(): Promise<MorningRiskState> {
  try {
    const rows = await q<{ context_state: Record<string, any>; updated_at: string | null }>(
      "SELECT context_state, updated_at::text FROM operator_state ORDER BY created_at DESC LIMIT 1",
    );
    const ctx = rows[0]?.context_state;
    if (!ctx) return FALLBACK_RISK;
    const equity = Number(ctx.equity ?? DEFAULT_CONTEXT.portfolioState.equity);
    const openExposure = Number(ctx.openRisk ?? 0);
    return {
      openExposure,
      openRiskUsd: openExposure * equity,
      exposureUsd: Number(ctx.exposureUsd ?? 0),
      equity,
      dailyPnl: Number(ctx.dailyPnl ?? 0),
      dailyDrawdown: Number(ctx.dailyDrawdown ?? 0),
      correlationRisk: Number(ctx.correlationRisk ?? 0),
      maxPositions: Number(ctx.maxPositions ?? 10),
      activePositions: Number(ctx.activePositions ?? 0),
      killSwitchActive: Boolean(ctx.killSwitchActive),
      permission: ctx.killSwitchActive ? "BLOCK" : String(ctx.permission ?? "WAIT"),
      sizeMultiplier: Number(ctx.sizeMultiplier ?? 1),
      source: "operator_state",
      workspaceId: null,
      lastUpdatedAt: rows[0]?.updated_at ?? null,
      notes: ["Risk read from latest operator state; portfolio/journal sync was unavailable."],
    };
  } catch {
    return FALLBACK_RISK;
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
    const symbolRows = await q<{ symbol: string; action: string; count: number }>(`
      SELECT symbol, action, COUNT(*)::int AS count
      FROM admin_morning_brief_feedback
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY symbol, action
      ORDER BY count DESC
      LIMIT 40
    `).catch(() => []);
    const playbookRows = await q<{ playbook: string; action: string; count: number }>(`
      SELECT COALESCE(NULLIF(playbook, ''), 'Unknown') AS playbook, action, COUNT(*)::int AS count
      FROM admin_morning_brief_feedback
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY COALESCE(NULLIF(playbook, ''), 'Unknown'), action
      ORDER BY count DESC
      LIMIT 40
    `).catch(() => []);
    const briefFeedbackByAction = Object.fromEntries(
      feedbackRows.map((row) => [row.action, Number(row.count ?? 0)]),
    );
    const briefFeedbackTotal = feedbackRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    const playbookScorecard = buildPlaybookScorecard(symbolRows, playbookRows);
    return {
      ...(rows[0] ?? FALLBACK_LEARNING),
      briefFeedbackTotal,
      briefFeedbackByAction,
      feedbackInsights: buildFeedbackInsights(symbolRows, playbookRows, briefFeedbackTotal),
      playbookScorecard,
      playbookEvolution: buildPlaybookEvolution(playbookScorecard),
    };
  } catch {
    return FALLBACK_LEARNING;
  }
}

async function loadSessionScoreReport(): Promise<MorningSessionScoreReport> {
  const reviewDate = sydneyDateKey(new Date().toISOString());
  const workspaceId = await resolveOperatorWorkspaceId();
  try {
    const [feedbackRows, tradeRows] = await Promise.all([
      q<{ action: string; count: number; best_symbol: string | null }>(`
        SELECT action, COUNT(*)::int AS count, MIN(symbol) AS best_symbol
        FROM admin_morning_brief_feedback
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY action
      `).catch(() => []),
      workspaceId ? q<{ closed_trades: number; wins: number; total_pl: string | null; total_r: string | null; best_symbol: string | null; weakest_symbol: string | null }>(`
        WITH closed AS (
          SELECT symbol, COALESCE(pl::numeric, 0) AS pl, COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0) AS r_value, outcome
          FROM journal_entries
          WHERE workspace_id = $1
            AND is_open = FALSE
            AND COALESCE(exit_date, trade_date) >= CURRENT_DATE
        )
        SELECT
          COUNT(*)::int AS closed_trades,
          COUNT(*) FILTER (WHERE outcome = 'win' OR pl > 0)::int AS wins,
          COALESCE(SUM(pl), 0)::text AS total_pl,
          COALESCE(SUM(r_value), 0)::text AS total_r,
          (SELECT symbol FROM closed ORDER BY pl DESC LIMIT 1) AS best_symbol,
          (SELECT symbol FROM closed ORDER BY pl ASC LIMIT 1) AS weakest_symbol
        FROM closed
      `, [workspaceId]).catch(() => []) : Promise.resolve([]),
    ]);
    const counts = Object.fromEntries(feedbackRows.map((row) => [row.action, Number(row.count ?? 0)]));
    const worked = counts.worked ?? 0;
    const failed = counts.failed ?? 0;
    const missed = counts.missed ?? 0;
    const ruleBreaks = counts.rule_broken ?? 0;
    const feedbackCount = feedbackRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    const trades = tradeRows[0];
    const closedTrades = Number(trades?.closed_trades ?? 0);
    const wins = Number(trades?.wins ?? 0);
    const totalPl = Number(trades?.total_pl ?? 0);
    const totalR = Number(trades?.total_r ?? 0);
    const winRate = closedTrades > 0 ? wins / closedTrades : null;
    const disciplineScore = clampScore(100 - ruleBreaks * 18 - failed * 6 - missed * 4 + worked * 4);
    const executionScore = clampScore(50 + worked * 8 - failed * 8 - ruleBreaks * 12 + Math.max(-20, Math.min(20, totalR * 10)));
    return {
      reviewDate,
      feedbackCount,
      worked,
      failed,
      missed,
      ruleBreaks,
      closedTrades,
      totalPl,
      totalR,
      winRate,
      disciplineScore,
      executionScore,
      summary: buildSessionScoreSummary(feedbackCount, closedTrades, worked, failed, missed, ruleBreaks, totalPl, totalR),
      bestSymbol: trades?.best_symbol ?? null,
      weakestSymbol: trades?.weakest_symbol ?? null,
    };
  } catch {
    return {
      reviewDate,
      feedbackCount: 0,
      worked: 0,
      failed: 0,
      missed: 0,
      ruleBreaks: 0,
      closedTrades: 0,
      totalPl: 0,
      totalR: 0,
      winRate: null,
      disciplineScore: 100,
      executionScore: 50,
      summary: "No post-session data available yet. Score will activate after feedback or closed trades are logged.",
      bestSymbol: null,
      weakestSymbol: null,
    };
  }
}

async function loadRecentBriefs(): Promise<MorningBriefHistoryItem[]> {
  try {
    const rows = await q<any>(`
      SELECT brief_id, generated_at, desk_state, headline, top_play_count, catalyst_count
      FROM admin_morning_briefs
      ORDER BY generated_at DESC
      LIMIT 7
    `);
    return rows.map((row) => ({
      briefId: row.brief_id,
      generatedAt: row.generated_at,
      deskState: row.desk_state,
      headline: row.headline,
      topPlayCount: Number(row.top_play_count ?? 0),
      catalystCount: Number(row.catalyst_count ?? 0),
    }));
  } catch {
    return [];
  }
}

type UniverseCandidate = {
  symbol: string;
  score: number;
  sources: Set<string>;
};

function buildCustomUniverse(symbols: string[], market: Market, scanLimit: number): MorningUniverseMeta {
  const selected = uniqueSymbols(symbols, market).slice(0, scanLimit);
  return {
    mode: "custom",
    totalCandidates: selected.length,
    scannedCount: selected.length,
    scanLimit,
    symbols: selected,
    sources: [{ source: "Manual request", count: selected.length, sample: selected.slice(0, 8) }],
    workerStatus: emptyWorkerStatus("Manual symbol request did not require worker universe discovery."),
    note: `Manual symbol request. Detailed scan limited to ${selected.length} symbol${selected.length === 1 ? "" : "s"}.`,
  };
}

async function buildMorningUniverse(
  market: Market,
  learning: MorningLearningSnapshot,
  scanLimit: number,
): Promise<MorningUniverseMeta> {
  const candidates = new Map<string, UniverseCandidate>();
  const sources: MorningUniverseSource[] = [];
  const suppressedSymbols = new Set(learning.playbookEvolution.suppressedSymbols.map((item) => item.key));
  const addSource = (source: string, symbols: string[], weight: number) => {
    const normalized = uniqueSymbols(symbols, market);
    if (!normalized.length) return;
    sources.push({ source, count: normalized.length, sample: normalized.slice(0, 8) });
    normalized.forEach((symbol, index) => {
      const current = candidates.get(symbol) ?? { symbol, score: 0, sources: new Set<string>() };
      const evolutionPenalty = suppressedSymbols.has(symbol) ? 3 : 0;
      current.score += Math.max(0.5, weight - index * 0.03 - evolutionPenalty);
      current.sources.add(source);
      candidates.set(symbol, current);
    });
  };

  addSource("Core fallback", fallbackSymbolsForMarket(market), 3);
  addSource("Default watchlists", Object.values(DEFAULT_WATCHLISTS).filter((list) => list.market === market).flatMap((list) => list.symbols), 4);
  addSource("Feedback edge", learning.playbookScorecard.bestSymbols.map((item) => item.key), 8);
  addSource("Evolved symbol boost", learning.playbookEvolution.boostedSymbols.map((item) => item.key), 10);

  const [dbUniverse, dailyPicks, cachedMomentum, cachedScanner, marketFocus, quantAlerts, catalystSymbols, feedbackSymbols, workerStatus] = await Promise.all([
    loadDbUniverseSymbols(market),
    loadDailyPickSymbols(market),
    loadCachedMomentumSymbols(market),
    loadCachedScannerSymbols(market),
    loadMarketFocusSymbols(market),
    loadQuantAlertSymbols(market),
    loadCatalystSymbolsForUniverse(market),
    loadFeedbackSymbolsForUniverse(),
    loadWorkerStatus(),
  ]);

  addSource("Enabled DB universe", dbUniverse, 2);
  addSource("Daily picks", dailyPicks, 7);
  addSource("Cached momentum", cachedMomentum, 6);
  addSource("Cached scanner results", cachedScanner, 7);
  addSource("Daily market focus", marketFocus, 8);
  addSource("Quant alerts", quantAlerts, 9);
  addSource("Fresh catalysts", catalystSymbols, 7);
  addSource("Recent feedback", feedbackSymbols, 4);

  const ranked = [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.sources.size - a.sources.size || a.symbol.localeCompare(b.symbol));
  const selected = ranked.slice(0, scanLimit).map((candidate) => candidate.symbol);
  const fallback = selected.length ? selected : uniqueSymbols(fallbackSymbolsForMarket(market), market).slice(0, scanLimit);

  return {
    mode: "dynamic",
    totalCandidates: ranked.length || fallback.length,
    scannedCount: fallback.length,
    scanLimit,
    symbols: fallback,
    sources,
    workerStatus,
    note: `Built from ${sources.length} sources and ${ranked.length || fallback.length} candidates; detailed scanner ran the top ${fallback.length}.`,
  };
}

async function loadDbUniverseSymbols(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ symbol: string }>(`
      SELECT symbol
      FROM symbol_universe
      WHERE enabled = TRUE
        AND COALESCE(asset_type, $1) = $1
      ORDER BY tier ASC NULLS LAST, symbol ASC
      LIMIT 400
    `, [assetTypeForMarket(market)]);
    return rows.map((row) => row.symbol);
  } catch {
    return [];
  }
}

async function loadDailyPickSymbols(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ symbol: string }>(`
      SELECT symbol
      FROM daily_picks
      WHERE scan_date >= CURRENT_DATE - INTERVAL '3 days'
        AND asset_class = $1
      ORDER BY scan_date DESC, score DESC NULLS LAST
      LIMIT 80
    `, [assetTypeForMarket(market)]);
    return rows.map((row) => row.symbol);
  } catch {
    return [];
  }
}

async function loadCachedMomentumSymbols(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ symbol: string }>(`
      SELECT ql.symbol
      FROM quotes_latest ql
      INNER JOIN indicators_latest il ON ql.symbol = il.symbol AND il.timeframe = 'daily'
      LEFT JOIN symbol_universe su ON ql.symbol = su.symbol
      WHERE ql.price IS NOT NULL
        AND ql.price > 0
        AND il.rsi14 IS NOT NULL
        AND COALESCE(su.asset_type, $1) = $1
      ORDER BY ABS(COALESCE(ql.change_percent::numeric, 0)) DESC NULLS LAST, il.adx14 DESC NULLS LAST
      LIMIT 100
    `, [assetTypeForMarket(market)]);
    return rows.map((row) => row.symbol);
  } catch {
    return [];
  }
}

async function loadCachedScannerSymbols(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ results: unknown }>(`
      SELECT results
      FROM scanner_results_cache
      WHERE computed_at > NOW() - INTERVAL '24 hours'
      ORDER BY computed_at DESC, matches_found DESC NULLS LAST
      LIMIT 12
    `);
    return uniqueSymbols(rows.flatMap((row) => extractSymbolsFromJson(row.results)), market);
  } catch {
    return [];
  }
}

async function loadMarketFocusSymbols(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ symbol: string }>(`
      SELECT item.symbol
      FROM daily_market_focus_items item
      INNER JOIN daily_market_focus focus ON focus.id = item.focus_id
      WHERE focus.focus_date >= CURRENT_DATE - INTERVAL '3 days'
        AND item.asset_class = $1
      ORDER BY focus.focus_date DESC, item.score DESC NULLS LAST
      LIMIT 30
    `, [assetTypeForMarket(market)]);
    return rows.map((row) => row.symbol);
  } catch {
    return [];
  }
}

async function loadQuantAlertSymbols(market: Market): Promise<string[]> {
  if (market !== "EQUITIES" && market !== "CRYPTO") return [];
  try {
    const rows = await q<{ alerts_json: unknown }>(`
      SELECT alerts_json
      FROM quant_scan_history
      WHERE timestamp > NOW() - INTERVAL '24 hours'
        AND alerts_generated > 0
      ORDER BY timestamp DESC
      LIMIT 5
    `);
    return uniqueSymbols(rows.flatMap((row) => extractSymbolsFromJson(row.alerts_json)), market);
  } catch {
    return [];
  }
}

async function loadWorkerStatus(): Promise<MorningWorkerStatus> {
  try {
    const [workerRows, quoteRows, indicatorRows, scannerRows] = await Promise.all([
      q<{ worker_name: string; finished_at: string | null; status: string | null; errors_count: number | null }>(`
        SELECT worker_name, finished_at, status, errors_count
        FROM worker_runs
        ORDER BY COALESCE(finished_at, started_at) DESC
        LIMIT 1
      `).catch(() => []),
      q<{ latest: string | null }>(`SELECT MAX(fetched_at)::text AS latest FROM quotes_latest`).catch(() => []),
      q<{ latest: string | null }>(`SELECT MAX(computed_at)::text AS latest FROM indicators_latest`).catch(() => []),
      q<{ latest: string | null }>(`SELECT MAX(computed_at)::text AS latest FROM scanner_results_cache`).catch(() => []),
    ]);
    const latestQuoteAt = quoteRows[0]?.latest ?? null;
    const latestIndicatorAt = indicatorRows[0]?.latest ?? null;
    const latestScannerCacheAt = scannerRows[0]?.latest ?? null;
    const freshness = resolveWorkerFreshness([latestQuoteAt, latestIndicatorAt, latestScannerCacheAt]);
    const worker = workerRows[0];
    return {
      lastWorkerRunAt: worker?.finished_at ?? null,
      lastWorkerName: worker?.worker_name ?? null,
      lastWorkerStatus: worker?.status ?? null,
      lastWorkerErrors: Number(worker?.errors_count ?? 0),
      latestQuoteAt,
      latestIndicatorAt,
      latestScannerCacheAt,
      freshness,
      note: buildWorkerStatusNote(freshness, worker?.worker_name ?? null, latestQuoteAt, latestIndicatorAt),
    };
  } catch {
    return emptyWorkerStatus("Worker freshness could not be read from cache tables.");
  }
}

async function loadCatalystSymbolsForUniverse(market: Market): Promise<string[]> {
  try {
    const rows = await q<{ ticker: string }>(`
      SELECT DISTINCT ticker
      FROM catalyst_events
      WHERE event_timestamp_utc >= NOW() - INTERVAL '48 hours'
      ORDER BY ticker ASC
      LIMIT 80
    `);
    return uniqueSymbols(rows.map((row) => row.ticker), market);
  } catch {
    return [];
  }
}

async function loadFeedbackSymbolsForUniverse(): Promise<string[]> {
  try {
    const rows = await q<{ symbol: string }>(`
      SELECT symbol
      FROM admin_morning_brief_feedback
      WHERE created_at > NOW() - INTERVAL '45 days'
      GROUP BY symbol
      ORDER BY COUNT(*) FILTER (WHERE action IN ('worked', 'taken', 'missed')) DESC,
               COUNT(*) DESC
      LIMIT 60
    `);
    return rows.map((row) => row.symbol);
  } catch {
    return [];
  }
}

function extractSymbolsFromJson(value: unknown): string[] {
  const symbols: string[] = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const raw = record.symbol ?? record.ticker ?? record.asset ?? record.underlying;
    if (typeof raw === "string") symbols.push(raw);
    const nested = record.results ?? record.alerts ?? record.candidates ?? record.items;
    if (nested) visit(nested);
  };
  visit(value);
  return symbols;
}

function resolveWorkerFreshness(timestamps: Array<string | null>): MorningWorkerStatus["freshness"] {
  const newest = timestamps
    .map((value) => value ? new Date(value).getTime() : 0)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  if (!newest) return "unknown";
  return Date.now() - newest < 2 * 60 * 60 * 1000 ? "fresh" : "stale";
}

function buildWorkerStatusNote(
  freshness: MorningWorkerStatus["freshness"],
  workerName: string | null,
  latestQuoteAt: string | null,
  latestIndicatorAt: string | null,
) {
  if (freshness === "fresh") return `Worker cache is fresh. Latest quotes ${formatAge(latestQuoteAt)}, indicators ${formatAge(latestIndicatorAt)}.`;
  if (freshness === "stale") return `Worker cache looks stale. Latest quotes ${formatAge(latestQuoteAt)}, indicators ${formatAge(latestIndicatorAt)}. Check ${workerName || "worker_runs"}.`;
  return "Worker cache freshness is unknown. The brief will still fall back to stored picks and core symbols.";
}

function emptyWorkerStatus(note: string): MorningWorkerStatus {
  return {
    lastWorkerRunAt: null,
    lastWorkerName: null,
    lastWorkerStatus: null,
    lastWorkerErrors: 0,
    latestQuoteAt: null,
    latestIndicatorAt: null,
    latestScannerCacheAt: null,
    freshness: "unknown",
    note,
  };
}

function formatAge(value: string | null) {
  if (!value) return "unknown";
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  return `${Math.round(ageMinutes / 60)}h ago`;
}

function clampScanLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_SCAN_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_SCAN_LIMIT;
  return Math.max(10, Math.min(MAX_SCAN_LIMIT, Math.round(parsed)));
}

function assetTypeForMarket(market: Market) {
  if (market === "CRYPTO") return "crypto";
  if (market === "FOREX") return "forex";
  return "equity";
}

function fallbackSymbolsForMarket(market: Market) {
  return DEFAULT_SYMBOLS_BY_MARKET[market] ?? DEFAULT_SYMBOLS_BY_MARKET.EQUITIES;
}

function uniqueSymbols(symbols: string[], market: Market) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of symbols) {
    const symbol = normalizeUniverseSymbol(raw, market);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    result.push(symbol);
  }
  return result;
}

function normalizeUniverseSymbol(raw: string, market: Market) {
  const symbol = String(raw || "")
    .trim()
    .toUpperCase()
    .replace("-USD", "")
    .replace("/USD", "")
    .replace(/[^A-Z0-9.]/g, "");
  if (!symbol) return "";
  if (market === "CRYPTO" && STABLE_CRYPTO_SYMBOLS.has(symbol)) return "";
  if (market === "CRYPTO" && !AV_CRYPTO_SYMBOLS.has(symbol)) return "";
  return symbol;
}

async function ensureMorningBriefTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_morning_briefs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brief_id TEXT NOT NULL UNIQUE,
      generated_at TIMESTAMPTZ NOT NULL,
      market TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      desk_state TEXT NOT NULL,
      headline TEXT NOT NULL,
      top_play_count INTEGER NOT NULL DEFAULT 0,
      watch_count INTEGER NOT NULL DEFAULT 0,
      avoid_count INTEGER NOT NULL DEFAULT 0,
      catalyst_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'admin',
      snapshot JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_generated ON admin_morning_briefs (generated_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_state ON admin_morning_briefs (desk_state, generated_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_market_timeframe_generated ON admin_morning_briefs (market, timeframe, generated_at DESC)`);
}

async function ensureMorningActionTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_morning_trade_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id TEXT NOT NULL UNIQUE,
      brief_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      bias TEXT NOT NULL,
      permission TEXT NOT NULL,
      confidence NUMERIC(6,2),
      playbook TEXT,
      plan JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_morning_trade_plans_brief ON admin_morning_trade_plans (brief_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_morning_trade_plans_symbol ON admin_morning_trade_plans (symbol, created_at DESC)`);
  await q(`
    CREATE TABLE IF NOT EXISTS admin_broker_fill_sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID,
      source TEXT NOT NULL,
      broker_linked BOOLEAN NOT NULL DEFAULT FALSE,
      broker_tagged_trades INTEGER NOT NULL DEFAULT 0,
      open_broker_tagged_trades INTEGER NOT NULL DEFAULT 0,
      portfolio_positions INTEGER NOT NULL DEFAULT 0,
      unmatched_open_trades INTEGER NOT NULL DEFAULT 0,
      total_broker_tagged_pl NUMERIC(18,2) NOT NULL DEFAULT 0,
      report JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_broker_fill_sync_workspace_created ON admin_broker_fill_sync_runs (workspace_id, created_at DESC)`);
}

async function ensureMorningOutcomeTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_morning_brief_outcome_grades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brief_id TEXT NOT NULL UNIQUE,
      generated_at TIMESTAMPTZ,
      grade TEXT NOT NULL,
      total_plays INTEGER NOT NULL DEFAULT 0,
      worked INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      missed INTEGER NOT NULL DEFAULT 0,
      invalidated INTEGER NOT NULL DEFAULT 0,
      unreviewed INTEGER NOT NULL DEFAULT 0,
      closed_trades INTEGER NOT NULL DEFAULT 0,
      total_pl NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_r NUMERIC(12,4) NOT NULL DEFAULT 0,
      summary TEXT NOT NULL,
      snapshot JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbog_generated ON admin_morning_brief_outcome_grades (generated_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_mbog_grade ON admin_morning_brief_outcome_grades (grade, generated_at DESC)`);
}

function buildTradePlanEntryTrigger(play: ScannerHit, brief: MorningBrief) {
  const base = play.bias === "SHORT"
    ? "Wait for downside continuation after a failed reclaim; no entry into immediate support."
    : play.bias === "LONG"
      ? "Wait for a clean reclaim/continuation trigger; no entry after the move is already stretched."
      : "Wait for directional bias to resolve before entry.";
  if (brief.deskState === "DEFENSIVE") return `${base} Use defensive confirmation and reduced size.`;
  if (brief.deskState === "BLOCK") return "Desk is BLOCK. This is a watch-only plan until risk permission changes.";
  return base;
}

function buildTradePlanInvalidation(play: ScannerHit, catalysts: MorningCatalyst[]) {
  const catalystText = catalysts.length ? " A high-impact catalyst must not contradict the planned direction." : "";
  return `Invalidate ${play.symbol} if permission drops to BLOCK, the ${play.playbook || play.regime} structure fails, or price action breaks the planned trigger area.${catalystText}`;
}

function buildTradePlanSizing(brief: MorningBrief, play: ScannerHit, catalysts: MorningCatalyst[]) {
  const catalystCut = catalysts.length ? 0.5 : 1;
  const permissionCut = play.permission === "GO" ? 1 : play.permission === "WAIT" ? 0.5 : 0;
  const size = Math.max(0, Math.min(1, brief.risk.sizeMultiplier * play.sizeMultiplier * catalystCut * permissionCut));
  if (size <= 0) return "No new size. Keep this as a watch-only plan.";
  return `Use up to ${size.toFixed(2)}x planned size. Cut in half if the first trigger is late, liquidity is poor, or correlation rises.`;
}

function buildDailyReviewLessons(
  sessionScore: MorningSessionScoreReport,
  risk: MorningRiskState,
  learning: MorningLearningSnapshot,
  brokerSync: MorningBrokerFillSyncReport,
) {
  const lessons: string[] = [];
  if (sessionScore.ruleBreaks > 0) lessons.push(`Rule breaks detected (${sessionScore.ruleBreaks}). Tomorrow's brief should reduce aggression until discipline score recovers.`);
  if (sessionScore.missed > 0) lessons.push(`${sessionScore.missed} missed setup${sessionScore.missed === 1 ? "" : "s"}; add those playbooks to the deliberate watch list.`);
  if (sessionScore.failed > sessionScore.worked) lessons.push("Failed labels exceeded worked labels. Demand stronger confirmation and smaller initial size tomorrow.");
  if (risk.dailyPnl < 0) lessons.push(`Daily P&L closed negative (${formatUsd(risk.dailyPnl)}). Start tomorrow with risk permission checked before scanning plays.`);
  if (brokerSync.unmatchedOpenTrades > 0) lessons.push(`${brokerSync.unmatchedOpenTrades} open journal trade${brokerSync.unmatchedOpenTrades === 1 ? "" : "s"} did not match portfolio positions. Reconcile before relying on exposure.`);
  if (learning.playbookEvolution.promotedPlaybooks.length) lessons.push(`Promote proven playbooks: ${learning.playbookEvolution.promotedPlaybooks.map((item) => item.key).join(", ")}.`);
  if (learning.playbookEvolution.suppressedSymbols.length) lessons.push(`Suppress noisy symbols until confirmation improves: ${learning.playbookEvolution.suppressedSymbols.map((item) => item.key).join(", ")}.`);
  return lessons.length ? lessons : ["No major adjustment detected. Keep labelling plays so the model has a sharper personal sample."];
}

async function buildPreviousBriefOutcomeGrade(): Promise<MorningOutcomeGrade> {
  const empty = emptyOutcomeGrade("No prior saved brief is ready to grade yet.");
  try {
    await ensureMorningOutcomeTables();
    const rows = await q<{ brief_id: string; generated_at: string; snapshot: MorningBrief }>(`
      SELECT brief_id, generated_at, snapshot
      FROM admin_morning_briefs
      WHERE generated_at < NOW() - INTERVAL '6 hours'
      ORDER BY generated_at DESC
      LIMIT 1
    `);
    const prior = rows[0];
    if (!prior?.snapshot) return empty;

    const plays = [...(prior.snapshot.topPlays ?? []), ...(prior.snapshot.watchlist ?? []).slice(0, 4), ...(prior.snapshot.researchSetups ?? []).slice(0, 4)];
    const symbols = uniqueSymbols(plays.map((play) => play.symbol), prior.snapshot.market ?? "CRYPTO");
    if (!symbols.length) return emptyOutcomeGrade("Prior brief had no plays to grade.", prior.brief_id, prior.generated_at);

    const workspaceId = await resolveOperatorWorkspaceId();
    const [feedbackRows, tradeRows] = await Promise.all([
      q<{ symbol: string; action: string; note: string | null }>(`
        SELECT DISTINCT ON (symbol) symbol, action, note
        FROM admin_morning_brief_feedback
        WHERE brief_id = $1 OR (symbol = ANY($2::text[]) AND created_at >= $3::timestamptz)
        ORDER BY symbol, created_at DESC
      `, [prior.brief_id, symbols, prior.generated_at]).catch(() => []),
      workspaceId ? q<{ symbol: string; pl: string | null; r_value: string | null }>(`
        SELECT symbol,
               COALESCE(SUM(pl::numeric), 0)::text AS pl,
               COALESCE(SUM(COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0)), 0)::text AS r_value
        FROM journal_entries
        WHERE workspace_id = $1
          AND UPPER(symbol) = ANY($2::text[])
          AND is_open = FALSE
          AND COALESCE(exit_date, trade_date) >= $3::timestamptz
        GROUP BY symbol
      `, [workspaceId, symbols, prior.generated_at]).catch(() => []) : Promise.resolve([]),
    ]);

    const feedbackBySymbol = new Map(feedbackRows.map((row) => [String(row.symbol).toUpperCase(), row]));
    const tradeBySymbol = new Map(tradeRows.map((row) => [String(row.symbol).toUpperCase(), row]));
    const gradedPlays = symbols.map((symbol) => {
      const feedback = feedbackBySymbol.get(symbol);
      const trade = tradeBySymbol.get(symbol);
      const pl = Number(trade?.pl ?? 0);
      const r = Number(trade?.r_value ?? 0);
      const verdict = resolveOutcomeVerdict(feedback?.action ?? null, r, pl);
      return {
        symbol,
        action: feedback?.action ?? null,
        pl,
        r,
        verdict,
        note: feedback?.note || (trade ? `Closed journal outcome ${formatUsd(pl)}, ${r.toFixed(2)}R.` : "No review label or closed trade found yet."),
      };
    });
    const worked = gradedPlays.filter((play) => play.verdict === "worked").length;
    const failed = gradedPlays.filter((play) => play.verdict === "failed").length;
    const missed = gradedPlays.filter((play) => play.verdict === "missed").length;
    const invalidated = gradedPlays.filter((play) => play.verdict === "invalidated").length;
    const unreviewed = gradedPlays.filter((play) => play.verdict === "unreviewed").length;
    const totalPl = gradedPlays.reduce((sum, play) => sum + play.pl, 0);
    const totalR = gradedPlays.reduce((sum, play) => sum + play.r, 0);
    const grade = resolveBriefGrade(worked, failed, missed, invalidated, unreviewed, totalR);
    const result: MorningOutcomeGrade = {
      briefId: prior.brief_id,
      gradedAt: new Date().toISOString(),
      generatedAt: prior.generated_at,
      totalPlays: gradedPlays.length,
      worked,
      failed,
      missed,
      invalidated,
      unreviewed,
      closedTrades: tradeRows.length,
      totalPl,
      totalR,
      grade,
      summary: buildOutcomeGradeSummary(grade, worked, failed, missed, invalidated, unreviewed, totalPl, totalR),
      plays: gradedPlays,
    };
    await q(
      `INSERT INTO admin_morning_brief_outcome_grades (brief_id, generated_at, grade, total_plays, worked, failed, missed, invalidated, unreviewed, closed_trades, total_pl, total_r, summary, snapshot, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW())
       ON CONFLICT (brief_id) DO UPDATE SET
        grade = EXCLUDED.grade,
        total_plays = EXCLUDED.total_plays,
        worked = EXCLUDED.worked,
        failed = EXCLUDED.failed,
        missed = EXCLUDED.missed,
        invalidated = EXCLUDED.invalidated,
        unreviewed = EXCLUDED.unreviewed,
        closed_trades = EXCLUDED.closed_trades,
        total_pl = EXCLUDED.total_pl,
        total_r = EXCLUDED.total_r,
        summary = EXCLUDED.summary,
        snapshot = EXCLUDED.snapshot,
        updated_at = NOW()`,
      [result.briefId, result.generatedAt, result.grade, result.totalPlays, result.worked, result.failed, result.missed, result.invalidated, result.unreviewed, result.closedTrades, result.totalPl, result.totalR, result.summary, JSON.stringify(result)],
    ).catch(() => undefined);
    return result;
  } catch {
    return empty;
  }
}

async function loadExpectancyDashboard(): Promise<MorningExpectancyDashboard> {
  const generatedAt = new Date().toISOString();
  const workspaceId = await resolveOperatorWorkspaceId();
  if (!workspaceId) {
    return {
      generatedAt,
      sampleTrades: 0,
      bestSymbols: [],
      weakestSymbols: [],
      bestPlaybooks: [],
      weakestPlaybooks: [],
      notes: ["No operator workspace found; expectancy will activate once journal trades are available."],
    };
  }
  try {
    const [symbolRows, playbookRows] = await Promise.all([
      q<any>(expectancySql("symbol"), [workspaceId]).catch(() => []),
      q<any>(expectancySql("COALESCE(NULLIF(strategy, ''), NULLIF(setup, ''), NULLIF(trade_type, ''), 'Unclassified')"), [workspaceId]).catch(() => []),
    ]);
    const symbolItems = symbolRows.map(expectancyItemFromRow);
    const playbookItems = playbookRows.map(expectancyItemFromRow);
    const sampleTrades = symbolItems.reduce((sum, item) => sum + item.sample, 0);
    return {
      generatedAt,
      sampleTrades,
      bestSymbols: symbolItems.filter((item) => item.sample >= 2).sort((a, b) => b.avgR - a.avgR).slice(0, 4),
      weakestSymbols: symbolItems.filter((item) => item.sample >= 2).sort((a, b) => a.avgR - b.avgR).slice(0, 4),
      bestPlaybooks: playbookItems.filter((item) => item.sample >= 2).sort((a, b) => b.avgR - a.avgR).slice(0, 4),
      weakestPlaybooks: playbookItems.filter((item) => item.sample >= 2).sort((a, b) => a.avgR - b.avgR).slice(0, 4),
      notes: buildExpectancyNotes(sampleTrades, symbolItems, playbookItems),
    };
  } catch {
    return {
      generatedAt,
      sampleTrades: 0,
      bestSymbols: [],
      weakestSymbols: [],
      bestPlaybooks: [],
      weakestPlaybooks: [],
      notes: ["Expectancy query failed; using feedback scorecards only for this brief."],
    };
  }
}

function buildMorningRiskGovernor(
  risk: MorningRiskState,
  sessionScore: MorningSessionScoreReport,
  expectancy: MorningExpectancyDashboard,
): MorningRiskGovernor {
  const dailyStopUsd = risk.equity * 0.02;
  const portfolioHeatLimitUsd = risk.equity * 0.06;
  const baseMaxTrades = sessionScore.ruleBreaks > 0 || sessionScore.disciplineScore < 60 ? 1 : sessionScore.executionScore >= 75 ? 4 : 3;
  const maxTradesToday = risk.killSwitchActive || risk.dailyDrawdown >= 0.04 ? 0 : baseMaxTrades;
  const remainingTrades = Math.max(0, maxTradesToday - sessionScore.closedTrades);
  const lockouts: string[] = [];
  if (risk.killSwitchActive) lockouts.push("Kill switch active");
  if (risk.dailyDrawdown >= 0.04) lockouts.push("Daily drawdown hard stop reached");
  if (Math.abs(Math.min(0, risk.dailyPnl)) >= dailyStopUsd) lockouts.push("Daily loss cap reached");
  if (risk.openRiskUsd >= portfolioHeatLimitUsd) lockouts.push("Portfolio heat cap reached");
  if (remainingTrades <= 0 && maxTradesToday > 0) lockouts.push("Trade count budget used");
  const mode: MorningRiskGovernor["mode"] = lockouts.length || maxTradesToday === 0
    ? "LOCKED"
    : risk.dailyDrawdown >= 0.02 || risk.correlationRisk >= 0.65 || sessionScore.disciplineScore < 70
      ? "DEFENSIVE"
      : expectancy.sampleTrades < 10
        ? "THROTTLED"
        : "NORMAL";
  const maxRiskPerTradePct = mode === "NORMAL" ? 0.01 : mode === "THROTTLED" ? 0.0075 : mode === "DEFENSIVE" ? 0.005 : 0;
  const instructions = [
    mode === "LOCKED" ? "No new risk. Review, reconcile, or wait for the next session." : `Maximum ${remainingTrades} new trade${remainingTrades === 1 ? "" : "s"} left today.`,
    `Single-trade risk cap: ${(maxRiskPerTradePct * 100).toFixed(2)}% (${formatUsd(risk.equity * maxRiskPerTradePct)}).`,
    risk.correlationRisk >= 0.65 ? "Correlation is high; do not add similar exposure." : "Correlation guard is clear enough for selective setups.",
  ];
  return {
    mode,
    maxTradesToday,
    tradesUsedToday: sessionScore.closedTrades,
    remainingTrades,
    maxRiskPerTradePct,
    maxRiskPerTradeUsd: risk.equity * maxRiskPerTradePct,
    dailyStopUsd,
    portfolioHeatLimitUsd,
    currentHeatUsd: risk.openRiskUsd,
    lockouts,
    instructions,
  };
}

function buildScenarioTree(
  topPlays: ScannerHit[],
  watchlist: ScannerHit[],
  researchSetups: ScannerHit[],
  catalysts: MorningCatalyst[],
  governor: MorningRiskGovernor,
  expectancy: MorningExpectancyDashboard,
): MorningScenarioTree[] {
  const candidates = [...topPlays, ...watchlist, ...researchSetups].slice(0, 5);
  return candidates.map((play) => {
    const symbolCatalyst = catalysts.find((event) => event.ticker === play.symbol);
    const expectancyHit = [...expectancy.bestSymbols, ...expectancy.bestPlaybooks].find((item) => item.key === play.symbol || item.key === (play.playbook || play.regime));
    return {
      symbol: play.symbol,
      bias: play.bias,
      baseCase: `${play.permission} ${play.bias} setup using ${play.playbook || play.regime}; confidence ${play.confidence}%.`,
      bullishPath: play.bias === "SHORT" ? `Only flips constructive if ${play.symbol} rejects downside pressure and reclaims structure.` : `Continuation path: trigger holds, volume expands, and ${play.symbol} accepts above the setup area.`,
      bearishPath: play.bias === "LONG" ? `Failure path: trigger loses acceptance or catalyst/news pressure contradicts the long bias.` : `Continuation path: lower high forms, downside pressure expands, and bounce attempts fail.`,
      chopPath: `No trade if ${play.symbol} sits between trigger and invalidation or liquidity is thin in the first impulse.`,
      confirmation: expectancyHit ? `Prefer this only if it matches historical edge: ${expectancyHit.note}` : "Require price confirmation because expectancy sample is not strong yet.",
      invalidation: symbolCatalyst ? `${symbolCatalyst.impactLabel} catalyst on watch: ${symbolCatalyst.headline}` : "Invalidate on permission downgrade, structure failure, or late chase conditions.",
      riskAdjustment: governor.mode === "LOCKED" ? "Watch only." : governor.mode === "DEFENSIVE" ? "Half size or less." : `Cap risk at ${formatUsd(governor.maxRiskPerTradeUsd)}.`,
    };
  });
}

function buildCommanderView(
  state: DeskState,
  risk: MorningRiskState,
  topPlays: ScannerHit[],
  researchSetups: ScannerHit[],
  checklist: MorningExecutionChecklist,
  governor: MorningRiskGovernor,
  outcomeGrade: MorningOutcomeGrade,
  scenarios: MorningScenarioTree[],
): MorningCommanderView {
  const topSymbols = (topPlays.length ? topPlays : researchSetups).slice(0, 3).map((play) => play.symbol);
  return {
    permission: governor.mode === "LOCKED" || state === "BLOCK" ? "BLOCK" : state,
    primaryAction: checklist.firstAction,
    topSymbols,
    maxRiskLine: governor.mode === "LOCKED" ? "No new risk allowed." : `${governor.remainingTrades} trade budget, ${formatUsd(governor.maxRiskPerTradeUsd)} max risk per idea.`,
    scenarioFocus: scenarios[0] ? `${scenarios[0].symbol}: ${scenarios[0].confirmation}` : "No scenario focus until a candidate clears the scan.",
    reviewFocus: outcomeGrade.briefId ? `Yesterday grade ${outcomeGrade.grade}: ${outcomeGrade.summary}` : outcomeGrade.summary,
    blocks: [...governor.lockouts, ...checklist.blockedConditions.slice(0, 3), ...risk.notes.slice(0, 1)],
  };
}

async function loadCatalysts(symbols: string[], hits: ScannerHit[]): Promise<MorningCatalyst[]> {
  try {
    const rows = await q<any>(`
      SELECT ticker, source, headline, url, catalyst_type, catalyst_subtype, event_timestamp_et, severity, confidence
      FROM catalyst_events
      WHERE event_timestamp_utc >= NOW() - INTERVAL '36 hours'
        AND ticker = ANY($1::text[])
      ORDER BY event_timestamp_et DESC
      LIMIT 20
    `, [symbols]);
    const hitBySymbol = new Map(hits.map((hit) => [hit.symbol, hit]));
    return rows.map((row) => ({
      ticker: row.ticker,
      source: row.source,
      headline: row.headline,
      url: row.url,
      catalystType: row.catalyst_type,
      catalystSubtype: row.catalyst_subtype,
      eventTimestampEt: row.event_timestamp_et,
      severity: row.severity,
      confidence: row.confidence == null ? null : Number(row.confidence),
      ...scoreCatalystImpact(row, hitBySymbol.get(String(row.ticker || "").toUpperCase())),
    })).sort((a, b) => b.impactScore - a.impactScore || new Date(b.eventTimestampEt || 0).getTime() - new Date(a.eventTimestampEt || 0).getTime());
  } catch {
    return [];
  }
}

function scoreCatalystImpact(row: Record<string, any>, hit?: ScannerHit): Pick<MorningCatalyst, "impactScore" | "impactLabel" | "impactReason"> {
  const severity = String(row.severity || "").toUpperCase();
  const confidence = Number(row.confidence ?? 0);
  const subtype = String(row.catalyst_subtype || "").toUpperCase();
  const headline = String(row.headline || "").toLowerCase();
  let score = 20;
  if (severity === "HIGH") score += 35;
  else if (severity === "MED") score += 22;
  else if (severity === "LOW") score += 10;
  score += Math.round(Math.max(0, Math.min(1, confidence)) * 20);
  if (hit?.permission === "GO") score += 18;
  if (hit?.permission === "WAIT") score += 10;
  if (/earnings|guidance|sec|offering|lawsuit|merger|cpi|fomc|fed|rate|hack|exploit|delist/.test(`${subtype} ${headline}`)) score += 18;
  if (/upgrade|partnership|approval|launch|listing/.test(`${subtype} ${headline}`)) score += 8;
  const impactScore = clampScore(score);
  const impactLabel = impactScore >= 80 ? "CRITICAL" : impactScore >= 62 ? "HIGH" : impactScore >= 40 ? "MED" : "LOW";
  const impactReason = hit
    ? `${impactLabel} catalyst impact because ${hit.symbol} is a ${hit.permission} scanner candidate with ${severity || "unknown"} severity news.`
    : `${impactLabel} catalyst impact based on severity, confidence, and headline risk.`;
  return { impactScore, impactLabel, impactReason };
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

function buildExecutionChecklist(
  state: DeskState,
  topPlays: ScannerHit[],
  watchlist: ScannerHit[],
  catalysts: MorningCatalyst[],
  risk: MorningRiskState,
  learning: MorningLearningSnapshot,
  comparison: MorningBriefComparison,
): MorningExecutionChecklist {
  const primary = topPlays[0] ?? watchlist[0] ?? null;
  const catalystSymbols = new Set(catalysts.map((event) => event.ticker));
  const allowedSetups = topPlays.length > 0
    ? topPlays.slice(0, 3).map((play) => `${play.symbol} ${play.bias} ${play.playbook || play.regime}`)
    : watchlist.slice(0, 3).map((play) => `${play.symbol} only after WAIT clears`);
  const blockedConditions = buildBlockedConditions(state, risk, catalysts, learning);
  const firstAction = buildFirstAction(state, primary, comparison);
  const invalidationRule = primary
    ? `For ${primary.symbol}, abandon the idea if permission drops to BLOCK, the setup loses ${primary.playbook || primary.regime} structure, or a fresh catalyst contradicts the bias.`
    : "No primary setup. Do not manufacture a trade until a GO candidate appears.";
  const sizingRule = state === "TRADE"
    ? `Start at ${Math.max(0.25, Math.min(1, risk.sizeMultiplier)).toFixed(2)}x planned size; reduce by half if correlation rises above 65% or the first trigger is late.`
    : state === "DEFENSIVE"
      ? "Use half size or less, one position at a time, and only after clean confirmation."
      : "No new size until desk state improves.";

  return {
    mode: state,
    allowedSetups: allowedSetups.length ? allowedSetups : ["No setup is allowed yet"],
    blockedConditions,
    firstAction,
    invalidationRule,
    sizingRule,
    checklist: [
      {
        label: "Risk Permission",
        status: state === "BLOCK" ? "BLOCK" : state === "DEFENSIVE" ? "WAIT" : "PASS",
        instruction: risk.killSwitchActive
          ? "Kill switch is active. Stand down."
          : `Desk permission is ${risk.permission}; active positions ${risk.activePositions}/${risk.maxPositions}.`,
      },
      {
        label: "Setup Quality",
        status: topPlays.length > 0 ? "PASS" : watchlist.length > 0 ? "WAIT" : "BLOCK",
        instruction: topPlays.length > 0
          ? `${topPlays.length} GO candidate${topPlays.length === 1 ? "" : "s"}; start with ${topPlays[0].symbol}.`
          : watchlist.length > 0
            ? `${watchlist.length} WAIT candidate${watchlist.length === 1 ? "" : "s"}; require trigger confirmation first.`
            : "No candidate is ready. Keep cash as the position.",
      },
      {
        label: "Catalyst Check",
        status: catalysts.length > 0 ? "WAIT" : "PASS",
        instruction: catalysts.length > 0
          ? `Review catalyst risk for ${[...catalystSymbols].slice(0, 4).join(", ")} before entry.`
          : "No fresh scanned-symbol catalyst conflict found.",
      },
      {
        label: "Learning Filter",
        status: learning.briefFeedbackTotal >= 10 ? "PASS" : "INFO",
        instruction: learning.briefFeedbackTotal >= 10
          ? "Use feedback memory to prefer proven symbols/playbooks and demand confirmation on noisy ones."
          : "Feedback sample is young. Keep labelling every setup after the session.",
      },
      {
        label: "Change Awareness",
        status: comparison.deskStateChanged || comparison.newTopPlays.length > 0 ? "INFO" : "PASS",
        instruction: comparison.summary,
      },
    ],
  };
}

function buildBlockedConditions(
  state: DeskState,
  risk: MorningRiskState,
  catalysts: MorningCatalyst[],
  learning: MorningLearningSnapshot,
) {
  const blocked = [
    "Do not enter without a defined invalidation before the order.",
    "Do not chase a move after the planned trigger has already stretched.",
  ];
  if (state === "BLOCK") blocked.unshift("No new trades while the desk is BLOCK.");
  if (risk.dailyDrawdown >= 0.02) blocked.push("No full-size trades while daily drawdown is elevated.");
  if (risk.correlationRisk >= 0.65) blocked.push("Do not add correlated exposure until risk compresses.");
  if (catalysts.length > 0) blocked.push("Do not trade through unresolved catalyst risk without reducing size.");
  if ((learning.briefFeedbackByAction.failed ?? 0) > (learning.briefFeedbackByAction.worked ?? 0)) {
    blocked.push("Recent failed labels exceed worked labels. Demand extra confirmation.");
  }
  return blocked;
}

function buildFirstAction(
  state: DeskState,
  primary: ScannerHit | null,
  comparison: MorningBriefComparison,
) {
  if (state === "BLOCK") return "Stand down, review risk, and wait for the next brief or manual risk reset.";
  if (!primary) return "Do nothing at the open. Re-scan after the first market impulse forms.";
  if (state === "DEFENSIVE") return `Watch ${primary.symbol}, but only act after confirmation and with reduced size.`;
  if (comparison.newTopPlays.includes(primary.symbol)) return `Prioritize fresh candidate ${primary.symbol}; confirm it is not a one-scan spike before entry.`;
  return `Open ${primary.symbol} in terminal first, verify trigger/invalidation/catalyst, then decide.`;
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

function miniCell(label: string, value: string) {
  return `
    <td style="padding:8px 10px;background:#101826;border:1px solid #263244;border-radius:8px;vertical-align:top;">
      <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;">${escapeHtml(label)}</div>
      <div style="color:#e2e8f0;font-size:13px;font-weight:700;margin-top:4px;">${escapeHtml(value)}</div>
    </td>`;
}

function checklistRow(item: MorningExecutionChecklistItem) {
  const color = item.status === "PASS" ? "#10b981" : item.status === "BLOCK" ? "#f87171" : item.status === "WAIT" ? "#fbbf24" : "#38bdf8";
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#f8fafc;font-weight:800;">${escapeHtml(item.label)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #263244;color:${color};font-weight:900;text-align:center;">${escapeHtml(item.status)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(item.instruction)}</td>
    </tr>`;
}

function scorecardRow(label: string, items: MorningScorecardItem[]) {
  const value = items.length
    ? items.slice(0, 3).map((item) => `${item.key} (+${item.positive}/-${item.caution})`).join(", ")
    : "No sample yet";
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#f8fafc;font-weight:800;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#cbd5e1;text-align:right;">${escapeHtml(value)}</td>
    </tr>`;
}

function universeSourceRow(source: MorningUniverseSource) {
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#f8fafc;font-weight:800;">${escapeHtml(source.source)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #263244;color:#10b981;font-weight:900;text-align:center;">${source.count}</td>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#cbd5e1;text-align:right;">${escapeHtml(source.sample.join(", "))}</td>
    </tr>`;
}

function scenarioRow(scenario: MorningScenarioTree) {
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#f8fafc;font-weight:800;">${escapeHtml(scenario.symbol)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #263244;color:#cbd5e1;">${escapeHtml(scenario.confirmation)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #263244;color:#fbbf24;text-align:right;">${escapeHtml(scenario.riskAdjustment)}</td>
    </tr>`;
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

function buildFeedbackInsights(
  symbolRows: Array<{ symbol: string; action: string; count: number }>,
  playbookRows: Array<{ playbook: string; action: string; count: number }>,
  total: number,
): MorningFeedbackInsight[] {
  if (total === 0) {
    return [{
      label: "Learning Warmup",
      metric: "0 labels",
      note: "Start marking morning plays. The system needs explicit trader feedback before it can rank your personal edge.",
      tone: "blue",
    }];
  }

  const insights: MorningFeedbackInsight[] = [];
  const symbols = groupCounts(symbolRows, "symbol");
  const playbooks = groupCounts(playbookRows, "playbook");

  const bestSymbol = bestByScore(symbols, ["worked", "taken"], ["failed", "invalidated"]);
  if (bestSymbol) {
    insights.push({
      label: "Strongest Symbol Feedback",
      metric: bestSymbol.key,
      note: `${bestSymbol.positive} positive labels vs ${bestSymbol.negative} negative labels in the last 30 days. Give it first attention when the scanner agrees.`,
      tone: "green",
    });
  }

  const noisySymbol = bestByScore(symbols, ["failed", "invalidated", "ignored"], ["worked", "taken"]);
  if (noisySymbol) {
    insights.push({
      label: "Noise Candidate",
      metric: noisySymbol.key,
      note: `${noisySymbol.positive} caution labels. Require stronger trigger confirmation before giving it attention.`,
      tone: "yellow",
    });
  }

  const bestPlaybook = bestByScore(playbooks, ["worked", "taken"], ["failed", "invalidated"]);
  if (bestPlaybook) {
    insights.push({
      label: "Playbook Bias",
      metric: bestPlaybook.key,
      note: `${bestPlaybook.positive} positive labels. This framework is becoming part of your personal edge sample.`,
      tone: "green",
    });
  }

  return insights.slice(0, 4);
}

function buildPlaybookScorecard(
  symbolRows: Array<{ symbol: string; action: string; count: number }>,
  playbookRows: Array<{ playbook: string; action: string; count: number }>,
): MorningPlaybookScorecard {
  const symbols = groupCounts(symbolRows, "symbol");
  const playbooks = groupCounts(playbookRows, "playbook");
  return {
    bestSymbols: rankedScorecard(symbols, ["worked", "taken"], ["failed", "invalidated", "rule_broken"], "Give first attention when scanner agrees.").slice(0, 3),
    cautionSymbols: rankedScorecard(symbols, ["failed", "invalidated", "ignored", "rule_broken"], ["worked", "taken"], "Require stronger confirmation before acting.").slice(0, 3),
    bestPlaybooks: rankedScorecard(playbooks, ["worked", "taken"], ["failed", "invalidated", "rule_broken"], "Personal edge sample is improving here.").slice(0, 3),
    missedSetups: rankedScorecard(playbooks, ["missed"], ["taken", "failed"], "You have been missing this setup type; watch it deliberately.").slice(0, 3),
    ruleBreaks: rankedScorecard(playbooks, ["rule_broken"], ["worked"], "Discipline leak. Trade smaller or add confirmation.").slice(0, 3),
  };
}

function buildPlaybookEvolution(scorecard: MorningPlaybookScorecard): MorningPlaybookEvolution {
  const promotedPlaybooks = scorecard.bestPlaybooks.filter((item) => item.score > 0).slice(0, 3);
  const demotedPlaybooks = [...scorecard.ruleBreaks, ...scorecard.missedSetups]
    .filter((item) => item.positive > 0)
    .sort((a, b) => b.positive - a.positive || a.score - b.score)
    .slice(0, 3);
  const boostedSymbols = scorecard.bestSymbols.filter((item) => item.score >= 0).slice(0, 5);
  const suppressedSymbols = scorecard.cautionSymbols.filter((item) => item.positive > 0).slice(0, 5);
  const rules = [
    boostedSymbols.length ? `Boost symbols with positive follow-through: ${boostedSymbols.map((item) => item.key).join(", ")}.` : "No symbol boost yet; wait for more worked/taken labels.",
    promotedPlaybooks.length ? `Prefer playbooks showing edge: ${promotedPlaybooks.map((item) => item.key).join(", ")}.` : "No playbook promotion yet; scanner evidence leads.",
    suppressedSymbols.length ? `Suppress noisy symbols until confirmation improves: ${suppressedSymbols.map((item) => item.key).join(", ")}.` : "No suppression list yet.",
  ];
  return { promotedPlaybooks, demotedPlaybooks, boostedSymbols, suppressedSymbols, rules };
}

function rankHitsWithLearning(hits: ScannerHit[], learning: MorningLearningSnapshot, catalysts: MorningCatalyst[]): ScannerHit[] {
  const playbookScores = new Map<string, number>();
  learning.playbookEvolution.promotedPlaybooks.forEach((item) => playbookScores.set(item.key, 6 + item.score));
  learning.playbookEvolution.demotedPlaybooks.forEach((item) => playbookScores.set(item.key, -6 - item.positive));
  const symbolScores = new Map<string, number>();
  learning.playbookEvolution.boostedSymbols.forEach((item) => symbolScores.set(item.key, 8 + item.score));
  learning.playbookEvolution.suppressedSymbols.forEach((item) => symbolScores.set(item.key, -8 - item.positive));
  const catalystPenalty = new Map<string, number>();
  catalysts.forEach((event) => {
    const penalty = event.impactLabel === "CRITICAL" ? 10 : event.impactLabel === "HIGH" ? 6 : event.impactLabel === "MED" ? 3 : 0;
    catalystPenalty.set(event.ticker, Math.max(catalystPenalty.get(event.ticker) ?? 0, penalty));
  });
  return [...hits].sort((a, b) => learningAdjustedScore(b, playbookScores, symbolScores, catalystPenalty) - learningAdjustedScore(a, playbookScores, symbolScores, catalystPenalty));
}

function buildResearchSetups(
  rankedHits: ScannerHit[],
  topPlays: ScannerHit[],
  watchlist: ScannerHit[],
  risk: MorningRiskState,
) {
  const executionBlocked = risk.killSwitchActive || risk.permission === "BLOCK" || risk.dailyDrawdown >= 0.02;
  if (!executionBlocked) return [];
  const used = new Set([...topPlays, ...watchlist].map((hit) => hit.symbol));
  return rankedHits
    .filter((hit) => !used.has(hit.symbol))
    .slice(0, 6)
    .map((hit) => ({
      ...hit,
      permission: "WAIT" as const,
      blockReasons: [
        "Research only while risk is blocked or locked.",
        ...(hit.blockReasons ?? []).slice(0, 3),
      ],
    }));
}

function learningAdjustedScore(
  hit: ScannerHit,
  playbookScores: Map<string, number>,
  symbolScores: Map<string, number>,
  catalystPenalty: Map<string, number>,
) {
  const playbook = String(hit.playbook || hit.regime || "Unknown");
  const baseScore = hit.eliteScore != null
    ? Number(hit.eliteScore)
    : Number(hit.confidence ?? 0);
  const expectancyBoost = hit.expectancy?.scoreBoost ?? 0;
  return baseScore
    + expectancyBoost
    + (symbolScores.get(hit.symbol) ?? 0)
    + (playbookScores.get(playbook) ?? 0)
    - (catalystPenalty.get(hit.symbol) ?? 0);
}

function rankedScorecard(
  grouped: Map<string, Record<string, number>>,
  positiveActions: string[],
  cautionActions: string[],
  note: string,
): MorningScorecardItem[] {
  return [...grouped.entries()]
    .map(([key, counts]) => {
      const positive = positiveActions.reduce((sum, action) => sum + (counts[action] ?? 0), 0);
      const caution = cautionActions.reduce((sum, action) => sum + (counts[action] ?? 0), 0);
      return { key, positive, caution, score: positive - caution, note };
    })
    .filter((item) => item.positive + item.caution > 0 && item.positive > 0)
    .sort((a, b) => b.positive - a.positive || b.score - a.score || a.caution - b.caution);
}

function groupCounts<T extends "symbol" | "playbook">(rows: Array<Record<T, string> & { action: string; count: number }>, key: T) {
  const grouped = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const bucket = grouped.get(row[key]) ?? {};
    bucket[row.action] = (bucket[row.action] ?? 0) + Number(row.count ?? 0);
    grouped.set(row[key], bucket);
  }
  return grouped;
}

function bestByScore(
  grouped: Map<string, Record<string, number>>,
  positiveActions: string[],
  negativeActions: string[],
) {
  let best: { key: string; score: number; positive: number; negative: number } | null = null;
  for (const [key, counts] of grouped.entries()) {
    const positive = positiveActions.reduce((sum, action) => sum + (counts[action] ?? 0), 0);
    const negative = negativeActions.reduce((sum, action) => sum + (counts[action] ?? 0), 0);
    const score = positive - negative;
    if (positive + negative < 2) continue;
    if (!best || score > best.score) best = { key, score, positive, negative };
  }
  return best;
}

function buildSessionScoreSummary(
  feedbackCount: number,
  closedTrades: number,
  worked: number,
  failed: number,
  missed: number,
  ruleBreaks: number,
  totalPl: number,
  totalR: number,
) {
  if (feedbackCount === 0 && closedTrades === 0) {
    return "No end-of-session review has been logged yet. Mark worked, failed, missed, and rule-broken plays so tomorrow's brief adapts.";
  }
  const parts = [`${feedbackCount} brief label${feedbackCount === 1 ? "" : "s"}`, `${closedTrades} closed journal trade${closedTrades === 1 ? "" : "s"}`];
  if (worked) parts.push(`${worked} worked`);
  if (failed) parts.push(`${failed} failed`);
  if (missed) parts.push(`${missed} missed`);
  if (ruleBreaks) parts.push(`${ruleBreaks} rule break${ruleBreaks === 1 ? "" : "s"}`);
  parts.push(`P&L ${formatUsd(totalPl)}, R ${totalR.toFixed(2)}`);
  return parts.join(". ") + ".";
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatUsd(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2,
  }).format(amount);
}

function sydneyDateKey(iso: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(iso));
}

function emptyOutcomeGrade(summary: string, briefId: string | null = null, generatedAt: string | null = null): MorningOutcomeGrade {
  return {
    briefId,
    gradedAt: new Date().toISOString(),
    generatedAt,
    totalPlays: 0,
    worked: 0,
    failed: 0,
    missed: 0,
    invalidated: 0,
    unreviewed: 0,
    closedTrades: 0,
    totalPl: 0,
    totalR: 0,
    grade: "INC",
    summary,
    plays: [],
  };
}

function resolveOutcomeVerdict(
  action: string | null,
  r: number,
  pl: number,
): MorningOutcomeGrade["plays"][number]["verdict"] {
  if (action === "worked" || action === "taken") return "worked";
  if (action === "failed" || action === "rule_broken") return "failed";
  if (action === "missed") return "missed";
  if (action === "invalidated" || action === "ignored") return "invalidated";
  if (r >= 0.5 || pl > 0) return "worked";
  if (r <= -0.5 || pl < 0) return "failed";
  return "unreviewed";
}

function resolveBriefGrade(
  worked: number,
  failed: number,
  missed: number,
  invalidated: number,
  unreviewed: number,
  totalR: number,
): MorningOutcomeGrade["grade"] {
  const reviewed = worked + failed + missed + invalidated;
  if (reviewed === 0 || unreviewed > reviewed) return "INC";
  const score = worked * 2 + invalidated * 0.5 - failed * 1.5 - missed + totalR;
  if (score >= 4) return "A";
  if (score >= 1.5) return "B";
  if (score >= -1) return "C";
  return "D";
}

function buildOutcomeGradeSummary(
  grade: MorningOutcomeGrade["grade"],
  worked: number,
  failed: number,
  missed: number,
  invalidated: number,
  unreviewed: number,
  totalPl: number,
  totalR: number,
) {
  if (grade === "INC") return `${unreviewed} play${unreviewed === 1 ? "" : "s"} still need review; current outcome is ${worked} worked, ${failed} failed, ${missed} missed.`;
  return `Grade ${grade}: ${worked} worked, ${failed} failed, ${missed} missed, ${invalidated} invalidated. Journal result ${formatUsd(totalPl)}, ${totalR.toFixed(2)}R.`;
}

function expectancySql(groupExpression: string) {
  return `
    SELECT ${groupExpression} AS key,
           COUNT(*)::int AS sample,
           COUNT(*) FILTER (WHERE outcome = 'win' OR COALESCE(pl::numeric, 0) > 0)::int AS wins,
           COALESCE(AVG(COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0)), 0)::text AS avg_r,
           COALESCE(SUM(COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0)), 0)::text AS total_r,
           COALESCE(SUM(GREATEST(COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0), 0)), 0)::text AS gross_win_r,
           ABS(COALESCE(SUM(LEAST(COALESCE(r_multiple::numeric, dynamic_r::numeric, normalized_r::numeric, 0), 0)), 0))::text AS gross_loss_r
    FROM journal_entries
    WHERE workspace_id = $1
      AND is_open = FALSE
      AND COALESCE(exit_date, trade_date) >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY ${groupExpression}
    ORDER BY sample DESC
    LIMIT 40
  `;
}

function expectancyItemFromRow(row: any): MorningExpectancyItem {
  const sample = Number(row.sample ?? 0);
  const wins = Number(row.wins ?? 0);
  const avgR = Number(row.avg_r ?? 0);
  const totalR = Number(row.total_r ?? 0);
  const grossWin = Number(row.gross_win_r ?? 0);
  const grossLoss = Number(row.gross_loss_r ?? 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0;
  return {
    key: String(row.key || "Unknown"),
    sample,
    winRate: sample > 0 ? wins / sample : null,
    avgR,
    totalR,
    profitFactor,
    note: `${sample} trade sample, avg ${avgR.toFixed(2)}R, total ${totalR.toFixed(2)}R.`,
  };
}

function buildExpectancyNotes(
  sampleTrades: number,
  symbols: MorningExpectancyItem[],
  playbooks: MorningExpectancyItem[],
) {
  if (sampleTrades === 0) return ["No closed-trade sample found yet; use scanner evidence and manual review labels first."];
  const bestSymbol = symbols.filter((item) => item.sample >= 2).sort((a, b) => b.avgR - a.avgR)[0];
  const weakPlaybook = playbooks.filter((item) => item.sample >= 2).sort((a, b) => a.avgR - b.avgR)[0];
  return [
    `${sampleTrades} closed journal trades are feeding expectancy over the last 90 days.`,
    bestSymbol ? `Best symbol expectancy: ${bestSymbol.key} at ${bestSymbol.avgR.toFixed(2)}R average.` : "Need at least two trades per symbol before symbol expectancy becomes meaningful.",
    weakPlaybook ? `Weakest playbook sample: ${weakPlaybook.key} at ${weakPlaybook.avgR.toFixed(2)}R average; demand stronger confirmation.` : "Playbook expectancy still needs a deeper sample.",
  ];
}

async function buildBriefComparison(
  currentBriefId: string,
  market: Market,
  timeframe: string,
  deskState: DeskState,
  topPlays: ScannerHit[],
  catalysts: MorningCatalyst[],
): Promise<MorningBriefComparison> {
  const empty: MorningBriefComparison = {
    previousBriefId: null,
    previousGeneratedAt: null,
    deskStateChanged: false,
    previousDeskState: null,
    newTopPlays: topPlays.map((play) => play.symbol),
    droppedTopPlays: [],
    retainedTopPlays: [],
    newCatalystSymbols: [...new Set(catalysts.map((event) => event.ticker))],
    summary: "No previous brief snapshot found yet. This brief starts the comparison trail.",
  };

  try {
    const rows = await q<{ brief_id: string; generated_at: string; desk_state: DeskState; snapshot: MorningBrief }>(`
      SELECT brief_id, generated_at, desk_state, snapshot
      FROM admin_morning_briefs
      WHERE brief_id != $1
        AND market = $2
        AND timeframe = $3
      ORDER BY generated_at DESC
      LIMIT 1
    `, [currentBriefId, market, timeframe]);

    const previous = rows[0];
    if (!previous?.snapshot) return empty;

    const previousTop = new Set((previous.snapshot.topPlays ?? []).map((play) => play.symbol));
    const currentTop = new Set(topPlays.map((play) => play.symbol));
    const previousCatalysts = new Set((previous.snapshot.catalysts ?? []).map((event) => event.ticker));
    const currentCatalysts = [...new Set(catalysts.map((event) => event.ticker))];

    const newTopPlays = [...currentTop].filter((symbol) => !previousTop.has(symbol));
    const droppedTopPlays = [...previousTop].filter((symbol) => !currentTop.has(symbol));
    const retainedTopPlays = [...currentTop].filter((symbol) => previousTop.has(symbol));
    const newCatalystSymbols = currentCatalysts.filter((symbol) => !previousCatalysts.has(symbol));
    const deskStateChanged = previous.desk_state !== deskState;

    return {
      previousBriefId: previous.brief_id,
      previousGeneratedAt: previous.generated_at,
      deskStateChanged,
      previousDeskState: previous.desk_state,
      newTopPlays,
      droppedTopPlays,
      retainedTopPlays,
      newCatalystSymbols,
      summary: buildComparisonSummary(deskStateChanged, previous.desk_state, deskState, newTopPlays, droppedTopPlays, newCatalystSymbols),
    };
  } catch {
    return empty;
  }
}

function buildComparisonSummary(
  changed: boolean,
  previousState: DeskState,
  currentState: DeskState,
  newTopPlays: string[],
  droppedTopPlays: string[],
  newCatalystSymbols: string[],
) {
  const parts: string[] = [];
  if (changed) parts.push(`Desk shifted from ${previousState} to ${currentState}.`);
  if (newTopPlays.length) parts.push(`New top plays: ${newTopPlays.join(", ")}.`);
  if (droppedTopPlays.length) parts.push(`Dropped from top plays: ${droppedTopPlays.join(", ")}.`);
  if (newCatalystSymbols.length) parts.push(`Fresh catalyst symbols: ${newCatalystSymbols.join(", ")}.`);
  return parts.length ? parts.join(" ") : "No major change from the previous saved brief.";
}