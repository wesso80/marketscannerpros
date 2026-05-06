// POST /api/trade/webhook/tgs
// Receives alerts from the MSP TGS Pine indicator (TradingView webhook).
// Validates a shared secret, normalizes payload, writes signal + maintains
// active overlay row, audit-logs everything.
//
// TradingView alert message format (configure as JSON in the alert dialog):
// {
//   "secret": "<TRADE_TGS_WEBHOOK_SECRET>",
//   "source": "tgs",
//   "kind":   "BUY" | "SELL" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "REACTION",
//   "symbol": "{{ticker}}",
//   "price":  {{close}},
//   "entry":  {{plot("Entry")}},   // optional, for BUY/SELL
//   "tp1":    ..., "tp2": ..., "sl": ...,
//   "rr":     1.8,
//   "ts":     "{{timenow}}"
// }
//
// We never trust the payload to mean "place an order" — it only writes
// signals and overlays. Order routing is a separate, explicit admin action.

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { audit } from '@/lib/trade/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TgsPayload {
  secret?: string;
  source?: string;
  kind?: string;
  symbol?: string;
  price?: number;
  entry?: number;
  tp1?: number;
  tp2?: number;
  sl?: number;
  rr?: number;
  ts?: string | number;
  [k: string]: unknown;
}

const VALID_KINDS = new Set(['BUY', 'SELL', 'TP1_HIT', 'TP2_HIT', 'SL_HIT', 'REACTION']);

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TRADE_TGS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }

  // Accept secret via header or body for TradingView compatibility.
  const headerSecret = req.headers.get('x-tgs-secret');
  let body: TgsPayload;
  try {
    body = (await req.json()) as TgsPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if ((headerSecret ?? body.secret) !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const symbol = (body.symbol ?? '').toString().trim().toUpperCase();
  const kind = (body.kind ?? '').toString().trim().toUpperCase();
  if (!symbol || !VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'invalid symbol or kind' }, { status: 400 });
  }

  const price = num(body.price);
  const entry = num(body.entry);
  const tp1 = num(body.tp1);
  const tp2 = num(body.tp2);
  const sl = num(body.sl);
  const rr = num(body.rr);

  // 1. Append signal row.
  const sigRows = await q<{ id: string }>(
    `INSERT INTO trade_signals (source, symbol, kind, price, entry, tp1, tp2, sl, rr, payload)
     VALUES ('tgs',$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING id`,
    [symbol, kind, price, entry, tp1, tp2, sl, rr, JSON.stringify(body)]
  );
  const signalId = sigRows[0]?.id;

  // 2. Maintain overlay state.
  if (kind === 'BUY' || kind === 'SELL') {
    if (entry == null) {
      return NextResponse.json({ error: 'entry required for BUY/SELL' }, { status: 400 });
    }
    // Close any existing active overlay for this symbol/source (replaced).
    await q(
      `UPDATE trade_overlays SET closed_at = NOW(), closed_reason = 'REPLACED'
       WHERE symbol = $1 AND source = 'tgs' AND closed_at IS NULL`,
      [symbol]
    );
    await q(
      `INSERT INTO trade_overlays (source, symbol, direction, entry, tp1, tp2, sl, meta)
       VALUES ('tgs',$1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [symbol, kind === 'BUY' ? 1 : -1, entry, tp1, tp2, sl, JSON.stringify({ rr, signalId })]
    );
  } else if (kind === 'TP2_HIT' || kind === 'SL_HIT') {
    await q(
      `UPDATE trade_overlays
         SET closed_at = NOW(), closed_reason = $2,
             meta = meta || jsonb_build_object('exitPrice', $3::text, 'exitSignalId', $4::text)
       WHERE symbol = $1 AND source = 'tgs' AND closed_at IS NULL`,
      [symbol, kind === 'TP2_HIT' ? 'TP2' : 'SL', price, signalId ?? null]
    );
  } else if (kind === 'TP1_HIT') {
    await q(
      `UPDATE trade_overlays
         SET meta = meta || jsonb_build_object('tp1HitAt', to_jsonb(NOW()), 'tp1HitPrice', $2::text)
       WHERE symbol = $1 AND source = 'tgs' AND closed_at IS NULL`,
      [symbol, price]
    );
  }

  await audit({
    category: 'signal',
    actor: 'tgs',
    action: kind,
    symbol,
    refTable: 'trade_signals',
    refId: signalId ? Number(signalId) : null,
    payload: { price, entry, tp1, tp2, sl, rr },
  });

  return NextResponse.json({ ok: true, id: signalId });
}
