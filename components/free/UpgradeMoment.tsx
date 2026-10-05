'use client';
import { useState } from 'react';
import { trackFreeEvent } from '@/lib/free/funnel';
import Link from 'next/link';
import { FREE_COPY } from './copy';
export type Moment = 'scan' | 'alerts' | 'watchlists' | 'portfolio' | 'journal' | 'ai';
export function useUpgradeMoment() {
  const [moment, setMoment] = useState<Moment | null>(null);
  function show(kind: Moment) {
    try { if (sessionStorage.getItem(`msp-upgrade-dismissed:${kind}`)) return; } catch {}
    setMoment(kind);
  }
  return { moment, show, dismiss: () => {
    try { if (moment) sessionStorage.setItem(`msp-upgrade-dismissed:${moment}`, '1'); } catch {}
    setMoment(null);
  } };
}
export default function UpgradeMoment({ kind, dismiss }: { kind: Moment; dismiss: () => void }) {
  return <section role="status" className="space-y-3 rounded-xl border border-white/15 p-4"><p>{FREE_COPY.moments[kind]}</p><div className="flex flex-wrap gap-3"><Link href="/pricing" data-funnel-upgrade="handled" onClick={() => trackFreeEvent('upgrade_click', kind)} className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-4">{FREE_COPY.upgrade}</Link><button className="min-h-11 px-3" onClick={dismiss}>{FREE_COPY.notNow}</button></div></section>;
}
