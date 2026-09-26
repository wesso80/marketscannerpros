/**
 * Rendered-pixel checks for the share cards. Satori defaults flex items to flexShrink 0, so a tall middle area used
 * to push the footer (disclaimer + site name) off the bottom of the 1200×675 image (live radar cards for 24/25 Sep
 * 2026). These tests render real PNGs and find the footer's full-width top border and the disclaimer text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageResponse } from 'next/og';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));

import { GET as radarGET } from '@/app/api/share/radar/[file]/route';
import { GET as setupGET } from '@/app/api/share/setup/[file]/route';
import { clearShareCache } from '@/lib/share/respond';
import { RadarCard, radarModelFromRow } from '@/lib/share/radarCard';
import { shareCardFonts } from '@/lib/share/font';
import { SHARE_THEME } from '@/lib/share/theme';
import { decodePng, pixel, type DecodedPng } from './helpers/decodePng';

const W = 1200, H = 675, PAD_X = 56, PAD_BOTTOM = 30;
const ctx = (file: string) => ({ params: Promise.resolve({ file }) });
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BORDER = hex(SHARE_THEME.border);

/** Lowest row where the whole content width is the border colour: the footer's top border (null if off-canvas). */
function footerBorderRow(img: DecodedPng): number | null {
  let found: number | null = null;
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = PAD_X; x < W - PAD_X; x++) {
      const p = pixel(img, x, y);
      if (p.every((v, i) => Math.abs(v - BORDER[i]) <= 10)) n++;
    }
    if (n >= W - 2 * PAD_X - 8) found = y;
  }
  return found;
}
/** Pixels clearly brighter than the dark background (text). */
function textPixels(img: DecodedPng, y0: number, y1: number): number {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    for (let x = PAD_X; x < W - PAD_X; x++) if (Math.max(...pixel(img, x, y)) > 70) n++;
  }
  return n;
}
function expectFooterInside(img: DecodedPng) {
  expect([img.width, img.height]).toEqual([W, H]);
  const border = footerBorderRow(img);
  expect(border, 'footer top border must be on the canvas').not.toBeNull();
  // Footer = border + 12px padding + (optional note) + one 15px disclaimer line, then the 30px bottom padding.
  expect(border!).toBeLessThanOrEqual(H - PAD_BOTTOM - 30);
  expect(textPixels(img, border! + 4, H - PAD_BOTTOM + 4), 'disclaimer text below the border').toBeGreaterThan(300);
  expect(textPixels(img, H - 14, H), 'nothing drawn in the bottom padding').toBe(0);
}
const png = async (res: Response) => decodePng(new Uint8Array(await res.arrayBuffer()));

const LONG_VALUE = 'SPY -12.34% · 1999/1999 up · 999 new 20d highs vs 999 lows · 9999 names ≥2× volume · extra words to reach the clip';
const radarRow = (over: Record<string, unknown> = {}) => ({
  session_date: '2026-09-24', status: 'COMPLETE', generated_at: '2026-09-24T21:36:00Z',
  headline: '756/1876 equities up, 10 research candidates, 14 genuine group moves (Lending/Borrowing Protocols, Liquid Staking), 9 setups near trigger',
  market: [
    { label: 'Equities', value: 'SPY -0.07% · 756/1876 up · 62 new 20d highs vs 178 lows · 126 names ≥2× volume' },
    { label: 'Crypto', value: 'BTC -0.0% / ETH +0.5% · alt median +3.3% · 79% up 24h, 88% up 7d · alts leading' },
    { label: 'Sectors', value: '5d RS leaders XLK, XLC, XLV · newly strengthening XLI' },
    { label: 'Volatility', value: 'VXX +0.57% · 534 meaningful movers, 317 unusual' },
  ],
  candidates: [
    { symbol: 'ICP', assetClass: 'crypto', setupType: 'BREAKOUT_CONFIRMATION' }, { symbol: 'VCYT', assetClass: 'equity', setupType: 'BREAKOUT_CONFIRMATION' },
    { symbol: 'MORPHO', assetClass: 'crypto', setupType: 'BREAKOUT_CONFIRMATION' }, { symbol: 'LDO', assetClass: 'crypto', setupType: 'VOLATILITY_EXPANSION' },
    { symbol: 'XPL', assetClass: 'crypto', setupType: 'BREAKOUT_CONFIRMATION' },
  ],
  ...over,
});
const worstRow = () => radarRow({
  session_date: '2026-09-23', status: 'DEGRADED',
  headline: '1999/1999 equities up, 99 research candidates, 99 genuine group moves (Lending/Borrowing Protocols, Liquid Staking, Binance Launchpool, AI Agents), 99 setups near trigger and more',
  market: ['Equities', 'Crypto', 'Sectors', 'Volatility', 'Dollar'].map((label) => ({ label, value: LONG_VALUE })),
  candidates: ['MORPHOLOGIC', 'WWWWWWWWWW', 'PENGUINS', 'ABCDEFGHIJ', 'BRK.B', 'ONDO', 'AERO', 'ZZZZZZZZZZ', 'LAST'].map((symbol, i) => ({
    symbol, assetClass: i % 2 ? 'equity' : 'crypto', setupType: 'MEAN_REVERSION_EXHAUSTION_FADE_LONG',
  })),
});

beforeEach(() => { clearShareCache(); mocks.q.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('share card footer always stays inside 1200×675', () => {
  it('radar card with 24 Sep 2026-shaped data (3-line headline, MORPHO-USD in the list)', async () => {
    mocks.q.mockResolvedValue([radarRow()]);
    const res = await radarGET(new Request('http://x'), ctx('2026-09-24.png'));
    expect(res.status).toBe(200);
    expectFooterInside(await png(res));
  }, 30_000);

  it('radar card, worst case: 150-char headline, long market lines, 9 long symbols, DEGRADED note', async () => {
    mocks.q.mockResolvedValue([worstRow()]);
    const res = await radarGET(new Request('http://x'), ctx('2026-09-23.png'));
    expectFooterInside(await png(res));
  }, 30_000);

  it('radar card with 9 list items passed straight to the component (past the model\'s top-5 cap)', async () => {
    const m = radarModelFromRow(worstRow() as never)!;
    const m9 = { ...m, candidates: Array.from({ length: 9 }, (_, i) => ({ symbol: `SYMBOL${i}-USD`, setup: 'volatility expansion breakout' })) };
    const img = new ImageResponse(<RadarCard m={m9} />, { width: W, height: H, fonts: shareCardFonts() });
    expectFooterInside(decodePng(new Uint8Array(await img.arrayBuffer())));
  }, 30_000);

  it('setup card', async () => {
    mocks.q.mockResolvedValue([{
      symbol: 'META', asset_class: 'equity', scan_date: '2026-09-25', price: '751.66', direction: 'bearish', score: 95,
      canonical: { permission: 'WATCH', grade: 'A', setupType: 'EXHAUSTION_FADE', direction: 'short', score: 95, scoreBasis: 'factor_alignment_uncalibrated', calibration: null,
        watchReasons: [], levels: { entry: 751.66, invalidation: 782.54, target: 677.66, riskReward: 2.4, invalidationBasis: 'swing', targetBasis: 'ema20', flags: [] } },
    }]);
    const res = await setupGET(new Request('http://x/api/share/setup/META.png?date=2026-09-25'), ctx('META.png'));
    expect(res.status).toBe(200);
    expectFooterInside(await png(res));
  }, 30_000);
});

describe('radar card model', () => {
  it('keeps the site\'s -USD crypto labels and at most 5 list items', () => {
    const m = radarModelFromRow(worstRow() as never)!;
    expect(m.candidates).toHaveLength(5);
    expect(radarModelFromRow(radarRow() as never)!.candidates.map((c) => c.symbol)).toEqual(['ICP-USD', 'VCYT', 'MORPHO-USD', 'LDO-USD', 'XPL-USD']);
  });
});
