import { NextRequest } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE (Server-Sent Events) real-time stream.
 *
 * Clients connect via:
 *   const es = new EventSource('/api/sse/stream');
 *   es.addEventListener('price', (e) => { ... });
 *   es.addEventListener('alert', (e) => { ... });
 *   es.addEventListener('state', (e) => { ... });
 *   es.addEventListener('health', (e) => { ... });
 *
 * Event types:
 *   price  — Latest price tick for subscribed symbols
 *   alert  — Alert triggered notification
 *   state  — State machine transition event
 *   health — Data pipeline health heartbeat
 */

// ─── In-memory event bus (singleton per server process) ───

export type SSEEventType = 'price' | 'alert' | 'state' | 'health';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
  /** Optional workspace scoping — null means broadcast to all */
  workspaceId?: string | null;
}

type Listener = (event: SSEEvent) => void;

class SSEBus {
  private listeners = new Set<{ workspaceId: string; fn: Listener }>();

  subscribe(workspaceId: string, fn: Listener) {
    const entry = { workspaceId, fn };
    this.listeners.add(entry);
    return () => { this.listeners.delete(entry); };
  }

  publish(event: SSEEvent) {
    for (const listener of this.listeners) {
      // Broadcast events (no workspaceId) go to everyone; scoped events only to matching workspace
      if (!event.workspaceId || event.workspaceId === listener.workspaceId) {
        try {
          listener.fn(event);
        } catch { /* don't let one listener break others */ }
      }
    }
  }

  get connectionCount() {
    return this.listeners.size;
  }
}

// Global singleton
declare global {
  // eslint-disable-next-line no-var
  var __sseBus: SSEBus | undefined;
}

export function getSSEBus(): SSEBus {
  if (!global.__sseBus) {
    global.__sseBus = new SSEBus();
  }
  return global.__sseBus;
}

// ─── SSE Route Handler ───

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workspaceId = session.workspaceId;
  const bus = getSSEBus();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: SSEEvent) => {
        try {
          const line = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          // Stream closed
        }
      };

      // Send initial heartbeat
      send({
        type: 'health',
        data: { status: 'connected', connections: bus.connectionCount + 1 },
        timestamp: new Date().toISOString(),
      });

      // Subscribe to bus
      const unsubscribe = bus.subscribe(workspaceId, send);

      // Keep-alive ping every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
