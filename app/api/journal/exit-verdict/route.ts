import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { evaluateExit, type Regime, type TradeState } from '../../../../lib/tradeExitEngine';

type JournalRow = {
  id: number;
  symbol: string;
  asset_class: string | null;
  side: 'LONG' | 'SHORT';
  trade_date: string;
  entry_price: string | number;
  quantity: string | number;
  stop_loss: string | number | null;
  target: string | number | null;
  risk_amount: string | number | null;
  is_open: boolean;
  status: string | null;
  tags: string[] | null;
};

type DecisionPacketRow = {
  packet_id: string;
  signal_score: string | number | null;
  invalidation: string | number | null;
  targets: unknown;
  updated_at: string;
};

type ClosedTradePerformanceRow = {
  r_multiple: string | number | null;
  pl_percent: string | number | null;
  outcome: string | null;
};

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDpTag(tags: string[] = []): string | null {
  for (const tag of tags) {
    if (typeof tag === 'string' && tag.startsWith('dp_') && tag.length > 3) {
      return tag.slice(3);
    }
  }
  return null;
}

function parseTargetFromJson(targets: unknown): number | null {
  if (!targets) return null;
  if (Array.isArray(targets)) {
    for (const item of targets) {
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (item && typeof item === 'object') {
        const maybePrice = parseNumber((item as Record<string, unknown>).price);
        if (maybePrice != null) return maybePrice;
      }
    }
  }
  if (targets && typeof targets === 'object') {
    const obj = targets as Record<string, unknown>;
    const direct = parseNumber(obj.price);
    if (direct != null) return direct;
  }
  return null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

function inferAssetClassFromSymbol(symbol: string): 'crypto' | 'equity' {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USD') || upper.endsWith('USDT')) return 'crypto';
  return 'equity';
}

function deriveAdaptivePolicy(rows: ClosedTradePerformanceRow[], regime: Regime) {
  const validR = rows
    .map((row) => parseNumber(row.r_multiple))
    .filter((value): value is number => value != null && Number.isFinite(value));

  const wins = rows.filter((row) => {
    const outcome = String(row.outcome || '').toLowerCase();
    if (outcome === 'win') return true;
    if (outcome === 'loss') return false;
    const r = parseNumber(row.r_multiple);
    return r != null ? r > 0 : false;
  }).length;

  const sampleSize = rows.length;
  const winRate = sampleSize > 0 ? wins / sampleSize : 0;
  const avgR = validR.length > 0 ? validR.reduce((sum, value) => sum + value, 0) / validR.length : 0;
  const medianR = validR.length > 0 ? median(validR) : 0;

  const baseEdgeFloor = regime === 'TREND' ? 50 : regime === 'TRANSITION' ? 45 : 40;
  let edgeFloorAdjust = 0;
  if (sampleSize >= 12) {
    if (winRate < 0.42 || medianR < 0.2) edgeFloorAdjust = 4;
    else if (winRate > 0.58 && avgR > 0.6) edgeFloorAdjust = -3;
  }

  const baseEdgeDropThreshold = regime === 'TREND' ? 20 : regime === 'TRANSITION' ? 18 : 15;
  const edgeDropAdjust = sampleSize >= 12
    ? (winRate > 0.6 ? 3 : winRate < 0.42 ? -2 : 0)
    : 0;

  const scaleOutAtR = sampleSize >= 10
    ? (avgR > 1.0 ? 2.5 : avgR < 0.25 ? 1.6 : 2.0)
    : 2.0;
  const closeAtR = sampleSize >= 10
    ? (avgR > 1.2 ? 3.5 : avgR < 0.2 ? 2.5 : 3.0)
    : 3.0;
  const trailAtR = sampleSize >= 10
    ? (winRate < 0.45 ? 0.8 : winRate > 0.6 ? 1.15 : 1.0)
    : 1.0;

  const noProgressTimePct = sampleSize >= 12
    ? (winRate < 0.45 ? 0.5 : winRate > 0.6 ? 0.72 : 0.6)
    : 0.6;
  const noProgressRThreshold = sampleSize >= 12
    ? (avgR < 0.25 ? 0.3 : 0.5)
    : 0.5;
  const expiryTimePct = sampleSize >= 12
    ? (winRate > 0.6 ? 1.2 : winRate < 0.45 ? 0.9 : 1.0)
    : 1.0;
  const expiryRThreshold = sampleSize >= 12
    ? (avgR > 0.8 ? 1.2 : avgR < 0.2 ? 0.8 : 1.0)
    : 1.0;

  return {
    policy: {
      edge_floor_override: clamp(baseEdgeFloor + edgeFloorAdjust, 30, 80),
      edge_drop_threshold_override: clamp(baseEdgeDropThreshold + edgeDropAdjust, 8, 35),
      scale_out_at_r: clamp(scaleOutAtR, 0.5, 5),
      trail_at_r: clamp(trailAtR, 0.25, 3),
      close_at_r: clamp(closeAtR, 1, 8),
      no_progress_time_pct: clamp(noProgressTimePct, 0.3, 0.95),
      no_progress_r_threshold: clamp(noProgressRThreshold, -0.5, 2),
      expiry_time_pct: clamp(expiryTimePct, 0.7, 2),
      expiry_r_threshold: clamp(expiryRThreshold, 0, 3),
    },
    learning: {
      sampleSize,
      winRate,
      avgR,
      medianR,
    },
  };
}

async function getLatestPrice(req: NextRequest, symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity'): Promise<{ price: number | null; source: string }> {
  const type = assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'fx' : 'stock';
  const upper = symbol.toUpperCase().trim();

  const quoteSymbol = type === 'crypto'
    ? upper.replace(/USDT$/, '').replace(/USD$/, '')
    : type === 'fx'
    ? upper.slice(0, 3)
    : upper;
  const quoteMarket = type === 'fx' && upper.length >= 6 ? upper.slice(3, 6) : 'USD';

  const quoteUrl = new URL('/api/quote', req.url);
  quoteUrl.searchParams.set('symbol', quoteSymbol);
  quoteUrl.searchParams.set('type', type);
  quoteUrl.searchParams.set('market', quoteMarket);

  try {
    const res = await fetch(quoteUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return { price: null, source: 'none' };
    const data = await res.json();
    const price = parseNumber(data?.price);
    if (price != null && price > 0) {
      return { price, source: `quote_api_${type}` };
    }
  } catch {
  }

  return { price: null, source: 'none' };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const entryIdRaw = url.searchParams.get('entryId');
    const entryId = Number(entryIdRaw);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      return NextResponse.json({ error: 'Valid entryId is required' }, { status: 400 });
    }

    const rows = await q<JournalRow>(
      `SELECT id, symbol, asset_class, side, trade_date, entry_price, quantity, stop_loss, target, risk_amount, is_open, status, tags
         FROM journal_entries
        WHERE workspace_id = $1 AND id = $2
        LIMIT 1`,
      [session.workspaceId, entryId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const entry = rows[0];
    if (!entry.is_open) {
      return NextResponse.json({
        success: true,
        verdict: {
          verdict: 'HOLD',
          shouldClose: false,
          reasons: ['Trade already closed'],
          exitScore: 0,
          scoreBreakdown: {
            structuralFailure: 0,
            edgeCollapse: 0,
            timeDecay: 0,
            objectiveHit: 0,
          },
          state: {
            structureValid: true,
            edgeScore: 50,
            timeInTradeDays: 0,
            expectedWindowDays: 3,
            targetHit: false,
            riskBreached: false,
            momentumExpansion: false,
            unrealizedPnL: 0,
            unrealizedReturnPct: 0,
            unrealizedRMultiple: null,
          },
        },
      });
    }

    const entryPrice = parseNumber(entry.entry_price) ?? 0;
    const quantity = parseNumber(entry.quantity) ?? 0;
    const stopLoss = parseNumber(entry.stop_loss);
    const target = parseNumber(entry.target);
    const riskAmount = parseNumber(entry.risk_amount);

    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const packetIdFromTag = parseDpTag(tags);

    const entryAssetClass = normalizeJournalAssetClass(entry.asset_class || inferAssetClassFromSymbol(entry.symbol));

    const packetRows = packetIdFromTag
      ? await q<DecisionPacketRow>(
          `SELECT packet_id, signal_score, invalidation, targets, updated_at
             FROM decision_packets
            WHERE workspace_id = $1 AND packet_id = $2
            LIMIT 1`,
          [session.workspaceId, packetIdFromTag]
        )
      : await q<DecisionPacketRow>(
          `SELECT packet_id, signal_score, invalidation, targets, updated_at
             FROM decision_packets
            WHERE workspace_id = $1 AND symbol = $2
              AND COALESCE(asset_class, 'equity') = $3
            ORDER BY updated_at DESC
            LIMIT 1`,
          [session.workspaceId, entry.symbol, entryAssetClass]
        );

    const packet = packetRows[0];
    const packetEdge = packet ? parseNumber(packet.signal_score) : null;
    const packetInvalidation = packet ? parseNumber(packet.invalidation) : null;
    const packetTarget = packet ? parseTargetFromJson(packet.targets) : null;

    const { price: latestPrice, source: priceSource } = await getLatestPrice(req, entry.symbol, entryAssetClass);
    const currentPrice = latestPrice ?? entryPrice;

    if ((entry.status || 'OPEN').toUpperCase() === 'OPEN') {
      await q(
        `UPDATE journal_entries
            SET status = 'MANAGING', updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2 AND COALESCE(status, 'OPEN') = 'OPEN'`,
        [session.workspaceId, entryId]
      );
    }

    const expectedWindowDays = (() => {
      const tag = tags.find((t) => /^expected_window_days_\d+$/i.test(String(t)));
      if (!tag) return 3;
      const value = Number(String(tag).split('_').pop());
      return Number.isFinite(value) && value > 0 ? value : 3;
    })();

    const inferredRisk = riskAmount ?? (stopLoss != null ? Math.abs(entryPrice - stopLoss) * quantity : null) ?? 0;
    const riskR = Math.max(0.000001, inferredRisk / Math.max(1, quantity));

    const unrealizedR = riskR > 0
      ? (entry.side === 'LONG' ? (currentPrice - entryPrice) / riskR : (entryPrice - currentPrice) / riskR)
      : 0;

    const nowMs = Date.now();
    const openedMs = Date.parse(`${entry.trade_date}T00:00:00.000Z`);
    const timeOpenMs = Number.isFinite(openedMs) ? Math.max(0, nowMs - openedMs) : 0;

    const regimeFromTag = tags.find((t) => /^regime_(trend|range|transition)$/i.test(String(t)));
    const regime: Regime = regimeFromTag
      ? (String(regimeFromTag).split('_')[1].toUpperCase() as Regime)
      : 'TRANSITION';

    const closedRows = await q<ClosedTradePerformanceRow>(
      `SELECT r_multiple, pl_percent, outcome
         FROM journal_entries
        WHERE workspace_id = $1
          AND symbol = $2
          AND is_open = false
          AND outcome IS NOT NULL
          AND outcome <> 'open'
        ORDER BY COALESCE(exit_date, trade_date) DESC
        LIMIT 120`,
      [session.workspaceId, entry.symbol]
    );

    const adaptive = deriveAdaptivePolicy(closedRows, regime);

    const tradeState: TradeState = {
      trade_id: `trade_${entry.id}`,
      symbol: entry.symbol,
      side: entry.side,
      timeframe: '1h',
      entry_price: entryPrice,
      stop_price: stopLoss ?? packetInvalidation ?? entryPrice,
      thesis_invalidation_price: stopLoss ?? packetInvalidation ?? entryPrice,
      targets: [target ?? packetTarget ?? 0].filter((v) => v > 0),
      risk_R: riskR,
      mark_price: currentPrice,
      unrealized_R: unrealizedR,
      max_favorable_R: Math.max(0, unrealizedR),
      time_open_ms: timeOpenMs,
      expected_window_ms: expectedWindowDays * 24 * 60 * 60 * 1000,
      edge_score: packetEdge ?? 50,
      confidence: packetEdge ?? 50,
      regime,
      permission: 'ALLOW',
      flow_bias: 'MIXED',
      momentum_state: Math.abs(unrealizedR) >= 0.5 ? 'EXPANDING' : 'FLAT',
      structure_state: 'NEUTRAL',
      event_risk: tags.some((t) => /earnings/i.test(String(t))) ? 'EARNINGS' : 'NONE',
      exit_reason: 'NONE',
      exit_action: 'HOLD',
      exit_detail: 'Pending evaluation',
      adaptive_policy: adaptive.policy,
    };

    const verdict = evaluateExit(tradeState);

    const shouldClose = verdict.exit_action === 'CLOSE';

    return NextResponse.json({
      success: true,
      entryId,
      symbol: entry.symbol,
      currentPrice,
      currentPriceSource: priceSource,
      decisionPacketId: packet?.packet_id || packetIdFromTag || null,
      verdict: {
        exitAction: verdict.exit_action,
        exitReason: verdict.exit_reason,
        exitDetail: verdict.exit_detail,
        shouldClose,
        exitScore: verdict.exit_score ?? 0,
        timeElapsedPct: verdict.time_elapsed_pct ?? null,
        learning: adaptive.learning,
        state: {
          edgeScore: verdict.edge_score,
          regime: verdict.regime,
          permission: verdict.permission,
          momentum: verdict.momentum_state,
          unrealizedR: verdict.unrealized_R,
        },
      },
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[journal/exit-verdict] error:', error);
    return NextResponse.json({ error: 'Failed to compute exit verdict' }, { status: 500 });
  }
}
