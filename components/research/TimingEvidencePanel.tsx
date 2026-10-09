'use client';
import type { TimingEvidence } from '@/lib/research/timingEvidence';

const local = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'Not available');

/** Session status, upcoming bar closes, next earnings and scheduled releases. Facts with times; no timing score. */
export default function TimingEvidencePanel({ t }: { t: TimingEvidence }) {
  return (
    <div className="space-y-3 text-sm" data-timing-evidence>
      {t.summary.map((s) => <p key={s}>{s}</p>)}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {t.session.nextOpenUtc && <div className="flex justify-between gap-2 border-b border-white/5 py-1"><dt className="text-slate-400">Next regular-session open</dt><dd>{local(t.session.nextOpenUtc)}</dd></div>}
        {t.session.nextCloseUtc && <div className="flex justify-between gap-2 border-b border-white/5 py-1"><dt className="text-slate-400">Next regular-session close</dt><dd>{local(t.session.nextCloseUtc)}</dd></div>}
        {t.closes.map((c) => <div key={c.timeframe} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1"><dt className="text-slate-400">{c.label}</dt><dd>{local(c.closesAtUtc)}</dd></div>)}
        {t.earnings && <div className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1"><dt className="text-slate-400">Next earnings</dt><dd>{t.earnings.date ?? (t.earnings.status === 'none in horizon' ? 'None in calendar horizon' : 'Unknown')}{t.earnings.lastReportedQuarter ? <span className="block text-xs text-slate-500">last reported quarter {t.earnings.lastReportedQuarter}</span> : null}</dd></div>}
      </dl>
      {t.releasesBasis && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scheduled releases, next {t.releasesBasis.horizonDays} days (high importance, US)</h4>
          {t.releasesBasis.status === 'unavailable' ? <p className="text-xs text-amber-300">Economic calendar unavailable; not checked.</p>
            : t.releases.length === 0 ? <p className="text-xs text-slate-400">None scheduled.</p>
            : <ul className="mt-1 space-y-1">{t.releases.map((r) => <li key={r.name + r.releaseTimeUtc} className="flex flex-wrap justify-between gap-2"><span>{r.name}{r.referencePeriod ? ` (${r.referencePeriod})` : ''}</span><span className="text-slate-300">{local(r.releaseTimeUtc)}{r.timingConfirmed ? '' : ' · time not confirmed'}</span></li>)}</ul>}
          <p className="mt-1 text-xs text-slate-500">Source: {t.releasesBasis.source}. Times in your local time zone.</p>
        </div>
      )}
      <p className="text-xs text-slate-500">As of {local(t.asOfUtc)}. Scheduled times can change; check the issuer before relying on them.</p>
    </div>
  );
}
