import type { PriceEvidence } from '@/lib/research/priceEvidence';
import type { TimingEvidence } from '@/lib/research/timingEvidence';

/**
 * The top of the Symbol page (ticker research page, Phase 3): a factual summary instead of a trade verdict, the date
 * behind each kind of observation, and whether each research section has its data. Built only from the shared
 * snapshot (Phase 2); nothing here is scored or forecast, and a missing input is reported as missing.
 */
export const RESEARCH_SNAPSHOT = { version: 'research-snapshot-v1' } as const;

/** The subset of the canonical packet the snapshot reads (structural, so the builder stays pure and client-safe). */
export type SnapshotCanonical = {
  symbol: string;
  assetClass: 'equity' | 'crypto' | 'forex';
  priceTs: string | null;
  lastCompletedBarAt: string | null;
  source: string | null;
  dataTrust: { level: string; label: string; reasons: string[] };
  options: { expiry: string; snapshotTs: string; avgIvPct: number | null; quality: { level: string; reasons: string[] } } | null;
  fundamentals: { lastReportedQuarter: string | null } | null;
  network?: unknown | null;
};
export type VolatilityRelease = { type: string; state: string } | null | undefined;

export type ObservationDate = { id: 'quote' | 'bar' | 'options' | 'fundamentals' | 'built'; label: string; value: string | null; basis: string };
export type SectionId = 'price' | 'volatility' | 'options' | 'timing' | 'fundamentals';
export type SectionStatus = { id: SectionId; label: string; status: 'available' | 'partial' | 'missing' | 'not applicable'; note: string };
export type ResearchSnapshot = { version: string; summary: string[]; dates: ObservationDate[]; sections: SectionStatus[]; nextEvent: string | null };

const day = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
function list(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The Volatility (DVE) release reading in words. Undefined (not loaded) → null, so nothing is claimed; with `always`,
 * a quiet reading is stated even when volatility is not compressed.
 */
export function releaseStatement(rel: VolatilityRelease, volatility: 'compressed' | 'normal' | 'expanded' | null, always = false): string | null {
  if (rel === undefined) return null;
  if (rel === null) return 'The volatility release reading is not available.';
  if (/release/.test(rel.type) && rel.state === 'fired') return `A volatility release was recorded (${rel.type.endsWith('_up') ? 'upward' : 'downward'}).`;
  if (rel.state === 'armed') return 'A volatility release condition is being watched but has not been met.';
  if (volatility === 'compressed') return 'A volatility release has not been recorded.';
  return always ? 'No volatility release signal is recorded on the latest reading.' : null;
}

export function buildResearchSnapshot(input: {
  canonical: SnapshotCanonical;
  priceEvidence?: PriceEvidence | null;
  timingEvidence?: TimingEvidence | null;
  /** Latest Volatility (DVE) signal; undefined when not loaded, so no release statement is made. */
  volatilityRelease?: VolatilityRelease;
}): ResearchSnapshot {
  const c = input.canonical, pe = input.priceEvidence ?? null, te = input.timingEvidence ?? null, sym = c.symbol;
  const equity = c.assetClass === 'equity';
  const summary: string[] = [];

  // 1. Price position and state, in the words of the measured evidence.
  if (pe) {
    const la = pe.states.longerAverages;
    if (la) summary.push(la === 'mixed' ? `${sym} is between its 50-day and 200-day averages.` : `${sym} is ${la} its longer-term (50- and 200-day) averages.`);
    const s = pe.states, rest: string[] = [];
    if (s.volume) rest.push(`${s.volume} volume`);
    if (s.trend) rest.push(`${s.trend} trend strength`);
    if (s.volatility) summary.push(`Daily volatility is ${s.volatility}${rest.length ? `, with ${list(rest)}` : ''}.`);
    else if (rest.length) summary.push(`Daily readings show ${list(rest)}.`);
  } else summary.push(`Measured daily evidence is not available for ${sym} on this timeframe.`);

  // 2. Volatility release, only when the Volatility reading was loaded.
  const relText = releaseStatement(input.volatilityRelease, pe?.states.volatility ?? null);
  if (relText) summary.push(relText);

  // 3. Options coverage, with its own date.
  if (equity) {
    const o = c.options;
    if (!o) summary.push('Options data was not collected.');
    else if (o.quality.level !== 'GOOD') summary.push(`Options data for the ${o.expiry} expiry is ${o.quality.level.toLowerCase()}${o.quality.reasons[0] ? `: ${o.quality.reasons[0].replace(/\.$/, '')}` : ''}.`);
    else summary.push(`Options open interest for the ${o.expiry} expiry is from ${day(o.snapshotTs) ?? 'an undated quote'}.`);
  }
  if (c.dataTrust.level !== 'GOOD') summary.push(`Price data check: ${c.dataTrust.label}${c.dataTrust.reasons[0] ? ` (${c.dataTrust.reasons[0].replace(/\.$/, '')})` : ''}.`);

  // Dates: retrieval time, market observation time, bar date and reporting period are different things.
  const dates: ObservationDate[] = [
    { id: 'quote', label: 'Latest price', value: c.priceTs, basis: c.source ? `quote, ${c.source}` : 'quote' },
    { id: 'bar', label: 'Last completed daily bar', value: pe?.basis.lastCompletedBar ?? day(c.lastCompletedBarAt), basis: pe?.basis.excludedPartialBar ? `unfinished ${pe.basis.excludedPartialBar} bar excluded` : 'daily analysis' },
  ];
  if (equity) dates.push({ id: 'options', label: 'Options quotes', value: c.options?.snapshotTs ?? null, basis: c.options ? `expiry ${c.options.expiry}` : 'not collected' });
  if (equity) dates.push({ id: 'fundamentals', label: 'Company reports', value: c.fundamentals?.lastReportedQuarter ?? null, basis: 'latest reported quarter' });
  if (te) dates.push({ id: 'built', label: 'Snapshot built', value: te.asOfUtc, basis: 'retrieval time' });

  // Next known event: earnings (equities) or the first scheduled high-importance release.
  let nextEvent: string | null = null;
  const e = te?.earnings, r = te?.releases?.[0];
  const ed = e?.date ?? null, rd = r ? r.releaseTimeUtc.slice(0, 10) : null;
  if (ed && (!rd || ed <= rd)) nextEvent = `Earnings ${ed}${e?.sessionsAway ? ` (${e.sessionsAway} session${e.sessionsAway === 1 ? '' : 's'} away)` : ''}`;
  else if (r) nextEvent = `${r.name} (${r.country}) ${r.releaseTimeUtc.slice(0, 16).replace('T', ' ')} UTC`;
  else if (te?.releasesBasis?.status === 'available') nextEvent = `No high-importance scheduled release in the next ${te.releasesBasis.horizonDays} days`;
  if (nextEvent) summary.push(`Next known event: ${nextEvent}.`);

  const sections: SectionStatus[] = [];
  sections.push(!pe ? { id: 'price', label: 'Price and structure', status: 'missing', note: 'No dated daily bars on this timeframe.' }
    : pe.missing.some((m) => /^(SMA|EMA|ADX|RSI|ATR)/.test(m)) ? { id: 'price', label: 'Price and structure', status: 'partial', note: `${pe.basis.barsUsed} completed bars; some measures need more history.` }
    : { id: 'price', label: 'Price and structure', status: 'available', note: `${pe.basis.barsUsed} completed daily bars.` });
  const volParts = [pe?.atr14 != null, pe?.bbwp != null, pe?.realisedVol20 != null, equity ? c.options?.avgIvPct != null : true];
  sections.push({ id: 'volatility', label: 'Volatility', status: volParts.every(Boolean) ? 'available' : volParts.some(Boolean) ? 'partial' : 'missing',
    note: [pe?.bbwp == null ? 'BBWP needs a year of bars' : null, equity && c.options?.avgIvPct == null ? 'options IV not collected' : null].filter(Boolean).join('; ') || 'ATR, BBWP and realised volatility measured.' });
  sections.push(!equity ? { id: 'options', label: 'Options', status: 'not applicable', note: c.assetClass === 'crypto' ? 'No listed options feed for crypto; derivatives are shown separately.' : 'No options feed for this asset.' }
    : !c.options ? { id: 'options', label: 'Options', status: 'missing', note: 'Options chain not collected.' }
    : { id: 'options', label: 'Options', status: c.options.quality.level === 'GOOD' ? 'available' : c.options.quality.level === 'DEGRADED' ? 'partial' : 'missing', note: c.options.quality.reasons[0] ?? `Expiry ${c.options.expiry}.` });
  sections.push(!te ? { id: 'timing', label: 'Timing and events', status: 'missing', note: 'Session and calendar not built.' }
    : te.releasesBasis?.status === 'unavailable' || (equity && te.earnings?.status === 'unknown') ? { id: 'timing', label: 'Timing and events', status: 'partial', note: te.releasesBasis?.status === 'unavailable' ? 'Economic calendar unavailable.' : 'Next earnings date unknown.' }
    : { id: 'timing', label: 'Timing and events', status: 'available', note: 'Session, bar closes and scheduled events.' });
  sections.push(equity
    ? (c.fundamentals ? { id: 'fundamentals', label: 'Fundamentals', status: c.fundamentals.lastReportedQuarter ? 'available' : 'partial', note: c.fundamentals.lastReportedQuarter ? `Latest reported quarter ${c.fundamentals.lastReportedQuarter}.` : 'Reporting period not recorded.' }
      : { id: 'fundamentals', label: 'Fundamentals', status: 'missing', note: 'Company overview not collected.' })
    : { id: 'fundamentals', label: 'Network data', status: c.network ? 'available' : 'missing', note: c.network ? 'Supply, market cap and relative strength.' : 'Network data not collected.' });

  return { version: RESEARCH_SNAPSHOT.version, summary, dates, sections, nextEvent };
}
