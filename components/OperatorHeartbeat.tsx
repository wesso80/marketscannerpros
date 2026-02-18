'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 20_000;

function getOrCreateSessionId() {
  const key = 'msp_operator_session_id';
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, created);
  return created;
}

function normalizeModule(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] || 'home';
  if (segment === 'tools') return 'tools';
  return segment;
}

function shouldTrack(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/tools')
    || pathname.startsWith('/dashboard')
    || pathname.startsWith('/operator')
    || pathname.startsWith('/account')
  );
}

function readLocalArray(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

export default function OperatorHeartbeat() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const mountMs = useRef<number>(Date.now());
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  useEffect(() => {
    if (!shouldTrack(pathname)) return;

    const module = normalizeModule(pathname);
    const getPayload = () => {
      const symbol = String(
        searchParams?.get('symbol')
        || searchParams?.get('ticker')
        || searchParams?.get('s')
        || ''
      )
        .trim()
        .toUpperCase();

      const timeframe = String(searchParams?.get('timeframe') || '').trim().toLowerCase();
      const trackedSymbols = readLocalArray('msp_scanner_symbols');
      const symbols = [symbol, ...trackedSymbols].filter(Boolean).slice(0, 8);
      const dwellMs = Date.now() - mountMs.current;
      const scrollDepth = typeof window !== 'undefined'
        ? Math.min(1, Math.max(0, window.scrollY / Math.max(1, (document.body.scrollHeight - window.innerHeight))))
        : 0;

      return {
        sessionId,
        page: module,
        route: pathname,
        symbols,
        timeframes: timeframe ? [timeframe] : [],
        attention: {
          primarySymbol: symbol || symbols[0] || undefined,
          dwellMs,
          scrollDepth,
        },
        viewState: {
          query: searchParams?.toString() || '',
        },
      };
    };

    const send = async () => {
      try {
        await fetch('/api/context/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getPayload()),
          keepalive: true,
        });
      } catch {
        // best effort only
      }
    };

    mountMs.current = Date.now();
    send();
    const interval = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pathname, searchParams, sessionId]);

  return null;
}