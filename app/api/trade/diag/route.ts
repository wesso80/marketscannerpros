// GET /api/trade/diag — admin-only. Reports provider config + a probe call
// so we can see exactly why bars are 502'ing without exposing internals
// to public surfaces.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { DatabentoProvider } from '@/lib/trade/marketdata/databento';

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

  // Second probe: exercise the provider class so we can see whether the
  // available_end auto-retry lands bars even when the raw probe 422s.
  let providerProbe: unknown = 'skipped';
  if (provider === 'databento' && hasDbKey) {
    try {
      const p = new DatabentoProvider();
      const to = Date.now();
      const from = to - 7 * 24 * 60 * 60 * 1000; // last 7d to give snapshot plans room
      const r = await p.getBars({ symbol: 'ES.c.0', resolution: '1', from, to });
      providerProbe = {
        ok: true,
        barCount: r.bars.length,
        firstBarTime: r.bars[0] ? new Date(r.bars[0].time).toISOString() : null,
        lastBarTime: r.bars.length ? new Date(r.bars[r.bars.length - 1].time).toISOString() : null,
        usedAvailableEnd: r.usedAvailableEnd ?? false,
        effectiveEnd: r.effectiveEnd ? new Date(r.effectiveEnd).toISOString() : null,
        noData: r.noData,
      };
    } catch (e) {
      providerProbe = { ok: false, error: e instanceof Error ? e.message : 'provider probe failed' };
    }
  }

  return NextResponse.json({
    provider,
    env: {
      DATABENTO_API_KEY: hasDbKey ? 'set' : 'MISSING',
      TRADE_TGS_WEBHOOK_SECRET: hasTgsSecret ? 'set' : 'MISSING',
      TRADE_BROKER: hasOmsBroker,
      DATABENTO_HIST_LAG_MS: process.env.DATABENTO_HIST_LAG_MS ?? '600000 (default)',
    },
    databentoProbe: provider === 'databento' ? probe : 'skipped (provider != databento)',
    providerProbe,
  });
}
