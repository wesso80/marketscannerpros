'use client';
import { trackFreeEvent } from '@/lib/free/funnel';
import { useEffect } from 'react';
import Link from 'next/link';
import { FREE_COPY } from './copy';
export default function LockedPreview({ tool, description }: { tool: string; description?: string }) {
  useEffect(() => trackFreeEvent('locked_preview_view', tool, tool), [tool]);
  return <section className="mx-auto w-full min-w-0 max-w-xl space-y-4 rounded-xl border border-white/10 p-4 sm:p-6">
    <h2 className="text-xl font-semibold">{tool}</h2>
    <div className="rounded-lg bg-white/5 p-4"><p className="text-xs">{FREE_COPY.example}</p>
      <div aria-hidden="true" className="select-none space-y-3 py-4 blur-sm"><div className="h-5 w-4/5 rounded bg-slate-500/40" /><div className="h-5 w-3/5 rounded bg-slate-500/30" /><div className="h-5 w-2/5 rounded bg-slate-500/20" /></div>
      <p className="text-xs">{FREE_COPY.exampleBasis}</p>
    </div>
    <p>{description || FREE_COPY.lockedDescription}</p>
    <Link href="/pricing" onClick={() => trackFreeEvent('upgrade_click', tool)} className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-4">{FREE_COPY.upgrade}</Link>
    <p className="text-xs text-[var(--msp-text-muted)]">{FREE_COPY.guarantee}</p>
  </section>;
}
