// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import StatCards from '@/components/crypto/top/StatCards';
import CryptoSourceLine from '@/components/crypto/top/SourceLine';
import SourceLine from '@/components/visual/SourceLine';
import { metric } from '@/lib/crypto/breakdown/okx';
import { freshness } from '@/lib/crypto/breakdown/freshness';
import { cryptoFundingHighlights, formatFundingRate, FUNDING_NOT_COLLECTED } from '@/lib/crypto/fundingDisplay';
import { classifyCommodityFreshness, commodityCardStatusLabel } from '@/lib/commodityFreshness';
import { scannerSourceAgreement } from '@/lib/scanner/sourceAgreement';
import { formatMarketTime } from '@/lib/market/priceStamp';
import type { TopFacts } from '@/lib/crypto/breakdown/top';

afterEach(() => cleanup());

function fundingTop(rate: number | null): TopFacts {
  const stamp = { label: 'Funding', value: rate, source: 'OKX NEAR-USDT-SWAP only (one venue)', asOf: '2026-10-05T07:42:27.825Z', basis: 'Current-period estimate', status: 'Live' as const };
  return {
    rule: { volumeRatio: null },
    funding: rate == null ? { ...stamp, value: null, status: 'Unknown' } : stamp,
    fundingInterval: { ...stamp, label: 'Funding interval', value: 8 },
    openInterest: { ...stamp, label: 'Open interest', value: 1_000_000 },
    perpetualListed: { ...stamp, label: 'Perpetual listed', value: true },
  } as TopFacts;
}

function FundingPair({ rate, annualized }: { rate: number | null; annualized: number | null }) {
  const highlights = cryptoFundingHighlights(rate == null ? null : { ratePercent8h: rate, annualizedPercent: annualized });
  return (
    <div>
      <StatCards top={fundingTop(rate)} zone="UTC" />
      <div data-derivatives-card>
        {highlights.map((item) => <p key={item.label}>{item.label}: {item.value}</p>)}
      </div>
    </div>
  );
}

describe('data truth labels', () => {
  it('never renders an open-interest observation clock that is in the future', () => {
    const now = Date.parse('2026-10-05T07:42:50Z');
    const slight = new Date(now + 30_000).toISOString();
    const settled = metric('Open interest (USD)', 12_000_000, 'OKX NEAR-USDT-SWAP', slight, 'Venue-reported oiUsd', 'okx', 'usd', now);
    expect(Date.parse(settled.asOf!)).toBeLessThanOrEqual(now);
    expect(settled.reason).not.toContain('in the future');
    expect(formatMarketTime(settled.asOf, 'UTC')).toBe(formatMarketTime(now, 'UTC'));
    expect(formatMarketTime(settled.asOf, 'UTC')).not.toBe(formatMarketTime(slight, 'UTC'));

    const far = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const future = metric('Open interest (USD)', 12_000_000, 'OKX NEAR-USDT-SWAP', far, 'Venue-reported oiUsd', 'okx', 'usd', now);
    expect(future.asOf).toBeNull();
    expect(future.reason).toContain('observation time is in the future');
    const farLabel = formatMarketTime(far, 'UTC');
    const { container } = render(<CryptoSourceLine stamp={future} zone="UTC" />);
    expect(container.textContent).toContain('observation time is in the future');
    expect(container.textContent).not.toContain(farLabel);
    expect(freshness('daily', '2026-10-03', Date.parse('2026-10-04T01:00:00Z')).status).toBe('Last close');
    const daily = metric('Last daily bar close', 10, 'CoinGecko', '2026-10-03', 'Completed UTC day', 'daily', 'price', Date.parse('2026-10-04T01:00:00Z'));
    expect(daily.asOf).toBe('2026-10-03');
    expect(daily.reason).not.toContain('in the future');
  });

  it('funding tile and derivatives card show the same collected or not-collected state', () => {
    const present = render(<FundingPair rate={0.01} annualized={10.95} />);
    const tile = present.container.querySelector('[data-stat-card]')?.textContent ?? '';
    const card = present.container.querySelector('[data-derivatives-card]')?.textContent ?? '';
    expect(tile).toContain(formatFundingRate(0.01));
    expect(card).toContain(`Funding rate: ${formatFundingRate(0.01)}`);
    expect(card).toContain('10.95%');
    expect(tile).not.toContain('Unavailable');
    expect(card).not.toContain('Unavailable');
    expect(card).not.toContain(FUNDING_NOT_COLLECTED);
    present.unmount();

    const missing = render(<FundingPair rate={null} annualized={null} />);
    const missingTile = missing.container.querySelector('[data-stat-card]')?.textContent ?? '';
    const missingCard = missing.container.querySelector('[data-derivatives-card]')?.textContent ?? '';
    expect(missingTile).toContain(FUNDING_NOT_COLLECTED);
    expect(missingCard).toContain(`Funding rate: ${FUNDING_NOT_COLLECTED}`);
    expect(missingCard).toContain(`Annualized funding: ${FUNDING_NOT_COLLECTED}`);
    expect(missingTile).not.toContain('0.0000%');
    expect(missingCard).not.toContain('0.0000%');
    expect(missingTile).not.toContain('Unavailable');
    expect(missingCard).not.toContain('Unavailable');

    const zero = render(<FundingPair rate={0} annualized={0} />);
    expect(zero.container.textContent).toContain('0.0000%');
    expect(zero.container.querySelector('[data-derivatives-card]')?.textContent).toContain('0.00%');
    expect(zero.container.querySelector('[data-stat-card]')?.textContent).not.toContain(FUNDING_NOT_COLLECTED);
  });

  it('does not label a days-old commodity quote LIVE', () => {
    const now = Date.parse('2026-10-05T07:00:00Z');
    const friday = classifyCommodityFreshness({ source: 'ETF_PROXY', date: '2026-10-02', maxAgeDays: 7, ageDays: 3, nowMs: now });
    expect(friday).toBe('DELAYED');
    const live = classifyCommodityFreshness({ source: 'ETF_PROXY', date: '2026-10-05', maxAgeDays: 7, ageDays: 0, observedAtMs: now - 30_000, nowMs: now });
    expect(live).toBe('LIVE');
    const stale = classifyCommodityFreshness({ source: 'ETF_PROXY', date: '2026-09-20', maxAgeDays: 7, ageDays: 15, nowMs: now });
    expect(stale).toBe('STALE');
    const spotToday = classifyCommodityFreshness({ source: 'SPOT', date: '2026-10-05', maxAgeDays: 2, ageDays: 0, nowMs: now });
    expect(spotToday).not.toBe('LIVE');

    function Label({ freshnessStatus, cadence }: { freshnessStatus: 'LIVE' | 'DELAYED' | 'STALE'; cadence: 'live' | 'monthly' }) {
      const text = commodityCardStatusLabel({ freshnessStatus, cadence });
      return <span>{text}{cadence === 'live' ? ' · proxy USO' : ''}</span>;
    }
    const staleView = render(<Label freshnessStatus={friday === 'STALE' ? 'STALE' : friday} cadence="live" />);
    expect(staleView.container.textContent).toContain('Last close');
    expect(staleView.container.textContent).not.toContain('LIVE');
    staleView.unmount();
    const liveView = render(<Label freshnessStatus={live} cadence="live" />);
    expect(liveView.container.textContent).toContain('LIVE');
    liveView.unmount();
    const oldView = render(<Label freshnessStatus={stale} cadence="live" />);
    expect(oldView.container.textContent).toContain('STALE');
    expect(oldView.container.textContent).not.toContain('LIVE');
    const monthly = render(<Label freshnessStatus="DELAYED" cadence="monthly" />);
    expect(monthly.container.textContent).toContain('MONTHLY');
    expect(monthly.container.textContent).not.toContain('LIVE');
  });

  it('scanner source line agrees with Data Ready', () => {
    const source = 'coingecko ohlc/range interval=daily + market_chart/range total_volumes';
    const bar = '2026-10-05T06:00:00.000Z';
    function Pair(input: { feedClear: boolean; demo?: boolean; sources: Array<string | null>; bars: Array<string | null> }) {
      const agreement = scannerSourceAgreement({ feedClear: input.feedClear, demo: input.demo, sources: input.sources, lastCompletedBars: input.bars });
      const health = agreement.ready ? 'Ready' : 'Not collected';
      return (
        <div>
          <span data-health>{health}</span>
          <SourceLine source={agreement.ready ? agreement.source : input.demo ? 'Example' : 'Scanner queue'} asOf={agreement.ready ? agreement.asOf : undefined} tradingDay={agreement.ready ? agreement.tradingDay : undefined} basis="Last completed bar" />
        </div>
      );
    }
    const ready = render(<Pair feedClear sources={[source]} bars={[bar]} />);
    expect(ready.container.querySelector('[data-health]')?.textContent).toBe('Ready');
    const line = ready.container.querySelector('[data-source-line]')?.textContent ?? '';
    expect(line).toContain(source);
    expect(line).not.toContain('Not available right now');
    expect(line).toMatch(/\d{2}:\d{2}/);
    ready.unmount();

    const missing = render(<Pair feedClear sources={[null, '']} bars={[null]} />);
    expect(missing.container.querySelector('[data-health]')?.textContent).not.toBe('Ready');
    expect(missing.container.querySelector('[data-source-line]')?.textContent).toContain('Not available right now');
    missing.unmount();

    const demo = render(<Pair feedClear demo sources={['local_demo']} bars={[bar]} />);
    expect(demo.container.querySelector('[data-health]')?.textContent).not.toBe('Ready');
    expect(demo.container.querySelector('[data-source-line]')?.textContent).toContain('Example');
  });
});
