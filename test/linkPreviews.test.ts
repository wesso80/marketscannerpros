import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Metadata } from 'next';
import { metadata as today } from '@/app/tools/start/layout';
import { metadata as overview } from '@/app/tools/command-center/layout';
import { metadata as radar } from '@/app/tools/msp-radar/layout';
import { metadata as pricing } from '@/app/pricing/layout';
import { generateMetadata as symbolMetadata } from '@/app/tools/golden-egg/metadata';
import { parseShareSymbol, SHARE_OG_HEIGHT, SHARE_OG_WIDTH, SHARE_SITE_NAME } from '@/lib/og/linkPreview';
import { decodePng } from './helpers/decodePng';

vi.mock('@/app/tools/golden-egg/GoldenEggClient', () => ({ default: () => null }));

const BANNED = /\b(buy|sell|buying|selling|return|returns|performance|win rate|guaranteed|profit)\b/i;

function textTitle(value: Metadata['title'] | NonNullable<Metadata['openGraph']>['title'] | NonNullable<Metadata['twitter']>['title']): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'absolute' in value && value.absolute) return value.absolute;
  return '';
}

function imageUrl(meta: Metadata): string {
  const images = meta.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  if (!first) return '';
  if (typeof first === 'string') return first;
  if (first instanceof URL) return first.toString();
  return String(first.url);
}

function expectShareCard(meta: Metadata, ogTitle: string) {
  expect(textTitle(meta.openGraph?.title)).toBe(ogTitle);
  expect(meta.openGraph?.description).toEqual(expect.any(String));
  expect(meta.openGraph?.description!.length).toBeGreaterThan(0);
  expect(meta.openGraph?.description!.length).toBeLessThanOrEqual(160);
  expect(meta.openGraph?.description).not.toMatch(BANNED);
  expect(meta.description).toBe(meta.openGraph?.description);
  expect(meta.openGraph?.type).toBe('website');
  expect(meta.openGraph?.siteName).toBe(SHARE_SITE_NAME);
  expect(meta.openGraph?.url).toEqual(expect.stringContaining('https://marketscannerpros.app'));
  const url = imageUrl(meta);
  expect(url).toBeTruthy();
  const images = meta.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  expect(first).toMatchObject({ width: SHARE_OG_WIDTH, height: SHARE_OG_HEIGHT });
  expect(typeof first === 'object' && first && 'alt' in first && first.alt).toBeTruthy();
  expect(meta.twitter?.card).toBe('summary_large_image');
  expect(textTitle(meta.twitter?.title)).toBe(ogTitle);
  expect(meta.twitter?.description).toBe(meta.openGraph?.description);
  expect(meta.twitter?.images).toBeTruthy();
  expect(meta.alternates?.canonical).toBe(meta.openGraph?.url);
}

describe('share previews', () => {
  it('Today, Overview, Daily Radar and Pricing export a large-card preview', () => {
    expectShareCard(today, 'Today — MarketScannerPros');
    expect(imageUrl(today)).toBe('/og/today.png');
    expect(today.alternates?.canonical).toBe('https://marketscannerpros.app/tools/start');

    expectShareCard(overview, 'Overview — MarketScannerPros');
    expect(imageUrl(overview)).toBe('/og/overview.png');
    expect(overview.alternates?.canonical).toBe('https://marketscannerpros.app/tools/command-center');

    expectShareCard(radar, 'Daily Radar — MarketScannerPros');
    expect(imageUrl(radar)).toBe('/og/daily-radar.png');
    expect(radar.alternates?.canonical).toBe('https://marketscannerpros.app/tools/msp-radar');

    expectShareCard(pricing, 'Pricing — MarketScannerPros');
    expect(imageUrl(pricing)).toBe('/og/pricing.png');
    expect(pricing.alternates?.canonical).toBe('https://marketscannerpros.app/pricing');
    expect(pricing.description).toContain('$24.99');
    expect(pricing.description).toContain('$249');
  });

  it('Symbol metadata includes the symbol, and the route re-exports it', async () => {
    const page = await import('@/app/tools/golden-egg/page');
    expect(page.generateMetadata).toBe(symbolMetadata);

    const btc = await symbolMetadata({ searchParams: Promise.resolve({ symbol: 'btc' }) });
    expectShareCard(btc, 'BTC — MarketScannerPros');
    expect(btc.description).toContain('BTC');
    expect(textTitle(btc.title)).toBe('BTC');
    expect(imageUrl(btc)).toBe('/og/symbol/BTC');
    expect(btc.alternates?.canonical).toBe('https://marketscannerpros.app/tools/golden-egg?symbol=BTC');

    const dashed = await symbolMetadata({ searchParams: Promise.resolve({ symbol: 'brk.b' }) });
    expect(textTitle(dashed.openGraph?.title)).toBe('BRK.B — MarketScannerPros');
    expect(dashed.description).toContain('BRK.B');

    const junk = await symbolMetadata({ searchParams: Promise.resolve({ symbol: 'buy now' }) });
    expect(textTitle(junk.openGraph?.title)).toBe('Symbol — MarketScannerPros');
    expect(junk.description).not.toMatch(/buy now/i);
    expect(imageUrl(junk)).toBe('/og/symbol.png');
  });

  it('rejects symbols that are not tickers', () => {
    expect(parseShareSymbol('eth')).toBe('ETH');
    expect(parseShareSymbol(['sol'])).toBe('SOL');
    expect(parseShareSymbol('BTC-USD')).toBe('BTC-USD');
    expect(parseShareSymbol('../etc/passwd')).toBeNull();
    expect(parseShareSymbol('not a symbol')).toBeNull();
    expect(parseShareSymbol('')).toBeNull();
  });

  it('static share images are 1200x630', () => {
    for (const file of ['today.png', 'overview.png', 'daily-radar.png', 'pricing.png', 'symbol.png']) {
      const png = decodePng(readFileSync(`public/og/${file}`));
      expect(png.width, file).toBe(1200);
      expect(png.height, file).toBe(630);
    }
  });
});
