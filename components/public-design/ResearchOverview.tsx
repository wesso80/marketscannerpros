'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useEconomicCalendar, useSectorsHeatmap } from '@/app/v2/_lib/api';
import { usePublicMarketFeed } from '@/hooks/usePublicMarketFeed';
import { upcomingConfirmedEvents, calendarTimingNote, releaseReadingLabel } from '@/lib/calendarPresentation';
import SignInLock from './SignInLock';
import { type DisplayQuote, quoteStamp } from '@/lib/market/quotePresentation';
import { symbolHref } from '@/lib/market/links';
import { formatMarketTime } from '@/lib/market/priceStamp';
import PriceStamp from '@/components/market/PriceStamp';
import styles from './ResearchOverview.module.css';

const universe = [
  ['SPY', 'S&P 500 ETF', 'equity'], ['QQQ', 'Nasdaq-100 ETF', 'equity'],
  ['IWM', 'Russell 2000 ETF', 'equity'], ['DIA', 'Dow Jones ETF', 'equity'],
  ['BTC', 'Bitcoin', 'crypto'], ['ETH', 'Ethereum', 'crypto'], ['SOL', 'Solana', 'crypto'],
] as const;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const percent = (n: number | null | undefined) => finite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : 'Not available';

export default function ResearchOverview() {
  const quotes = usePublicMarketFeed<{quotes: Record<string, DisplayQuote>}>('/api/cached/bulk-quotes?symbols=BTC,ETH,SOL,SPY,QQQ,IWM,DIA');
  const sectors = useSectorsHeatmap();
  const calendar = useEconomicCalendar();
  const [asset, setAsset] = useState('all');
  const [movement, setMovement] = useState('all');
  const rows = universe.filter(([symbol,,type]) => {
    const change = quotes.data?.quotes?.[symbol]?.changePct;
    return (asset === 'all' || asset === type) && (movement === 'all' || (finite(change) && (movement === 'positive' ? change > 0 : movement === 'negative' ? change < 0 : change === 0)));
  });
  const sectorRows = [...(sectors.data?.sectors ?? [])].sort((a,b) => a.name.localeCompare(b.name));
  const scale = Math.max(1, ...sectorRows.map(row => finite(row.changePercent) ? Math.abs(row.changePercent) : 0));
  const events = upcomingConfirmedEvents(calendar.data?.events ?? []).slice(0, 4);
  const timingNote = calendarTimingNote(calendar.data?.events);
  return <article className={styles.overview}>
    <header className={styles.hero}><div><p className={styles.kicker}>Your research starts here</p><h1>Overview</h1><p className={styles.lead}>Observe the market. Choose what to explore.</p></div><Link href="/tools/golden-egg" className={styles.primary}>Research a symbol</Link></header>
    <section className={styles.benchmarks} aria-label="Benchmark observations">{universe.filter(([symbol]) => ['SPY','QQQ','BTC'].includes(symbol)).map(([symbol,name,type]) => <div key={symbol}><Link href={symbolHref(symbol,type)}>{symbol} <span>{name}</span></Link><strong>{percent(quotes.data?.quotes?.[symbol]?.changePct)}</strong><PriceStamp plain compact {...quoteStamp(symbol,type,quotes.data?.quotes?.[symbol])}/></div>)}</section>
    <p className={styles.note}>Equities compare with the previous session close; crypto compares with 24 hours earlier where supplied. Stored quotes may be delayed. Cache/database identifies delivery, not the original provider.</p>

    <div className={styles.context}>
      <section className={styles.panel} aria-labelledby="sector-title"><p className={styles.kicker}>Across the market</p><h2 id="sector-title">Sector observations</h2>        {sectors.loading ? <p role="status">Loading sectors…</p> : sectors.isAuthError ? <SignInLock heading="Sign in to see sector observations" detail="Sector changes are available after you sign in. The release calendar on this page stays visible." next="/tools/command-center"/> : <>
        <p className={styles.note}>Reported daily changes · alphabetical order · Alpha Vantage sector feed or ETF fallback</p>
        <p className={styles.note}>Observation: {sectors.data?.asOf ? formatMarketTime(sectors.data.asOf) ?? 'Not supplied' : sectors.data?.asOfTradingDay ?? 'Not supplied'}. Response: {formatMarketTime(sectors.data?.timestamp) ?? 'Not supplied'}.</p>
        {!sectorRows.length ? <p>Sector observations are unavailable.</p> : <div className={styles.sectors}>{sectorRows.map(row => <div className={styles.sector} key={row.symbol}><span>{row.name}</span><div className={styles.track} aria-hidden="true">{finite(row.changePercent) ? <i style={{width:`${Math.abs(row.changePercent)/scale*50}%`,left:row.changePercent<0?`${50-Math.abs(row.changePercent)/scale*50}%`:'50%',background:row.changePercent<0?'#a0b8d9':'#a5e8cf'}}/> : null}</div><strong>{percent(row.changePercent)}</strong></div>)}</div>}
        </>}
        <Link href="/tools/macro" className={styles.textLink}>Explore Macro Outlook</Link>
      </section>
      <section className={styles.panel} aria-labelledby="calendar-title"><p className={styles.kicker}>The release calendar</p><h2 id="calendar-title">What comes next</h2><p className={styles.note}>Confirmed future release times · shown in UTC</p>
        {calendar.loading ? <p role="status">Loading calendar…</p> : events.length ? events.map((event,i) => <div className={styles.event} key={`${event.event}-${event.releaseTimeUtc}-${i}`}><time dateTime={event.releaseTimeUtc}>{formatMarketTime(event.releaseTimeUtc)}</time><h3>{event.event}</h3><p>{event.country} · {releaseReadingLabel(event)}</p></div>) : <p>No confirmed upcoming releases available.</p>}
        {timingNote ? <p className={styles.note}>{timingNote}</p> : null}<Link href="/tools/macro" className={styles.textLink}>Review the calendar and sources</Link>
      </section>
    </div>

    <section className={styles.radar} aria-labelledby="radar-title"><div className={styles.sectionHeading}><div><p className={styles.kicker}>A starting point for investigation</p><h2 id="radar-title">Daily Radar</h2></div><span>7 benchmark symbols · fixed coverage</span></div>
      <p className={styles.note}>Filter this benchmark set by observed change. This is not a market-wide scan. Missing changes are excluded when a change filter is selected. No composite ranking is applied.</p>
      <div className={styles.filters}><label>Asset class<select value={asset} onChange={e=>setAsset(e.target.value)}><option value="all">All assets</option><option value="equity">Equity ETFs</option><option value="crypto">Crypto</option></select></label><label>Observed change<select value={movement} onChange={e=>setMovement(e.target.value)}><option value="all">All readings</option><option value="positive">Above zero</option><option value="negative">Below zero</option><option value="flat">Unchanged</option></select></label><p aria-live="polite">{rows.length} of 7 symbols</p></div>
      {quotes.loading ? <p role="status">Loading stored observations…</p> : quotes.error ? <p role="status">Stored quotes are unavailable. No current changes can be confirmed.</p> : null}
      <div className={styles.rows}>{rows.map(([symbol,name,type]) => <div key={symbol} className={styles.row}><div><Link href={symbolHref(symbol,type)}>{symbol}</Link><span>{name}</span></div><strong>{percent(quotes.data?.quotes?.[symbol]?.changePct)}</strong><div><PriceStamp plain compact {...quoteStamp(symbol,type,quotes.data?.quotes?.[symbol])}/>{quotes.data?.quotes?.[symbol]?.stale ? <p className={styles.note}>Stored observation is stale.</p> : null}</div></div>)}</div>
      {!rows.length && !quotes.loading ? <p>No available observations match these filters.</p> : null}
    </section>
    <footer className={styles.next}><div><h2>Keep the observation connected.</h2><p>Explore a symbol, record what you noticed, then revisit the evidence.</p></div><Link href="/tools/workspace?tab=Journal">Open Journal</Link><Link href="/learn">Learn the measurements</Link></footer>
  </article>;
}
