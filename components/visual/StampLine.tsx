'use client';
import React, { useEffect, useState } from 'react';
import { formatMarketTime, formatPriceStamp, type PriceStampInput } from '@/lib/market/priceStamp';
import { COPY } from './copy';
export type StampLineProps = { source?: string | null; asOf?: string | number | null; tradingDay?: string | null; basis?: string; quote?: PriceStampInput };
export default function StampLine({ source, asOf, tradingDay, basis, quote }: StampLineProps) {
  const [zone, setZone] = useState('UTC');
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const stamp = quote ? formatPriceStamp(quote, { timeZone: zone }) : null;
  const time = stamp?.timeLabel ?? formatMarketTime(asOf, zone);
  const missing = stamp?.missingTime ?? !time;
  // A session date is not an observation instant: retain it without inventing a close time.
  return <p data-stamp-line className="break-words text-[11px] leading-relaxed" style={{ color: missing || quote?.stale ? 'var(--msp-warn)' : 'var(--msp-text-muted)' }}>
    {source || quote?.source || COPY.today.sourceUnknown} · {time ?? (tradingDay ? `${tradingDay} (${COPY.today.sessionDay}) · ${COPY.today.timeUnknown}` : COPY.today.timeUnknown)}
    {stamp?.timeLabel.includes('(New York)') || missing ? ` · ${zone}` : ''} · {stamp?.basisLabel ?? basis}
  </p>;
}
