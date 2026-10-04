'use client';
import React, { useEffect, useState } from 'react';
import { formatMarketTime, formatPriceStamp, type PriceStampInput } from '@/lib/market/priceStamp';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import { FREE_COPY } from '@/components/free/copy';
import { COPY } from './copy';
export type StampLineProps = { source?: string | null; asOf?: string | number | null; tradingDay?: string | null; basis?: string; quote?: PriceStampInput; plain?: boolean };
export default function StampLine({ source, asOf, tradingDay, basis, quote, plain = false }: StampLineProps) {
  const [zone, setZone] = useState('UTC');
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const stamp = quote ? formatPriceStamp(quote, { timeZone: zone }) : null;
  const time = stamp?.timeLabel ?? formatMarketTime(asOf, zone);
  const missing = stamp?.missingTime ?? !time;
  // A session date is not an observation instant: retain it without inventing a close time.
  const plainPart = (value?: string | null) => value && friendlyStatus(value) !== FREE_COPY.unavailable ? friendlyStatus(value) : null;
  if (plain) return <p data-source-line className="break-words text-xs text-[var(--msp-text-muted)]">Source · {[plainPart(source || quote?.source), plainPart(time) || tradingDay || 'Not available right now', plainPart(basis || stamp?.basisLabel)].filter(Boolean).join(' · ') || 'Not available right now'}</p>;
  return <p data-stamp-line className="break-words text-[11px] leading-relaxed" style={{ color: missing || quote?.stale ? 'var(--msp-warn)' : 'var(--msp-text-muted)' }}>
    {source || quote?.source || COPY.today.sourceUnknown} · {time ?? (tradingDay ? `${tradingDay} (${COPY.today.sessionDay}) · ${COPY.today.timeUnknown}` : COPY.today.timeUnknown)}
    {stamp?.timeLabel.includes('(New York)') || missing ? ` · ${zone}` : ''} · {stamp?.basisLabel ?? basis}
  </p>;
}
