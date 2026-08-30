'use client';

import { useEffect, useState } from 'react';

interface EndpointState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
}

// Minimal client fetch hook for the Intelligence mock API. Architected so a
// polling/streaming refresh can be layered on later without changing callers.
export function useEndpoint<T>(url: string): EndpointState<T> {
  const [state, setState] = useState<EndpointState<T>>({
    data: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = (await res.json()) as { data: T };
        if (active) {
          setState({ data: json.data, loading: false, error: null, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Failed to load', updatedAt: null });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);

  return state;
}
