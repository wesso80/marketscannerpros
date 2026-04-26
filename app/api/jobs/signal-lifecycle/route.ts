import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { q } from '@/lib/db';
import { logger, generateTraceId } from '@/lib/logger';

type SignalRow = {
  id: number;
  symbol: string;
  trade_bias: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  signal_at: string;
  price_at_signal: string | number | null;
  entry_price: string | number | null;
  stop_loss: string | number | null;
  target_1: string | number | null;
  price_after_24h: string | number | null;
  lifecycle_state: string;
};

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classify(row: SignalRow) {
  const bias = row.trade_bias;
  const current = num(row.price_after_24h);
  const entry = num(row.entry_price) ?? num(row.price_at_signal);
  const stop = num(row.stop_loss);
  const target = num(row.target_1);
  const signalAgeMs = Date.now() - new Date(row.signal_at).getTime();
  const expired = signalAgeMs > 36 * 60 * 60_000;

  if (!bias || bias === 'NEUTRAL' || !entry) {
    return expired ? { state: 'EXPIRED', outcome: 'neutral' } : null;
  }

  if (current == null) {
    return expired ? { state: 'EXPIRED', outcome: 'expired' } : null;
  }

  const triggered = bias === 'LONG' ? current >= entry : current <= entry;
  const stopped = stop != null ? (bias === 'LONG' ? current <= stop : current >= stop) : false;
  const targetHit = target != null ? (bias === 'LONG' ? current >= target : current <= target) : false;

  if (targetHit) return { state: 'TARGET_1_HIT', outcome: 'correct' };
  if (stopped) return { state: 'STOPPED', outcome: 'wrong' };
  if (triggered) return { state: 'TRIGGERED', outcome: 'pending' };
  if (expired) return { state: 'EXPIRED', outcome: 'expired' };
  return { state: 'WATCHING', outcome: 'pending' };
}

async function ensureLifecycleColumns() {
  await q(`ALTER TABLE ai_signal_log
    ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(30) NOT NULL DEFAULT 'DISCOVERED',
    ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS target_1_hit_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stop_hit_at TIMESTAMPTZ`);
}

export async function POST(req: NextRequest) {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;
  const headerCron = req.headers.get('x-cron-secret');
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '');
  const cronOk = cronSecret && headerCron && safeCompare(headerCron, cronSecret);
  const adminOk = adminSecret && headerAuth && safeCompare(headerAuth, adminSecret);

  if (!cronOk && !adminOk) {
    return NextResponse.json({ ok: false, traceId, processed: 0, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureLifecycleColumns();

    const rows = await q<SignalRow>(
      `SELECT id, symbol, trade_bias, signal_at, price_at_signal, entry_price, stop_loss, target_1, price_after_24h, lifecycle_state
       FROM ai_signal_log
       WHERE lifecycle_state IN ('DISCOVERED', 'WATCHING', 'TRIGGERED')
         AND signal_at >= NOW() - INTERVAL '7 days'
       ORDER BY signal_at ASC
       LIMIT 500`,
    );

    let processed = 0;
    const transitions: Record<string, number> = {};

    for (const row of rows) {
      const next = classify(row);
      if (!next || next.state === row.lifecycle_state) continue;

      await q(
        `UPDATE ai_signal_log
         SET lifecycle_state = $2,
             outcome = CASE WHEN $3::text IS NULL THEN outcome ELSE $3 END,
             triggered_at = CASE WHEN $2 = 'TRIGGERED' AND triggered_at IS NULL THEN NOW() ELSE triggered_at END,
             target_1_hit_at = CASE WHEN $2 = 'TARGET_1_HIT' AND target_1_hit_at IS NULL THEN NOW() ELSE target_1_hit_at END,
             stop_hit_at = CASE WHEN $2 = 'STOPPED' AND stop_hit_at IS NULL THEN NOW() ELSE stop_hit_at END,
             invalidated_at = CASE WHEN $2 IN ('STOPPED', 'EXPIRED') AND invalidated_at IS NULL THEN NOW() ELSE invalidated_at END,
             outcome_measured_at = CASE WHEN $2 IN ('TARGET_1_HIT', 'STOPPED', 'EXPIRED') THEN NOW() ELSE outcome_measured_at END
         WHERE id = $1`,
        [row.id, next.state, next.outcome],
      );
      processed += 1;
      transitions[next.state] = (transitions[next.state] || 0) + 1;
    }

    log.info('signal lifecycle processed', { processed, transitions });
    return NextResponse.json({ ok: true, traceId, scanned: rows.length, processed, transitions });
  } catch (err) {
    log.error('signal lifecycle failed', err);
    return NextResponse.json({ ok: false, traceId, error: 'Signal lifecycle job failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
