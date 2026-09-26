'use client';

import { useCallback, useEffect, useState } from 'react';

interface EndpointState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  /** Re-run the request (e.g. after a timeout). */
  retry: () => void;
}

/** Client-side request timeout (RS-16): a request that never settles must not leave the page on "Loading…" forever. */
export const ENDPOINT_TIMEOUT_MS = 30_000;

// Minimal client fetch hook for the Intelligence API. Architected so a
// polling/streaming refresh can be layered on later without changing callers.
export function useEndpoint<T>(url: string, opts: { timeoutMs?: number } = {}): EndpointState<T> {
  const timeoutMs = opts.timeoutMs ?? ENDPOINT_TIMEOUT_MS;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<EndpointState<T>, 'retry'>>({
    data: null,
    loading: true,
    error: null,
    updatedAt: null,
  });
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ? `${body.error} (${res.status})` : `Request failed (${res.status})`);
        }
        const json = (await res.json()) as { data: T };
        if (active) {
          setState({ data: json.data, loading: false, error: null, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        if (!active) return;
        if (timedOut) {
          setState((s) => ({ ...s, loading: false, error: `Timed out after ${Math.round(timeoutMs / 1000)} s — the data providers are slow right now.` }));
          return;
        }
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed to load' }));
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, timeoutMs, attempt]);

  return { ...state, retry };
}
