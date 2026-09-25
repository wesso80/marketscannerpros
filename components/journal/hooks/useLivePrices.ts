'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TradeRowModel } from '@/types/journal';
import { journalQuoteRequest, parseJournalQuoteFor, type JournalQuoteRequest, type LivePriceMap } from '@/lib/journal/markToMarket';
export { enrichTradesWithLivePrices } from '@/lib/journal/markToMarket';
export type { LivePriceMap } from '@/lib/journal/markToMarket';

export function useLivePrices(trades: TradeRowModel[]) {
  const [prices, setPrices] = useState<LivePriceMap>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestKey = JSON.stringify(Array.from(new Map(trades.filter(t => t.status === 'open')
    .map(journalQuoteRequest).filter(r => r != null).map(r => [r.key, r])).values()).sort((a, b) => a.key.localeCompare(b.key)));
  const requests = useMemo(() => JSON.parse(requestKey) as JournalQuoteRequest[], [requestKey]);

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    setPrices({});
    setLastUpdated(null);
    async function refresh() {
      if (running || controller.signal.aborted || requests.length === 0) return;
      running = true;
      setLoading(true);
      const next: LivePriceMap = {};
      for (let i = 0; i < requests.length; i += 5) {
        await Promise.all(requests.slice(i, i + 5).map(async request => {
          try {
            const response = await fetch(request.url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) return;
            const quote = parseJournalQuoteFor(request, await response.json());
            if (quote) next[request.key] = quote;
          } catch { /* No successful quote: do not retain an older mark as fresh. */ }
        }));
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) {
        setPrices(next);
        setLastUpdated(Object.keys(next).length ? new Date() : null);
        setLoading(false);
      }
      running = false;
    }
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [requests]);
  return { prices, loading, lastUpdated };
}
