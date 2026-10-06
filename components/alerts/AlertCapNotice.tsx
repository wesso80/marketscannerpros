'use client';

import { useEffect, useState } from 'react';
import { ALERT_CAP_NOTICE_EVENT } from '@/lib/alerts/planLimits';

/** Shows the plan-cap sentence when an automatic alert create is skipped. */
export default function AlertCapNotice({ className = '' }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.trim()) setMessage(detail);
    };
    window.addEventListener(ALERT_CAP_NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(ALERT_CAP_NOTICE_EVENT, onNotice);
  }, []);

  if (!message) return null;

  return (
    <div data-alert-cap-notice className={`rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ${className}`.trim()}>
      {message}
    </div>
  );
}
