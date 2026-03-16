/* ═══════════════════════════════════════════════════════════════════════════
   API: /api/doctrine/outcome — POST to record a trade outcome
   Links journaled trades to their identified doctrine for stats tracking.
   ═══════════════════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { PLAYBOOKS } from '@/lib/doctrine/registry';

const VALID_OUTCOMES = new Set(['win', 'loss', 'breakeven']);
const VALID_SIDES = new Set(['long', 'short']);
const VALID_ASSET_CLASSES = new Set(['equity', 'crypto', 'commodity']);
const VALID_DOCTRINE_IDS = new Set(PLAYBOOKS.map(p => p.id));

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    symbol, doctrineId, regime, assetClass, side,
    entryPrice, exitPrice, entryDate, exitDate,
    outcome, rMultiple, pnlPct,
    confluenceAtEntry, confidenceAtEntry, dveState,
    holdingDays, journalTradeId,
  } = body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!symbol || typeof symbol !== 'string') {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }
  if (!doctrineId || !VALID_DOCTRINE_IDS.has(doctrineId)) {
    return NextResponse.json({ error: 'Invalid doctrineId' }, { status: 400 });
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return NextResponse.json({ error: 'outcome must be win, loss, or breakeven' }, { status: 400 });
  }
  if (!VALID_SIDES.has(side)) {
    return NextResponse.json({ error: 'side must be long or short' }, { status: 400 });
  }
  if (typeof entryPrice !== 'number' || typeof exitPrice !== 'number') {
    return NextResponse.json({ error: 'entryPrice and exitPrice must be numbers' }, { status: 400 });
  }
  if (!entryDate || !exitDate) {
    return NextResponse.json({ error: 'entryDate and exitDate are required' }, { status: 400 });
  }

  try {
    const rows = await q(
      `INSERT INTO doctrine_outcomes
        (user_id, symbol, doctrine_id, regime, asset_class, side,
         entry_price, exit_price, entry_date, exit_date,
         outcome, r_multiple, pnl_pct,
         confluence_at_entry, confidence_at_entry, dve_state,
         holding_days, journal_trade_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        session.workspaceId,
        symbol.toUpperCase(),
        doctrineId,
        regime || 'unknown',
        VALID_ASSET_CLASSES.has(assetClass) ? assetClass : 'equity',
        side,
        entryPrice,
        exitPrice,
        entryDate,
        exitDate,
        outcome,
        rMultiple ?? null,
        pnlPct ?? null,
        confluenceAtEntry ?? null,
        confidenceAtEntry ?? null,
        dveState ?? null,
        holdingDays ?? null,
        journalTradeId ?? null,
      ],
    );

    return NextResponse.json({ id: rows[0]?.id, ok: true }, { status: 201 });
  } catch (err) {
    console.error('[doctrine/outcome] Error:', err);
    return NextResponse.json({ error: 'Failed to record outcome' }, { status: 500 });
  }
}
