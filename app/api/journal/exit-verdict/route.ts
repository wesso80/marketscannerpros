import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { evaluateExit, type Regime, type TradeState } from '../../../../lib/tradeExitEngine';

type JournalRow = {
  id: number;
  symbol: string;
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

async function getLatestPrice(symbol: string): Promise<{ price: number | null; source: string }> {
  const direct = await q<{ price: string | number; fetched_at: string }>(
    `SELECT price, fetched_at FROM quotes_latest WHERE symbol = $1 LIMIT 1`,
    [symbol.toUpperCase()]
  );
  if (direct.length > 0) {
    const price = parseNumber(direct[0].price);
    if (price != null) return { price, source: 'quotes_latest' };
  }

  const base = symbol.toUpperCase().replace(/USDT$/, '').replace(/USD$/, '');
  if (base && base !== symbol.toUpperCase()) {
    const fallback = await q<{ price: string | number; fetched_at: string }>(
      `SELECT price, fetched_at FROM quotes_latest WHERE symbol = $1 LIMIT 1`,
      [base]
    );
    if (fallback.length > 0) {
      const price = parseNumber(fallback[0].price);
      if (price != null) return { price, source: 'quotes_latest_base' };
    }
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
      `SELECT id, symbol, side, trade_date, entry_price, quantity, stop_loss, target, risk_amount, is_open, status, tags
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
            ORDER BY updated_at DESC
            LIMIT 1`,
          [session.workspaceId, entry.symbol]
        );

    const packet = packetRows[0];
    const packetEdge = packet ? parseNumber(packet.signal_score) : null;
    const packetInvalidation = packet ? parseNumber(packet.invalidation) : null;
    const packetTarget = packet ? parseTargetFromJson(packet.targets) : null;

    const { price: latestPrice, source: priceSource } = await getLatestPrice(entry.symbol);
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
