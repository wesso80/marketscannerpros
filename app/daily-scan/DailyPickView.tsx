import Link from 'next/link';
import { formatSessionDate } from '@/lib/time/usSession';
import { formatFloat, SELECTION_NOTE, SORT_NOTE, type DayData } from '@/lib/og/dailyPicksLatest';
import { readableObservedAt, readablePrice, readablePriceLabel } from './wording';

/**
 * Public /daily-pick: the latest daily-scan observations, measured values only (price, session change, float, short
 * interest, sector), sorted by symbol A–Z. No grade, verdict, direction, score or ranking (W3, 8 Oct).
 */
export default function DailyPickView({ data }: { data: DayData }) {
  const session = formatSessionDate(data.scan_date);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `MarketScannerPros daily scan observations ${data.scan_date}`,
    dateModified: data.scan_date,
    itemListOrder: 'https://schema.org/ItemListUnordered',
    numberOfItems: data.picks.length,
    itemListElement: data.picks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://marketscannerpros.app/share/scan/${p.symbol}`,
      name: p.symbol,
    })),
  };

  return (
    <main style={pageStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={containerStyle}>
        <div style={{ color: 'var(--msp-flat)', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          MarketScannerPros · Daily scan
        </div>
        <h1 style={h1Style}>Daily scan observations · {session}</h1>
        <p data-daily-picks-summary style={{ color: 'var(--msp-text)', fontSize: 17, lineHeight: 1.6, marginTop: 6, maxWidth: 760 }}>
          {data.picks.length} symbols stored by the daily scan for the {session} US session. Crypto rows use the latest completed daily candle.
          Each row is a measured snapshot, not a recommendation.
        </p>
        {data.pricesAsOfNote ? (
          <p data-prices-as-of style={{ color: 'var(--msp-text)', fontSize: 15, lineHeight: 1.5, marginTop: 8, maxWidth: 760 }}>
            {data.pricesAsOfNote}
          </p>
        ) : null}
        <p data-selection-note style={{ color: 'var(--msp-text-muted)', fontSize: 13, lineHeight: 1.6, marginTop: 4, maxWidth: 760 }}>
          {SELECTION_NOTE} {SORT_NOTE}
        </p>

        <div style={{ marginTop: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={rowHeaderStyle}>
            <div style={{ ...cellStyle, flex: 1 }}>Symbol</div>
            <div style={{ ...cellStyle, width: 150, justifyContent: 'flex-end' }}>Price</div>
            <div style={{ ...cellStyle, width: 100, justifyContent: 'flex-end' }}>Session chg</div>
            <div style={{ ...cellStyle, width: 90, justifyContent: 'flex-end' }}>Float</div>
            <div style={{ ...cellStyle, width: 90, justifyContent: 'flex-end' }}>Short %</div>
          </div>
          {data.picks.map((p) => (
            <div key={`${p.asset_class}-${p.symbol}`} data-pick-row>
              <Link href={`/share/scan/${p.symbol}`} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ ...cellStyle, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 17 }}>{p.symbol}</span>
                  <span style={{ color: 'var(--msp-text-muted)', marginLeft: 8, fontSize: 12 }}>{p.asset_class === 'crypto' ? 'Crypto' : p.sector ?? 'Equity'}</span>
                </div>
                <div style={{ ...cellStyle, width: 150, justifyContent: 'flex-end', textAlign: 'right' as const }}>
                  <span>{readablePrice(p.price)}<small style={{ display: 'block' }}>{readablePriceLabel(p.priceLabel)}</small><small style={{ display: 'block' }}>Data as of {readableObservedAt(p.dataAsOf)}{p.stale ? ' · older than the latest session' : ''}</small></span>
                </div>
                <div style={{ ...cellStyle, width: 100, justifyContent: 'flex-end', color: 'var(--msp-text)' }}>
                  {p.change_percent != null ? `${p.change_percent >= 0 ? '+' : ''}${p.change_percent.toFixed(2)}%` : 'Not recorded'}
                </div>
                <div style={{ ...cellStyle, width: 90, justifyContent: 'flex-end', color: 'var(--msp-text)' }}>{formatFloat(p.shares_float) ?? 'Not collected'}</div>
                <div style={{ ...cellStyle, width: 90, justifyContent: 'flex-end', color: 'var(--msp-text)' }}>{p.short_pct_float != null ? `${p.short_pct_float.toFixed(1)}%` : 'Not collected'}</div>
              </Link>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, padding: '20px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: '#F8FAFC' }}>Want the full research workspace?</h2>
          <p style={{ margin: '8px 0 16px', color: 'var(--msp-text)' }}>
            This page is a daily snapshot. The full MarketScannerPros workspace covers more symbols with measured evidence pages, backtesting
            and a research journal.
          </p>
          <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 22px', background: 'var(--msp-bull)', color: 'var(--msp-bg)', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            See pricing →
          </Link>
        </div>

        <p data-source-line style={{ marginTop: 24, fontSize: 12, color: 'var(--msp-text-muted)', lineHeight: 1.6 }}>
          Source · Float and short interest from Alpha Vantage OVERVIEW · end-of-day prices from MSP&apos;s daily cache · US session {session}
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--msp-text-muted)', lineHeight: 1.6 }}>
          Educational research only. Not investment advice. No order routing. Past performance does not
          predict future returns.
        </p>
      </div>
    </main>
  );
}

const pageStyle = { minHeight: '100vh', background: 'var(--msp-bg)', color: '#F8FAFC', padding: '48px 20px' };
const containerStyle = { maxWidth: 1000, margin: '0 auto' };
const h1Style = { fontSize: 40, margin: '6px 0 12px', fontWeight: 800, lineHeight: 1.15 };
const cellStyle = { padding: '12px 14px', fontSize: 14, display: 'flex', alignItems: 'center' };
const rowHeaderStyle = { display: 'flex', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--msp-flat)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const };
const rowStyle = { display: 'flex', borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 120ms' };
