'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePolling } from '@/hooks/usePolling';

/**
 * Global stale-data indicator. Polls GET /api/health/stale, which returns
 * only `{ stale: boolean }`. A failed check leaves the banner hidden.
 * Mounted once in the root layout.
 */
export default function StaleDataBanner() {
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/health/stale', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStale(data?.stale === true);
    } catch {
      // A failed check does not show a warning.
    }
  }, []);

  usePolling(check, 60_000, { immediate: true });

  if (!stale || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[90] sm:right-auto sm:max-w-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-lg">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-200">Data may be stale</p>
          <p className="mt-0.5 text-xs text-amber-300/70">
            Market data hasn&apos;t refreshed recently. Displayed values may be outdated.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-200 text-xs"
          aria-label="Dismiss stale data warning"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
