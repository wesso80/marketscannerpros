/**
 * /api/admin/transcripts
 * GET ?symbol=XXX&quarter=2025Q4 — return latest stored summary + meta
 *     ?symbol=XXX                 — list quarters available for symbol
 * POST { symbol, quarter, action:'ingest'|'summarise'|'both' }
 *   - ingest    : pull transcript from AV
 *   - summarise : LLM summary (must have transcript already)
 *   - both      : ingest then summarise
 *
 * Auth: requireAdmin. Boundary: research only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  ingestTranscript,
  summariseTranscript,
  getLatestSummary,
  listQuartersForSymbol,
} from '@/lib/earnings/transcripts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const quarter = url.searchParams.get('quarter');
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
  try {
    if (quarter) {
      const summary = await getLatestSummary(symbol, quarter);
      return NextResponse.json({ ok: true, summary });
    }
    const quarters = await listQuartersForSymbol(symbol);
    return NextResponse.json({ ok: true, quarters });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json() as { symbol?: string; quarter?: string; action?: string };
    if (!body.symbol || !body.quarter) {
      return NextResponse.json({ ok: false, error: 'symbol and quarter required' }, { status: 400 });
    }
    const action = body.action ?? 'both';
    const out: Record<string, unknown> = {};
    if (action === 'ingest' || action === 'both') {
      out.ingest = await ingestTranscript(body.symbol, body.quarter);
      if (action === 'both' && !(out.ingest as { ok: boolean }).ok) {
        return NextResponse.json({ ok: false, ...out });
      }
    }
    if (action === 'summarise' || action === 'both') {
      out.summarise = await summariseTranscript(body.symbol, body.quarter);
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
