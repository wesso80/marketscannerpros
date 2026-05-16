/**
 * lib/admin/portfolio-lab/simulateCycle.ts
 *
 * Orchestrator for the ARCA Portfolio Lab. One "cycle" =
 *   1. Mark every open position against the latest edge-packet snapshot price.
 *   2. Process SL/TP exits (positionEngine.markAndMaybeExit).
 *   3. Trigger / fill any waiting LIMIT_SIM / STOP_SIM orders whose
 *      trigger price has been reached.
 *   4. Ask the decision engine for new candidates and create planned
 *      orders for the best ones (subject to risk caps).
 *   5. Persist a fresh portfolio_snapshot.
 *
 * Pure paper. No broker. No order routing.
 */

import { runDecisionEngine, type SelectedCandidate } from "./decisionEngine";
import {
  insertSnapshot,
  listOrders,
  listOpenPositions,
  updatePortfolioBalances,
  getDefaultPortfolio,
} from "./portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "./constants";
import { createDefaultArcaPortfolio } from "./createPortfolio";
import {
  createSimulatedOrder,
  fillOrderAndOpenPosition,
  shouldFill,
} from "./simulatedOrderEngine";
import { markAndMaybeExit } from "./positionEngine";
import { sizeForPortfolio } from "./positionSizing";
import { checkPreTrade, emitRiskEventIfBreached } from "./riskEngine";
import { writeJournal } from "./journalEngine";
import { captureBenchmarkSnapshot } from "./benchmarkEngine";
import { rollupPlaybookPerformance } from "./playbookEngine";
import { loadEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import type { ArcaPortfolio, ArcaPosition, SimulateCycleResult } from "./types";
import { runDebateAndRecord, linkDebateToOrder } from "@/lib/admin/arca-brain/adversarialDebate";
import {
  recordNoTradeDecisionFromCandidate,
  type RejectionStage,
} from "@/lib/admin/arca-brain/recordNoTradeDecisionFromCandidate";
import { recentMistakeFrequency } from "@/lib/admin/arca-brain/mistakeLabeler";
import { gradeCandidate, recordAllocationDecision } from "@/lib/admin/arca-brain/capitalAllocation";
import { computeInformationEdge, scoreInformationEdge } from "@/lib/admin/arca-brain/informationEdge";
import { deriveInformationEdge } from "@/lib/admin/arca-brain/deriveInformationEdge";
import { getRegimeMatrix } from "@/lib/admin/arca-brain/regimePlaybookMatrix";
import { evaluateRegimePlaybook } from "@/lib/admin/arca-brain/regimePlaybookDecision";
import type { DataFreshnessStatus, InformationEdgeBand, RegimePlaybookMatrixRow } from "@/lib/admin/arca-brain/types";
import { q } from "@/lib/db";

/**
 * Narrow the free-text freshness on an edge-packet row to the
 * DataFreshnessStatus union the brain expects. Anything unknown
 * collapses to "unknown" so prosecutor weighting cannot be silently
 * skipped by malformed input.
 */
function narrowFreshness(s: string | null | undefined): DataFreshnessStatus {
  switch ((s || "").toLowerCase()) {
    case "fresh":
    case "realtime":
    case "real-time":
      return "fresh";
    case "delayed":
    case "eod":
      return "delayed";
    case "stale":
      return "stale";
    default:
      return "unknown";
  }
}

/**
 * Sizing/debate engines use upper-case "LONG" | "SHORT";
 * `recordNoTradeDecisionFromCandidate` expects the lower-case journal form.
 * Centralised here so the cast is honest and reviewable.
 */
function narrowSide(s: "LONG" | "SHORT"): "long" | "short" {
  return s === "LONG" ? "long" : "short";
}

export interface SimulateCycleOptions {
  workspaceId: string;
  maxNewIdeas?: number;
  sinceMinutes?: number;
  /** Current market regime label (e.g. RISK_ON_TREND). When omitted,
   *  every candidate is evaluated against an UNKNOWN_REGIME decision. */
  currentRegime?: string | null;
  /** When true (default) UNKNOWN_REGIME blocks the trade. When false
   *  it runs at reduced size. */
  strictUnknownRegime?: boolean;
}

export async function simulateArcaCycle(opts: SimulateCycleOptions): Promise<SimulateCycleResult> {
  const portfolio = await ensurePortfolio(opts.workspaceId);
  const notes: string[] = [];
  let ordersCreated = 0;
  let ordersTriggered = 0;
  let ordersCancelled = 0;
  let positionsOpened = 0;
  let positionsMarked = 0;
  let positionsClosed = 0;
  let riskEventsCreated = 0;
  let rejections = 0;
  let noTradeRowsWritten = 0;

  // Shared dedupe set so the same symbol+stage isn't journaled twice
  // in one cycle (e.g. when a row trips both a gate and a downstream
  // block). Keys are `${symbol}::${stage}`. Lives only for this cycle.
  const rejectionLog = new Set<string>();

  // Build a symbol → latest price map from recent edge-packet snapshots.
  const recent = await loadEdgePackets({
    workspaceId: opts.workspaceId,
    since: new Date(Date.now() - (opts.sinceMinutes ?? 720) * 60_000).toISOString(),
    limit: 500,
  });
  const priceBySymbol = new Map<string, number>();
  for (const r of recent) {
    if (priceBySymbol.has(r.symbol)) continue;
    const p = (r.packetJson as unknown as { snapshot?: { price?: number } }).snapshot?.price;
    if (Number.isFinite(p)) priceBySymbol.set(r.symbol, Number(p));
  }

  // 1+2. Mark & maybe exit open positions.
  const opens = await listOpenPositions(opts.workspaceId, portfolio.id);
  let runningPortfolio = portfolio;
  for (const pos of opens) {
    const px = priceBySymbol.get(pos.symbol);
    if (!Number.isFinite(px)) {
      notes.push(`skip_mark:${pos.symbol}:no_price`);
      continue;
    }
    const res = await markAndMaybeExit({
      portfolio: runningPortfolio,
      position: pos,
      currentPrice: px!,
    });
    positionsMarked++;
    if (res.exit) positionsClosed++;
    // Refresh portfolio after each cash-impacting operation.
    runningPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  }

  // 3. Trigger waiting orders.
  const waiting = await listOrders(opts.workspaceId, portfolio.id, {
    status: ["WAITING_FOR_TRIGGER", "PLANNED"],
  });
  for (const order of waiting) {
    const px = priceBySymbol.get(order.symbol);
    if (!Number.isFinite(px)) continue;
    if (!shouldFill(order, px!)) continue;
    await fillOrderAndOpenPosition({
      portfolio: runningPortfolio,
      order,
      currentPrice: px!,
    });
    ordersTriggered++;
    positionsOpened++;
    runningPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  }

  // 4. New candidates → planned/limit orders.
  const decision = await runDecisionEngine({
    portfolio: runningPortfolio,
    maxNewIdeas: opts.maxNewIdeas ?? 5,
    sinceMinutes: opts.sinceMinutes ?? 720,
  });

  // Load the Regime-Playbook Matrix row once per cycle. If no regime
  // was supplied, every candidate will resolve to UNKNOWN_REGIME and
  // the strict policy will gate it.
  const currentRegime = opts.currentRegime ?? null;
  const strictUnknownRegime = opts.strictUnknownRegime !== false;
  let regimeMatrixRow: RegimePlaybookMatrixRow | null = null;
  if (currentRegime) {
    regimeMatrixRow = await getRegimeMatrix(opts.workspaceId, currentRegime).catch(() => null);
  }

  for (const cand of decision.selected) {
    const sizing = sizeForPortfolio(runningPortfolio, {
      entry: cand.entry,
      stop: cand.stop,
      side: cand.side,
      assetClass: cand.assetClass,
    });
    if (!sizing.ok) {
      rejections++;
      const res = await recordNoTradeDecisionFromCandidate({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        symbol: cand.row.symbol,
        setupType: cand.row.setupType || null,
        side: narrowSide(cand.side),
        assetClass: cand.assetClass,
        rejectionStage: "SIZING_FAILED",
        rejectionReason: `Could not size: ${sizing.reason ?? "unknown"}`,
        edgePacketId: cand.row.packetId,
        playbookId: cand.row.setupType || null,
        regime: opts.currentRegime ?? null,
        entry: cand.entry,
        stopLoss: cand.stop,
        takeProfit: cand.tp1 ?? null,
        confidence: cand.row.trustAdjustedScore,
        dedupeKeys: rejectionLog,
      });
      if (res.written) noTradeRowsWritten++;
      continue;
    }
    const pre = await checkPreTrade({
      portfolio: runningPortfolio,
      assetClass: cand.assetClass,
      riskDollars: sizing.riskDollars,
      notional: sizing.notional,
    });
    if (!pre.ok) {
      rejections++;
      // Map portfolio_heat-style reasons to a more specific stage when
      // detectable; otherwise fall back to PRE_TRADE_RISK.
      const reasonText = pre.reasons.join("|").toLowerCase();
      const stage: RejectionStage =
        reasonText.includes("heat") || reasonText.includes("open_risk")
          ? "PORTFOLIO_HEAT"
          : reasonText.includes("cap") || reasonText.includes("cash")
            ? "RISK_CAP"
            : reasonText.includes("event")
              ? "EVENT_RISK"
              : reasonText.includes("dup") || reasonText.includes("exists")
                ? "DUPLICATE_EXPOSURE"
                : "PRE_TRADE_RISK";
      const res = await recordNoTradeDecisionFromCandidate({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        symbol: cand.row.symbol,
        setupType: cand.row.setupType || null,
        side: narrowSide(cand.side),
        assetClass: cand.assetClass,
        rejectionStage: stage,
        rejectionReason: `Pre-trade risk check failed: ${pre.reasons.join(", ")}`,
        edgePacketId: cand.row.packetId,
        playbookId: cand.row.setupType || null,
        regime: opts.currentRegime ?? null,
        entry: cand.entry,
        stopLoss: cand.stop,
        takeProfit: cand.tp1 ?? null,
        hypotheticalSizeDollars: sizing.notional,
        confidence: cand.row.trustAdjustedScore,
        metadata: { riskDollars: sizing.riskDollars, notional: sizing.notional },
        dedupeKeys: rejectionLog,
      });
      if (res.written) noTradeRowsWritten++;
      await emitRiskEventIfBreached({
        portfolio: runningPortfolio,
        eventType: "PRE_TRADE_BLOCK",
        severity: "warning",
        message: `Blocked ${cand.row.symbol}: ${pre.reasons.join(", ")}`,
        affectedSymbol: cand.row.symbol,
      });
      riskEventsCreated++;
      continue;
    }

    // ── Regime-Playbook Matrix gate (ARCA meta-brain) ──
    // Block / reduce / wait based on whether the current regime allows
    // this candidate's playbook. Runs before Information Edge so that
    // disabled playbooks never spend compute on the brain stack.
    const playbookId = cand.row.setupType || null;
    const regimeDecision = evaluateRegimePlaybook(regimeMatrixRow, playbookId, {
      strict: strictUnknownRegime,
      assetClass: cand.assetClass,
    });

    if (
      regimeDecision.status === "DISABLED" ||
      regimeDecision.status === "WAIT_FOR_CONFIRMATION" ||
      (regimeDecision.status === "UNKNOWN_REGIME" && strictUnknownRegime)
    ) {
      rejections++;
      const sizingForRow = sizeForPortfolio(runningPortfolio, {
        entry: cand.entry,
        stop: cand.stop,
        side: cand.side,
        assetClass: cand.assetClass,
      });
      const stage: RejectionStage =
        regimeDecision.status === "DISABLED" ? "DISABLED_PLAYBOOK" :
        regimeDecision.status === "WAIT_FOR_CONFIRMATION" ? "WAIT_FOR_CONFIRMATION" :
        "UNKNOWN_REGIME";
      const res = await recordNoTradeDecisionFromCandidate({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        symbol: cand.row.symbol,
        setupType: cand.row.setupType || null,
        side: narrowSide(cand.side),
        assetClass: cand.assetClass,
        rejectionStage: stage,
        rejectionReason: regimeDecision.reason,
        edgePacketId: cand.row.packetId,
        playbookId,
        regime: regimeDecision.regime ?? opts.currentRegime ?? null,
        regimePlaybookDecision: regimeDecision,
        dataFreshness: narrowFreshness(cand.row.freshness),
        entry: cand.entry,
        stopLoss: cand.stop,
        takeProfit: cand.tp1 ?? null,
        hypotheticalSizeDollars: sizingForRow.ok ? sizingForRow.notional : null,
        confidence: cand.row.trustAdjustedScore,
        metadata: { sourceRuleId: regimeDecision.sourceRuleId ?? null },
        dedupeKeys: rejectionLog,
      });
      if (res.written) noTradeRowsWritten++;
      continue;
    }

    // ── Information Edge Score (ARCA meta-brain) ──
    // Compute BEFORE capital allocation and debate so both gates see
    // the real band. Missing inputs are reported honestly via
    // derivation confidence and recorded in the journal/no-trade row.
    const derived = deriveInformationEdge(cand.row.packetJson);
    const { score: edgeScore, band: edgeBand } = computeInformationEdge(derived.inputs);
    // Persist best-effort — never break the cycle on a failed insert.
    scoreInformationEdge({
      workspaceId: opts.workspaceId,
      packetId: cand.row.packetId,
      symbol: cand.row.symbol,
      playbookId: cand.row.setupType || null,
      inputs: derived.inputs,
    }).catch(() => undefined);

    // ── Capital Allocation gate (ARCA meta-brain) ──
    // Grade the candidate BEFORE the debate so a NO_TRADE grade
    // short-circuits without spending debate state, and so the
    // grade-derived risk % can scale the prosecutor's view of size.
    const mistakes7d = await recentMistakeFrequency(opts.workspaceId, 7).catch(() => 0);
    const realFreshness = narrowFreshness(cand.row.freshness);
    const baseRiskPct = Math.max(0.1, Math.min(2, portfolio.settings.maxSingleTradeRiskPct ?? portfolio.settings.riskPerTradePct ?? 1));
    // Translate the regime decision into a 0..100 quality score the
    // brain's grading + debate inputs expect. Decisions that block the
    // trade outright have already been handled above.
    const regimeQualityScore =
      regimeDecision.status === "ENABLED" ? 75 :
      regimeDecision.status === "REDUCE_SIZE" ? 50 :
      regimeDecision.status === "UNKNOWN_PLAYBOOK" ? 45 :
      40; // UNKNOWN_REGIME (non-strict)
    const regimeSizeAdjustmentReason =
      regimeDecision.status === "ENABLED"
        ? null
        : `regime_matrix=${regimeDecision.status} regime=${regimeDecision.regime ?? "null"} playbook=${playbookId ?? "null"} reason="${regimeDecision.reason}"`;
    const allocPre = gradeCandidate({
      workspaceId: opts.workspaceId,
      portfolioId: portfolio.id,
      debateId: null,
      symbol: cand.row.symbol,
      playbookId: cand.row.setupType || null,
      playbookExpectancy: null,
      regimeQuality: regimeQualityScore,
      dataFreshness: realFreshness,
      confidence: clamp(cand.row.trustAdjustedScore, 0, 100),
      informationEdgeScore: edgeScore,
      personalFitScore: null,
      drawdownState: "normal",
      correlationExposure: null,
      eventRisk: "none",
      recentMistakeFrequency: mistakes7d,
      maxRiskPercent: baseRiskPct,
      equityDollars: runningPortfolio.totalEquity,
    });

    // OBVIOUS_NOISE override: information edge gates the allocation
    // even when the composite formula doesn't fall below floor. This
    // codifies the rule "if everyone sees it, don't take it" unless
    // confidence is exceptional (>=90) AND data is fresh.
    let infoEdgeOverride: { grade: "NO_TRADE"; reason: string } | null = null;
    if (edgeBand === "OBVIOUS_NOISE") {
      const exceptional = clamp(cand.row.trustAdjustedScore, 0, 100) >= 90 && realFreshness === "fresh";
      if (!exceptional) {
        infoEdgeOverride = {
          grade: "NO_TRADE",
          reason: `information_edge_band=OBVIOUS_NOISE score=${edgeScore} missing=[${derived.missingInputs.join(",")}]`,
        };
      }
    }

    if (allocPre.grade === "NO_TRADE" || infoEdgeOverride) {
      rejections++;
      const stage: RejectionStage = infoEdgeOverride
        ? "INFO_EDGE_OBVIOUS_NOISE"
        : "CAPITAL_ALLOCATION";
      const reason = infoEdgeOverride
        ? infoEdgeOverride.reason
        : `capital_allocation=NO_TRADE: ${allocPre.reason}`;
      const res = await recordNoTradeDecisionFromCandidate({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        symbol: cand.row.symbol,
        setupType: cand.row.setupType || null,
        side: narrowSide(cand.side),
        assetClass: cand.assetClass,
        rejectionStage: stage,
        rejectionReason: reason,
        edgePacketId: cand.row.packetId,
        playbookId,
        regime: regimeDecision.regime ?? opts.currentRegime ?? null,
        regimePlaybookDecision: regimeDecision,
        informationEdge: {
          score: edgeScore,
          band: edgeBand as InformationEdgeBand,
          missingInputs: derived.missingInputs,
          derivationConfidence: derived.confidence,
        },
        capitalAllocation: {
          grade: allocPre.grade,
          reason: allocPre.reason,
          riskPercent: allocPre.riskPercent,
        },
        dataFreshness: realFreshness,
        entry: cand.entry,
        stopLoss: cand.stop,
        takeProfit: cand.tp1 ?? null,
        hypotheticalSizeDollars: sizing.notional,
        confidence: cand.row.trustAdjustedScore,
        dedupeKeys: rejectionLog,
      });
      if (res.written) noTradeRowsWritten++;
      continue;
    }

    // ── Adversarial debate gate (ARCA meta-brain) ──
    // No simulated order may be created without a debate record.
    const debateOutcome = await runDebateAndRecord(
      {
        symbol: cand.row.symbol,
        assetClass: cand.assetClass,
        side: cand.side,
        entry: cand.entry,
        stop: cand.stop,
        takeProfit: cand.tp1 ?? null,
        playbookId: cand.row.setupType || null,
        sourceEdgePacketId: cand.row.packetId,
        confidence: clamp(cand.row.trustAdjustedScore, 0, 100),
        opportunityRank: clamp(cand.row.opportunityRankScore, 0, 100),
        trustAdjusted: clamp(cand.row.trustAdjustedScore, 0, 100),
        thesis: String((cand.row as unknown as { thesisStatus?: string }).thesisStatus ?? ""),
      },
      {
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        freshness: realFreshness,
        informationEdgeScore: edgeScore,
        informationEdgeBand: edgeBand as InformationEdgeBand,
        regimeQuality: regimeQualityScore,
        recentMistakeFrequency: mistakes7d,
        correlationExposure: 0,
        eventRisk: "none",
        repeatedLossSamePlaybook: false,
        doctrineConflictRuleId: null,
        preExistingRiskBlocks: [],
      },
    );

    if (!debateOutcome.shouldCreateOrder) {
      rejections++;
      const debateReason = debateOutcome.record.rejectedReason ?? debateOutcome.record.prosecutorCase;
      // DebateDecision union has no "PROSECUTOR_WIN"; the prosecutor wins
      // by producing a SKIP. WAIT_FOR_CONFIRMATION is a deferral, not a
      // prosecutor verdict — record it as a generic debate reject.
      const stage: RejectionStage =
        debateOutcome.record.finalDecision === "SKIP"
          ? "PROSECUTOR_REJECT"
          : "DEBATE_REJECT";
      const res = await recordNoTradeDecisionFromCandidate({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        symbol: cand.row.symbol,
        setupType: cand.row.setupType || null,
        side: narrowSide(cand.side),
        assetClass: cand.assetClass,
        rejectionStage: stage,
        rejectionReason: debateReason,
        edgePacketId: cand.row.packetId,
        playbookId,
        regime: regimeDecision.regime ?? opts.currentRegime ?? null,
        regimePlaybookDecision: regimeDecision,
        informationEdge: {
          score: edgeScore,
          band: edgeBand as InformationEdgeBand,
          missingInputs: derived.missingInputs,
          derivationConfidence: derived.confidence,
        },
        capitalAllocation: {
          grade: allocPre.grade,
          reason: allocPre.reason,
          riskPercent: allocPre.riskPercent,
        },
        debate: {
          id: debateOutcome.record.id,
          reason: debateReason,
          finalDecision: debateOutcome.record.finalDecision,
        },
        dataFreshness: realFreshness,
        entry: cand.entry,
        stopLoss: cand.stop,
        takeProfit: cand.tp1 ?? null,
        hypotheticalSizeDollars: sizing.notional,
        confidence: clamp(cand.row.trustAdjustedScore, 0, 100),
        dedupeKeys: rejectionLog,
      });
      if (res.written) noTradeRowsWritten++;
      continue;
    }

    // Apply size multiplier from the debate (SIZE_DOWN may shrink notional),
    // then further scale by the Capital Allocation grade's risk % so an
    // A_GRADE uses full size and B/C/EXPERIMENTAL are throttled. The
    // regime-playbook decision multiplies on top: REDUCE_SIZE or any
    // UNKNOWN_* result throttles the position even when the debate would
    // green-light full size.
    const mult = Math.max(0.1, Math.min(1, debateOutcome.sizeMultiplier || 1));
    const allocRatio = baseRiskPct > 0 ? allocPre.riskPercent / baseRiskPct : 1;
    const regimeMult = Math.max(0, Math.min(1, regimeDecision.sizeMultiplier));
    const combined = Math.max(0.05, Math.min(1, mult * allocRatio * regimeMult));
    const debatedQty = sizing.quantity * combined;
    const debatedNotional = sizing.notional * combined;

    // Create as LIMIT_SIM with trigger = entry, waiting for price to come.
    const order = await createSimulatedOrder({
      portfolio: runningPortfolio,
      symbol: cand.row.symbol,
      assetClass: cand.assetClass,
      side: cand.side,
      orderType: "LIMIT_SIM",
      plannedEntry: cand.entry,
      triggerPrice: cand.entry,
      quantity: debatedQty,
      notional: debatedNotional,
      stopLoss: cand.stop,
      takeProfit1: cand.tp1,
      takeProfit2: cand.tp2,
      takeProfit3: cand.tp3,
      sourceEdgePacketId: cand.row.packetId,
      playbookId: cand.row.setupType || null,
      createdReason: `ARCA selected: rank=${cand.row.opportunityRankScore.toFixed(1)} thesis=${cand.row.thesisStatus} rr1=${cand.rrToTp1 ?? "n/a"} debate=${debateOutcome.record.finalDecision}(x${mult}) info_edge=${edgeScore}(${edgeBand}) regime=${regimeDecision.regime ?? "unknown"}/${regimeDecision.status}(x${regimeMult})`,
      arcaConfidence: debateOutcome.record.confidenceAfterDebate,
    });

    // Stamp the order with its authorising debate id, and link back.
    try {
      await q(
        `UPDATE arca_simulated_orders SET debate_id = $1 WHERE workspace_id = $2 AND id = $3`,
        [debateOutcome.record.id, opts.workspaceId, (order as unknown as { id: string }).id],
      );
      await linkDebateToOrder(opts.workspaceId, debateOutcome.record.id, (order as unknown as { id: string }).id);
    } catch {
      // Soft-fail: the cycle continues; an admin alert is preferable to a hard cycle break.
    }

    // Persist the Capital Allocation decision tied to this debate so the
    // grade distribution is auditable per cycle and per symbol.
    try {
      await recordAllocationDecision({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        debateId: debateOutcome.record.id,
        symbol: cand.row.symbol,
        playbookId: cand.row.setupType || null,
        playbookExpectancy: null,
        regimeQuality: regimeQualityScore,
        dataFreshness: realFreshness,
        confidence: clamp(cand.row.trustAdjustedScore, 0, 100),
        informationEdgeScore: edgeScore,
        personalFitScore: null,
        drawdownState: "normal",
        correlationExposure: null,
        eventRisk: "none",
        recentMistakeFrequency: mistakes7d,
        maxRiskPercent: baseRiskPct,
        equityDollars: runningPortfolio.totalEquity,
        sizeAdjustmentReason: regimeSizeAdjustmentReason,
        externalSizeMultiplier: regimeMult,
      });
    } catch {
      // Soft-fail.
    }
    ordersCreated++;
  }

  // Per-row no-trade rejections from the decision-engine gate. Every
  // candidate that the gate dropped must produce its own
  // arca_no_trade_alpha row AND its own REJECTED journal entry — no
  // silent drops. The summary journal below is in addition to (not
  // instead of) the per-symbol rows.
  const gateReasonHistogram: Record<string, number> = {};
  for (const r of decision.rejected) {
    for (const reason of r.reasons) {
      // Bucket reasons by their leading token (e.g. "thesis_status_DEVELOPING" → "thesis_status")
      const bucket = reason.replace(/(_\d+(\.\d+)?)+$/, "").replace(/_(lt|gt)_.*$/, "");
      gateReasonHistogram[bucket] = (gateReasonHistogram[bucket] ?? 0) + 1;
    }
    const dominant = mapGateReasonToStage(r.reasons);
    const res = await recordNoTradeDecisionFromCandidate({
      workspaceId: opts.workspaceId,
      portfolioId: portfolio.id,
      symbol: r.symbol,
      rejectionStage: dominant,
      rejectionReason: r.reasons.join(", "),
      edgePacketId: r.packetId ?? null,
      regime: opts.currentRegime ?? null,
      // Freshness reasons are explicit in the gate list — surface them.
      dataFreshness:
        r.reasons.some((x) => x === "freshness_stale") ? "stale" :
        r.reasons.some((x) => x === "freshness_unknown") ? "unknown" :
        null,
      metadata: { gateReasons: r.reasons },
      dedupeKeys: rejectionLog,
    });
    if (res.written) noTradeRowsWritten++;
  }
  if (decision.rejected.length > 0) {
    const topHist = Object.entries(gateReasonHistogram)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `  ${k}: ${v}`).join("\n");
    const perRow = decision.rejected
      .slice(0, 25)
      .map((r) => `${r.symbol}: ${r.reasons.join("|")}`)
      .join("\n");
    await writeJournal({
      workspaceId: opts.workspaceId,
      portfolioId: portfolio.id,
      journalType: "REJECTED",
      title: `Rejected ${decision.rejected.length} candidates in cycle (scanned ${decision.scannedPackets})`,
      reasoning: `Top gate reasons:\n${topHist}\n\nPer-symbol detail:\n${perRow}`,
    });
  }

  // 5. Snapshot.
  const closingOpens = await listOpenPositions(opts.workspaceId, portfolio.id);
  const exposure = bucketExposure(closingOpens);
  const finalPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  const unrealised = closingOpens.reduce((s, p) => s + p.unrealisedPnl, 0);
  const equity = round2(finalPortfolio.currentCash + unrealised);
  await updatePortfolioBalances({
    portfolioId: finalPortfolio.id,
    currentCash: finalPortfolio.currentCash,
    realisedPnl: finalPortfolio.realisedPnl,
    unrealisedPnl: round2(unrealised),
    totalEquity: equity,
  });
  const openRiskPct = closingOpens.length === 0 ? 0 : round3((closingOpens.reduce((s, p) => s + p.openRisk, 0) / equity) * 100);
  await insertSnapshot({
    workspaceId: opts.workspaceId,
    portfolioId: finalPortfolio.id,
    cash: finalPortfolio.currentCash,
    totalEquity: equity,
    realisedPnl: finalPortfolio.realisedPnl,
    unrealisedPnl: round2(unrealised),
    dailyPnl: null,
    drawdownPct: round3(Math.min(0, ((equity - finalPortfolio.startingBalance) / finalPortfolio.startingBalance) * 100)),
    exposureEquities: round2(exposure.equity ?? 0),
    exposureCrypto: round2(exposure.crypto ?? 0),
    exposureCommodities: round2(exposure.commodity ?? 0),
    exposureOptions: round2(exposure.options ?? 0),
    exposureFutures: round2(exposure.futures ?? 0),
    openPositionsCount: closingOpens.length,
    openRiskPct,
  });

  // 6. Benchmark + playbook rollup (best-effort; never block the cycle).
  let benchmarkCaptured = false;
  let benchmarkSymbol: string | undefined;
  let playbooksUpdated: number | undefined;
  try {
    const refreshed = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? finalPortfolio;
    const bm = await captureBenchmarkSnapshot({ portfolio: refreshed });
    benchmarkCaptured = bm.ok;
    benchmarkSymbol = bm.benchmarkSymbol;
    if (!bm.ok) notes.push(`benchmark: ${bm.reason ?? "unavailable"}`);
  } catch (err) {
    notes.push(`benchmark error: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const refreshed = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? finalPortfolio;
    const pb = await rollupPlaybookPerformance(refreshed);
    playbooksUpdated = pb.playbooksUpdated;
  } catch (err) {
    notes.push(`playbook rollup error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    portfolioId: finalPortfolio.id,
    cycleAt: new Date().toISOString(),
    ordersCreated,
    ordersTriggered,
    ordersCancelled,
    positionsOpened,
    positionsMarked,
    positionsClosed,
    riskEventsCreated,
    rejections,
    notes,
    benchmarkCaptured,
    benchmarkSymbol,
    playbooksUpdated,
    candidatesScanned: decision.scannedPackets,
    candidatesSelected: decision.selected.length,
    uniqueSymbolsSeen: new Set([...decision.rejected.map((r) => r.symbol), ...decision.selected.map((s) => s.row.symbol)]).size,
    gateRejections: decision.rejected.length,
    gateRejectionReasons: gateReasonHistogram,
    noTradeRowsWritten,
  };
}

async function ensurePortfolio(workspaceId: string): Promise<ArcaPortfolio> {
  const existing = await getDefaultPortfolio(workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (existing) return existing;
  const r = await createDefaultArcaPortfolio(workspaceId);
  return r.portfolio;
}

function bucketExposure(positions: ArcaPosition[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const notional = (p.currentPrice ?? p.averageEntry) * p.quantity;
    out[p.assetClass] = (out[p.assetClass] ?? 0) + notional;
  }
  return out;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Map a list of `decisionEngine.gateRow` reason tokens to the
 * dominant `RejectionStage`. Order of checks matters — data-quality
 * issues outrank thesis/scoring/asset-class blocks because freshness
 * makes every other signal unreliable.
 */
function mapGateReasonToStage(reasons: string[]): RejectionStage {
  const has = (prefix: string) => reasons.some((r) => r.startsWith(prefix));
  if (has("freshness_stale")) return "STALE_DATA";
  if (has("freshness_unknown")) return "MISSING_DATA";
  if (reasons.includes("entry_or_stop_missing")) return "MISSING_TRADE_STRUCTURE";
  if (has("playbook_") && reasons.some((r) => r.endsWith("_disabled"))) return "DISABLED_PLAYBOOK";
  if (has("asset_class_")) return "CAPITAL_ALLOCATION";
  if (has("admin_state_")) return "DATA_TRUST";
  if (reasons.includes("do_nothing_flag")) return "DO_NOTHING";
  if (has("thesis_status_")) return "DO_NOTHING";
  if (has("rank_score_") || has("evidence_") || has("trap_risk_")) return "DATA_TRUST";
  return "DATA_TRUST";
}
