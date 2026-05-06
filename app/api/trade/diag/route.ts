// GET /api/trade/diag — admin-only. Reports provider config + a probe call
// so we can see exactly why bars are 502'ing without exposing internals
// to public surfaces.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const provider = (process.env.TRADE_DATA_PROVIDER ?? 'mock').toLowerCase();
  const hasDbKey = Boolean(process.env.DATABENTO_API_KEY);
  const hasTgsSecret = Boolean(process.env.TRADE_TGS_WEBHOOK_SECRET);
  const hasOmsBroker = process.env.TRADE_BROKER ?? 'paper';

  let probe: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false };
  if (provider === 'databento' && hasDbKey) {
    try {
      const url = new URL('https://hist.databento.com/v0/timeseries.get_range');
      const to = Date.now();
      const from = to - 60 * 60 * 1000;
      url.searchParams.set('dataset', 'GLBX.MDP3');
      url.searchParams.set('schema', 'ohlcv-1m');
      url.searchParams.set('symbols', 'ES.c.0');
      url.searchParams.set('stype_in', 'continuous');
      url.searchParams.set('encoding', 'json');
      url.searchParams.set('start', new Date(from).toISOString());
      url.searchParams.set('end', new Date(to).toISOString());

      const auth = 'Basic ' + Buffer.from(`${process.env.DATABENTO_API_KEY}:`).toString('base64');
      const res = await fetch(url, { headers: { Authorization: auth }, cache: 'no-store' });
      const body = await res.text();
      probe = { ok: res.ok, status: res.status, body: body.slice(0, 500) };
    } catch (e) {
      probe = { ok: false, error: e instanceof Error ? e.message : 'probe failed' };
    }
  }

  return NextResponse.json({
    provider,
    env: {
      DATABENTO_API_KEY: hasDbKey ? 'set' : 'MISSING',
      TRADE_TGS_WEBHOOK_SECRET: hasTgsSecret ? 'set' : 'MISSING',
      TRADE_BROKER: hasOmsBroker,
    },
    databentoProbe: provider === 'databento' ? probe : 'skipped (provider != databento)',
  });
}
