'use client';

import { useEffect, useState } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import { readStartHereStatus, shouldShowStartHere, type StartHereStatus } from '@/lib/free/startHere';
import { FREE_COPY } from './copy';
import StartHere from './StartHere';
import StartToday from './StartToday';

export default function StartGate() {
  const { tier, isLoading, isLoggedIn, isAdmin } = useUserTier();
  const [status, setStatus] = useState<StartHereStatus | null | undefined>(undefined);

  useEffect(() => { setStatus(readStartHereStatus()); }, []);

  const waitingForFlag = isLoggedIn && !isAdmin && tier === 'free' && !isPaidTier(tier);
  if (isLoading || (waitingForFlag && status === undefined)) {
    return <p className="p-4 text-sm text-[var(--msp-text-muted)]">{FREE_COPY.loading}</p>;
  }
  if (!shouldShowStartHere({ isLoggedIn, isAdmin, tier, status: status ?? null })) {
    return <StartToday />;
  }
  return <StartHere onSkip={() => setStatus('skipped')} />;
}
