'use client';
import React, { useEffect, useState } from 'react';
import { COPY } from './copy';
/** Resolve the viewer's date after hydration; server timezone is not the viewer's timezone. */
export default function ViewerDate() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZoneName: 'short' }).format(new Date()));
  }, []);
  return <p className="text-xs text-[var(--msp-text-muted)]">{label ?? COPY.today.loading}</p>;
}
