'use client';
import { useEffect, useState } from 'react';
import { FREE_COPY } from './copy';
export function localStamp(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return FREE_COPY.stampUnavailable;
  // A session date is not an instant; don't move it to yesterday in another zone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} · ${FREE_COPY.basis}`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
}
export default function Stamp({ at, source = FREE_COPY.source, basis = FREE_COPY.basis }: { at?: string | null; source?: string; basis?: string }) {
  const [stamp, setStamp] = useState(FREE_COPY.loading as string);
  useEffect(() => setStamp(localStamp(at)), [at]);
  return <p className="mt-1 break-words text-xs text-[var(--msp-text-muted)]">{source} · {stamp} · {basis}</p>;
}
