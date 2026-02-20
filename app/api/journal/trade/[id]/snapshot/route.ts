import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type SnapshotSource = 'scanner' | 'options' | 'time';
type SnapshotPhase = 'entry' | 'mid' | 'exit';

function isSnapshotSource(value: unknown): value is SnapshotSource {
  return value === 'scanner' || value === 'options' || value === 'time';
}

function isSnapshotPhase(value: unknown): value is SnapshotPhase {
  return value === 'entry' || value === 'mid' || value === 'exit';
}

async function ensureSnapshotSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS journal_trade_snapshots (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('scanner', 'options', 'time')),
      phase TEXT NOT NULL CHECK (phase IN ('entry', 'mid', 'exit')),
      symbol TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      score NUMERIC,
      confidence NUMERIC,
      permission TEXT,
      grade NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_journal_trade_snapshots_workspace_trade_time
    ON journal_trade_snapshots (workspace_id, journal_entry_id, created_at DESC)
  `);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSnapshotSchema();

    const params = await context.params;
    const journalEntryId = Number(params?.id);
    if (!Number.isFinite(journalEntryId) || journalEntryId <= 0) {
      return NextResponse.json({ error: 'Invalid journal trade id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const source = body?.source;
    const phase = body?.phase;
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!isSnapshotSource(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    if (!isSnapshotPhase(phase)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }

    const entryRows = await q<{
      id: number;
      symbol: string;
      entry_price: string | number;
      is_open: boolean;
    }>(
      `SELECT id, symbol, entry_price, is_open
         FROM journal_entries
        WHERE workspace_id = $1 AND id = $2
        LIMIT 1`,
      [session.workspaceId, journalEntryId],
    );

    const entry = entryRows[0];
    if (!entry) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const defaultPayload = {
      version: 'v2',
      capturedAt: nowIso,
      source,
      phase,
      symbol: String(entry.symbol || '').toUpperCase(),
      status: entry.is_open ? 'open' : 'closed',
      referencePrice: Number(entry.entry_price || 0),
    };

    const insertRows = await q<{
      id: number;
      source: SnapshotSource;
      phase: SnapshotPhase;
      symbol: string;
      created_at: string;
    }>(
      `INSERT INTO journal_trade_snapshots (
         workspace_id, journal_entry_id, source, phase, symbol, payload
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, source, phase, symbol, created_at`,
      [
        session.workspaceId,
        journalEntryId,
        source,
        phase,
        String(entry.symbol || '').toUpperCase(),
        JSON.stringify({ ...defaultPayload, ...payload }),
      ],
    );

    return NextResponse.json({
      success: true,
      snapshot: insertRows[0],
    });
  } catch (error) {
    console.error('[journal/trade/:id/snapshot] POST error:', error);
    return NextResponse.json({ error: 'Failed to capture snapshot' }, { status: 500 });
  }
}
