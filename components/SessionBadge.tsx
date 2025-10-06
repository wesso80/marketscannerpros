'use client';
'use client'
import { useEffect, useState } from 'react';

export default function SessionBadge() {
  const [tier, setTier] = useState<'free'|'pro'|'pro_trader'>('free');

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.resolve({ tier: 'free' }))
      .then((s:any) => setTier(s?.tier ?? 'free'))
      .catch(() => setTier('free'));
  }, []);

  if (tier === 'pro_trader')
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs align-middle bg-emerald-400/10 text-emerald-300 border border-emerald-500/30">Pro&nbsp;Trader</span>;
  if (tier === 'pro')
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs align-middle bg-emerald-400/5 text-emerald-200 border border-emerald-500/20">Pro</span>;
  return null;
}
