/**
 * /api/admin/insider
 * GET ?symbol=XXX&window=90&limit=50 — summary + recent transactions
 * POST { symbol, maxFilings? } — trigger ingest (Form 4) for one symbol
 *
 * Auth: requireAdmin. No silent backfill; missing fields stay NULL.
 * Boundary: research only. No execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { ingestInsiderForSymbol, recentInsiderForSymbol, insiderSummary } from '@/lib/insider/edgar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
  const windowDays = Math.max(7, Math.min(365, Number(url.searchParams.get('window') ?? '90')));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '50')));
  try {
    const [summary, transactions] = await Promise.all([
      insiderSummary(symbol, windowDays),
      recentInsiderForSymbol(symbol, limit),
    ]);
    return NextResponse.json({ ok: true, summary, transactions });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json() as { symbol?: string; maxFilings?: number };
    if (!body.symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
    const started = Date.now();
    const result = await ingestInsiderForSymbol(body.symbol, { maxFilings: body.maxFilings });
    return NextResponse.json({ ok: true, result, durationMs: Date.now() - started });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
