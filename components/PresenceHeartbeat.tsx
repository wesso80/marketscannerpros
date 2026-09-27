'use client';
import { startVisiblePolling } from '@/lib/client/visiblePolling';

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
      return fetch('/api/analytics/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, current_path: pathname }),
        keepalive: true,
      }).catch(() => {
        // Silently ignore — never break the app
      });
    };

    return startVisiblePolling(send, HEARTBEAT_INTERVAL_MS);

  }, [pathname]);

  return null;
}
