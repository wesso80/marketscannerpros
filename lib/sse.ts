/**
 * SSE Publisher — server-side helper to push events to connected clients.
 *
 * Usage from any API route or background job:
 *   import { publishSSE } from '@/lib/sse';
 *   publishSSE('price', { symbol: 'BTC', price: 67000 }, workspaceId);
 *   publishSSE('alert', { alertId: 123, message: 'BTC hit $67k' }, workspaceId);
 *   publishSSE('state', { symbol: 'ETH', from: 'ARMED', to: 'EXECUTE' }, workspaceId);
 *   publishSSE('health', { dataSource: 'coingecko', status: 'degraded' }); // broadcast
 */

import type { SSEEventType } from '@/app/api/sse/stream/route';

// __sseBus global is declared in app/api/sse/stream/route.ts

export function publishSSE(
  type: SSEEventType,
  data: Record<string, unknown>,
  workspaceId?: string | null,
): void {
  try {
    const bus = global.__sseBus;
    if (!bus) return; // No SSE bus initialized yet (no clients connected)

    bus.publish({
      type,
      data,
      timestamp: new Date().toISOString(),
      workspaceId: workspaceId ?? null,
    });
  } catch {
    // Silent fail — SSE is best-effort
  }
}
