'use client';
import { useEffect, useState } from 'react';
import { trackFreeEvent } from '@/lib/free/funnel';
import Link from 'next/link';
import type { radarPreview } from '@/lib/free/radarPreview';
import { FREE_COPY } from './copy';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import Stamp from './Stamp';
export default function RadarPreview() {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof radarPreview>> | undefined>(undefined);
  useEffect(() => {
    trackFreeEvent('locked_preview_view', 'radar', 'radar');
    const abort = new AbortController();
    fetch('/api/msp-radar/preview', { signal: abort.signal }).then(async response => { if (!response.ok) throw new Error(); const data = await response.json(); setPreview(data.preview); }).catch(() => { if (!abort.signal.aborted) setPreview(null); });
    return () => abort.abort();
  }, []);
  return <section className="min-w-0 space-y-3 rounded-xl border border-white/10 p-4">
    <h2 className="text-lg font-semibold">{FREE_COPY.radar}</h2>
    {preview === undefined ? <p>{FREE_COPY.loading}</p> : !preview ? <p>{FREE_COPY.unavailable}</p> : <>
      <p>{preview.status !== 'FAILED' && preview.candidateCount != null && <><strong>{preview.candidateCount}</strong> {FREE_COPY.picks} · </>}{preview.status === 'COMPLETE' ? FREE_COPY.reportReady : preview.status === 'FAILED' ? FREE_COPY.unavailable : friendlyStatus(preview.status)}</p>
      <Stamp source={FREE_COPY.radar} at={preview.sessionDate} basis={FREE_COPY.session} />
      {!!preview.previous?.symbols.length && <div><p className="text-xs">{FREE_COPY.fromReport(preview.previous.sessionDate)}</p><p>{preview.previous.symbols.join(' · ')}</p></div>}
    </>}
    <Link href="/pricing" data-funnel-upgrade="handled" onClick={() => trackFreeEvent('upgrade_click', 'radar')} className="inline-flex min-h-10 items-center underline">{FREE_COPY.unlockReport}</Link>
  </section>;
}
