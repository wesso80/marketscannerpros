'use client';

import { useEffect, useState } from 'react';

/**
 * Global stale-data indicator. When API responses include a `dataAge`
 * header or meta field older than the configured threshold, shows
 * a dismissible banner. This is mounted once in the root layout.
 */
export default function StaleDataBanner() {
  const [stale, setStale] = useState(false);
  const [source, setSource] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check market data freshness every 60s
    const check = async () => {
      try {
        const res = await fetch('/api/health/data', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.stale) {
          setStale(true);
          setSource(data.source || 'market data');
        } else {
          setStale(false);
        }
      } catch {
        // Silent — this is best-effort
      }
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!stale || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[90] max-w-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-lg">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-200">Data may be stale</p>
          <p className="mt-0.5 text-xs text-amber-300/70">
            {source} data hasn&apos;t refreshed recently. Displayed values may be outdated.
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
