import Link from 'next/link';
import { formatSessionDate } from '@/lib/time/usSession';
import { formatFloat, type DayData, type DailyPickRow } from '@/lib/og/dailyPicksLatest';
import { sessionChangeBarWidths } from '@/lib/overview/pickBars';
import { evidenceLabel, foldedEngineDetail, readableObservedAt, readablePrice, readablePriceLabel, readableScore, readerVerdict, storedScoreText } from './wording';

function ScoringFold({ pick }: { pick: DailyPickRow }) {
  const record = foldedEngineDetail(pick.canonical);
  return (
    <div style={{ fontSize: 12, color: 'var(--msp-text-muted)', lineHeight: 1.5 }}>
      {record ? <p style={{ margin: '8px 0 0' }}>{record}</p> : <p style={{ margin: '8px 0 0' }}>No separate scoring record stored for this row.</p>}
      <p style={{ margin: '4px 0 0' }}>Stored score {storedScoreText(pick.score)}</p>
      {pick.canonical ? <p style={{ margin: '4px 0 0' }}>Earlier signal-count score {storedScoreText(pick.legacyScore)}</p> : null}
    </div>
  );
}

export default function DailyPickView({ data }: { data: DayData }) {
  const session = formatSessionDate(data.scan_date);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `MarketScanner Pros Daily Picks ${data.scan_date}`,
    dateModified: data.scan_date,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: data.picks.length,
    itemListElement: data.picks.map((p) => ({
      '@type': 'ListItem',
      position: p.rank,
      url: `https://marketscannerpros.app/share/scan/${p.symbol}`,
      name: `${p.symbol} (${evidenceLabel(p.direction)}, ${readerVerdict(p.canonical)}, score ${readableScore(p.score)})`,
    })),
  };

  return (
    <main style={pageStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={containerStyle}>
        <div style={{ color: 'var(--msp-flat)', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          MarketScanner Pros · Daily Picks
        </div>
        <h1 style={h1Style}>Top {data.picks.length} picks · latest market snapshots</h1>
        <p data-daily-picks-summary style={{ color: 'var(--msp-text)', fontSize: 17, lineHeight: 1.6, marginTop: 6, maxWidth: 760 }}>
          {data.picks.length} ranked snapshots for the {session} US session. Crypto rows use the latest completed daily candle.
          Open a symbol for its shareable card. Each row is a technical research snapshot, not a recommendation.
        </p>

        <div data-pick-cards style={{ marginTop: 28, display: 'grid', gap: 12 }}>
          {data.picks.slice(0, 3).map((p, index, cards) => {
            const side = evidenceLabel(p.direction);
            const sideColor = p.direction === 'bullish' ? 'var(--msp-bull)' : p.direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-warn)';
            const twins = data.picks.filter((other) => other.score === p.score);
            const distinction = [
              p.change_percent != null ? `session ${p.change_percent >= 0 ? '+' : ''}${p.change_percent.toFixed(2)}%` : null,
              p.sector,
              formatFloat(p.shares_float) ? `float ${formatFloat(p.shares_float)}` : null,
            ].filter(Boolean).join(', ');
            const width = sessionChangeBarWidths(cards.map((row) => row.change_percent))[index];
            return (
              <article key={`card-${p.asset_class}-${p.symbol}`} data-pick-card style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
                <Link href={`/share/scan/${p.symbol}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong style={{ fontSize: 22 }}>{p.symbol}</strong>
                    <span style={{ color: sideColor, fontWeight: 700, fontSize: 12 }}>{side}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{readableScore(p.score)}</div>
                  <div data-reader-verdict style={{ fontSize: 12, color: 'var(--msp-text-muted)' }}>{readerVerdict(p.canonical)}</div>
                  {width != null ? (
                    <div aria-label={`Session change ${p.change_percent}%`} style={{ marginTop: 12 }}>
                      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: 8, borderRadius: 99, width: `${width}%`, background: (p.change_percent ?? 0) >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>{p.change_percent! >= 0 ? '+' : ''}{p.change_percent!.toFixed(2)}% session change</div>
                    </div>
                  ) : <p style={{ marginTop: 12, fontSize: 12, color: 'var(--msp-text-muted)' }}>No session change recorded.</p>}
                  {twins.length > 1 && distinction ? <p style={{ marginTop: 8, fontSize: 12, color: 'var(--msp-text-muted)' }}>Same score as {twins.length - 1} other {twins.length > 2 ? 'picks' : 'pick'}. Separated by {distinction}.</p> : null}
                </Link>
                <details data-scoring-detail style={{ marginTop: 12 }}>
                  <summary style={{ minHeight: 40, cursor: 'pointer' }}>Scoring detail for {p.symbol}</summary>
                  <ScoringFold pick={p} />
                </details>
              </article>
            );
          })}
        </div>
        {data.picks.length > 3 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ minHeight: 40, cursor: 'pointer' }}>Show more</summary>
            <div style={{ marginTop: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={rowHeaderStyle}>
                <div style={{ ...cellStyle, width: 60 }}>#</div>
                <div style={{ ...cellStyle, flex: 1 }}>Symbol</div>
                <div style={{ ...cellStyle, width: 150 }}>Evidence</div>
                <div style={{ ...cellStyle, width: 150 }}>Verdict</div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Score</div>
                <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>Price</div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Chg %</div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Float</div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Short %</div>
              </div>
              {data.picks.slice(3).map((p) => {
                const side = evidenceLabel(p.direction);
                const sideColor = p.direction === 'bullish' ? 'var(--msp-bull)' : p.direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-warn)';
                return (
                  <div key={`${p.asset_class}-${p.symbol}`} data-pick-row>
                    <Link href={`/share/scan/${p.symbol}`} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ ...cellStyle, width: 60, color: 'var(--msp-text-muted)' }}>{p.rank}</div>
                      <div style={{ ...cellStyle, flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 17 }}>{p.symbol}</span>
                        {p.sector && <span style={{ color: 'var(--msp-text-muted)', marginLeft: 8, fontSize: 12 }}>{p.sector}</span>}
                      </div>
                      <div style={{ ...cellStyle, width: 150 }}>
                        <span style={{ color: sideColor, fontWeight: 700, fontSize: 12 }}>{side}</span>
                      </div>
                      <div data-reader-verdict style={{ ...cellStyle, width: 150, fontSize: 12, fontWeight: 700, color: p.canonical?.permission === 'PASS' ? 'var(--msp-bull)' : p.canonical?.permission === 'BLOCK' ? 'var(--msp-bear)' : 'var(--msp-warn)' }}>
                        {readerVerdict(p.canonical)}
                      </div>
                      <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, fontWeight: 700 }}>
                        {readableScore(p.score)}
                      </div>
                      <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>
                        <span>{readablePrice(p.price)}<small style={{ display: 'block' }}>{readablePriceLabel(p.priceLabel)}</small><small style={{ display: 'block' }}>Data as of {readableObservedAt(p.dataAsOf)}{p.stale ? ' · older than the latest session' : ''}</small></span>
                      </div>
                      <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: p.change_percent != null && p.change_percent >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                        {p.change_percent != null ? `${p.change_percent >= 0 ? '+' : ''}${p.change_percent.toFixed(2)}%` : '—'}
                      </div>
                      <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: 'var(--msp-text)' }}>
                        {formatFloat(p.shares_float) ?? '—'}
                      </div>
                      <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: 'var(--msp-text)' }}>
                        {p.short_pct_float != null ? `${p.short_pct_float.toFixed(1)}%` : '—'}
                      </div>
                    </Link>
                    <details data-scoring-detail style={{ padding: '0 14px 8px' }}>
                      <summary style={{ minHeight: 40, cursor: 'pointer' }}>Scoring detail for {p.symbol}</summary>
                      <ScoringFold pick={p} />
                    </details>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <div style={{ marginTop: 32, padding: '20px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: '#F8FAFC' }}>Want the full scanner?</h2>
          <p style={{ margin: '8px 0 16px', color: 'var(--msp-text)' }}>
            Picks above are a daily snapshot. The full MSP scanner runs across thousands of symbols
            with custom filters (RVOL, low-float, regime, options flow), backtesting, and a trade journal.
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
