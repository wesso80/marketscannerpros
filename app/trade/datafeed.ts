// Browser-side adapter that talks to /api/trade/* and feeds the chart engine.
// Engine-agnostic: returns plain Bar arrays so we can swap Lightweight Charts
// for the TradingView Charting Library later without touching providers.

import type { Bar, BarsResponse, Resolution, SymbolMeta } from '@/lib/trade/marketdata';

export class TradeDatafeed {
  async resolve(symbol: string): Promise<SymbolMeta> {
    const res = await fetch(`/api/trade/symbols?q=${encodeURIComponent(symbol)}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`resolve ${res.status}`);
    const json = (await res.json()) as { symbol: SymbolMeta };
    return json.symbol;
  }

  async getBars(symbol: string, resolution: Resolution, from: number, to: number, limit?: number): Promise<BarsResponse> {
    const url = new URL('/api/trade/bars', window.location.origin);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('resolution', resolution);
    url.searchParams.set('from', String(from));
    url.searchParams.set('to', String(to));
    if (limit) url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error ? `: ${body.error}` : '';
      } catch { /* ignore */ }
      throw new Error(`bars ${res.status}${detail}`);
    }
    return (await res.json()) as BarsResponse;
  }
}
