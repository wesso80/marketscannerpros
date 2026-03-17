'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const SESSION_KEY = 'msp_presence_sid';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}

/**
 * Lightweight presence heartbeat — sends current path every 60s.
 * Renders nothing. Mount once in the root layout.
 */
export default function PresenceHeartbeat() {
  const pathname = usePathname() || '/';
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId();
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId();
    }
    const sid = sessionIdRef.current;
    if (!sid) return;

    const send = () => {
      fetch('/api/analytics/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, current_path: pathname }),
        keepalive: true,
      }).catch(() => {
        // Silently ignore — never break the app
      });
    };

    // Immediate heartbeat on mount / path change
    send();

    // Recurring heartbeat every 60s
    timerRef.current = setInterval(send, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pathname]);

  return null;
}
