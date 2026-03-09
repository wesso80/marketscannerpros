import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/ai-signals — Log an AI signal verdict
 * GET  /api/ai-signals — Get signal memory stats for AI context
 */

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    symbol, assetType, timeframe, regime, confluenceScore,
    confidence, verdict, tradeBias, priceAtSignal,
    entryPrice, stopLoss, target1, target2, decisionTrace,
  } = body;

  if (!symbol || !regime || confluenceScore == null || confidence == null || !verdict) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Dedup: don't log same symbol+timeframe within 1 hour
  try {
    const recent = await q(
      `SELECT id FROM ai_signal_log 
       WHERE workspace_id = $1 AND symbol = $2 AND timeframe = $3
       AND signal_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [session.workspaceId, symbol, timeframe || 'daily']
    );
    if (recent && recent.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
  } catch {
    // Table might not exist yet — continue to try insert
  }

  try {
    await q(
      `INSERT INTO ai_signal_log 
       (workspace_id, symbol, asset_type, timeframe, regime, confluence_score, confidence, verdict,
        trade_bias, price_at_signal, entry_price, stop_loss, target_1, target_2, decision_trace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        session.workspaceId, symbol, assetType || 'equity', timeframe || 'daily',
        regime, confluenceScore, confidence, verdict,
        tradeBias || null, priceAtSignal || null, entryPrice || null,
        stopLoss || null, target1 || null, target2 || null,
        decisionTrace ? JSON.stringify(decisionTrace) : null,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Table may not exist yet — create it on-the-fly
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ ok: false, error: 'Migration pending — ai_signal_log table not yet created' }, { status: 503 });
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Regime win rate stats
    const regimeStats = await q(
      `SELECT regime, 
              COUNT(*) as count,
              COUNT(*) FILTER (WHERE outcome = 'correct') as wins,
              ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'correct') / NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending'), 0), 1) as win_rate
       FROM ai_signal_log 
       WHERE workspace_id = $1 AND signal_at > NOW() - INTERVAL '90 days'
       GROUP BY regime
       ORDER BY count DESC`,
      [session.workspaceId]
    );

    // Recent signals
    const recentSignals = await q(
      `SELECT symbol, verdict, confidence, outcome, regime, signal_at
       FROM ai_signal_log
       WHERE workspace_id = $1
       ORDER BY signal_at DESC
       LIMIT 10`,
      [session.workspaceId]
    );

    // Total count
    const totalResult = await q(
      `SELECT COUNT(*) as total FROM ai_signal_log WHERE workspace_id = $1`,
      [session.workspaceId]
    );

    return NextResponse.json({
      totalSignals: parseInt(totalResult[0]?.total || '0'),
      regimeStats: (regimeStats || []).map((r: any) => ({
        regime: r.regime,
        count: parseInt(r.count),
        winRate: parseFloat(r.win_rate || '0'),
      })),
      recentSignals: (recentSignals || []).map((s: any) => ({
        symbol: s.symbol,
        verdict: s.verdict,
        confidence: parseInt(s.confidence),
        outcome: s.outcome,
        regime: s.regime,
        signalAt: s.signal_at,
      })),
    });
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ totalSignals: 0, regimeStats: [], recentSignals: [] });
    }
    throw err;
  }
}
