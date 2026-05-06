// GET /api/trade/stream?symbol=ES.c.0&resolution=5
// Server-Sent Events. Emits:
//   event: bar     data: { bar, isFinal }
//   event: tick    data: { time, price, size }   (only if provider supports ticks)
//   event: ping    data: { ts }                 (every 15s, keep proxies happy)
//   event: error   data: { message }

import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getMarketDataProvider } from '@/lib/trade/marketdata';
import { pollingBarSubscription, inferPollIntervalMs } from '@/lib/trade/marketdata/polling';
import type { Resolution, LiveSubscription } from '@/lib/trade/marketdata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_RES: Resolution[] = ['1S', '5S', '15S', '30S', '1', '5', '15', '30', '60', '240', 'D', 'W'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const resolution = url.searchParams.get('resolution') as Resolution | null;
  if (!symbol || !resolution || !VALID_RES.includes(resolution)) {
    return new Response('missing or invalid params', { status: 400 });
  }

  const provider = getMarketDataProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let barSub: LiveSubscription | null = null;
      let tickSub: LiveSubscription | null = null;
      let pingId: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        try { barSub?.unsubscribe(); } catch {}
        try { tickSub?.unsubscribe(); } catch {}
        if (pingId) clearInterval(pingId);
        try { controller.close(); } catch {}
      };

      // Abort handling for client disconnect.
      req.signal.addEventListener('abort', cleanup);

      send('hello', { provider: provider.name, symbol, resolution, ts: Date.now() });

      // Native bar subscription if available, else polling fallback.
      try {
        if (provider.subscribeBars) {
          barSub = await provider.subscribeBars(symbol, resolution, (bar, isFinal) => {
            send('bar', { bar, isFinal });
          });
        } else {
          barSub = pollingBarSubscription(
            provider,
            symbol,
            resolution,
            (bar, isFinal) => send('bar', { bar, isFinal }),
            inferPollIntervalMs(resolution)
          );
        }
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'bar subscribe failed' });
      }

      if (provider.subscribeTicks) {
        try {
          tickSub = await provider.subscribeTicks(symbol, (tick) => send('tick', tick));
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'tick subscribe failed' });
        }
      }

      pingId = setInterval(() => send('ping', { ts: Date.now() }), 15_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
