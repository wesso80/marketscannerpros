import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import nextConfig from '../next.config.mjs';
import { shareCardFonts } from '@/lib/share/font';
import { dataThroughLabel, loadM2CardModel, readOnlyM2Store } from '@/lib/share/m2Card';
import { memoryGlobalM2Store } from '@/lib/intelligence/data/globalM2Store';
import { pickView } from '@/lib/scoring/canonical/dailyPick';
import { decodePng, pixel } from './helpers/decodePng';

afterEach(() => { vi.restoreAllMocks(); });

describe('next.config.js headers: /api/share/* keeps its own Cache-Control', () => {
  it('the blanket no-store rule covers every other /api path but not /api/share/*', async () => {
    const rules = await nextConfig.headers!();
    const noStore = rules.filter((r) => r.headers.some((h) => h.key === 'Cache-Control' && h.value.includes('no-store')) && r.source.startsWith('/api'));
    expect(noStore).toHaveLength(1);
    const match = getPathMatch(noStore[0].source, { removeUnnamedParams: true, strict: true });
    for (const p of ['/api/foo', '/api/og/scan', '/api/scanner/daily-picks', '/api/intelligence/global-m2', '/api/shares/x', '/api/sharex']) {
      expect(match(p), p).toBeTruthy();
    }
    for (const p of ['/api/share/radar/latest.png', '/api/share/radar/2026-09-25.png', '/api/share/setup/META.png', '/api/share/m2/latest.png']) {
      expect(match(p), p).toBeFalsy();
    }
    // No other rule sets Cache-Control on /api/share/*.
    const shareRules = rules.filter((r) => r.headers.some((h) => h.key === 'Cache-Control')
      && getPathMatch(r.source, { removeUnnamedParams: true, strict: true })('/api/share/radar/latest.png'));
    expect(shareRules).toEqual([]);
  });
});

describe('share/OG font: drawn words match satori layout (no stray gap after "WATCH")', () => {
  it('is the bundled Noto Sans without its GPOS (kerning) table', () => {
    const [f] = shareCardFonts();
    const buf = f.data;
    const numTables = buf.readUInt16BE(4);
    const tags = Array.from({ length: numTables }, (_, i) => buf.toString('ascii', 12 + i * 16, 16 + i * 16));
    expect(tags).not.toContain('GPOS');
    for (const t of ['cmap', 'glyf', 'hmtx', 'GSUB']) expect(tags).toContain(t);
    expect(f).toMatchObject({ name: 'Noto Sans', weight: 400, style: 'normal' });
  });

  /** Blank-column gap between the last letter of the first word and the "·" (60px text, white on black). */
  async function gapBeforeDot(text: string, fonts?: ReturnType<typeof shareCardFonts>): Promise<number> {
    const el = <div style={{ display: 'flex', width: 700, height: 100, background: '#000', color: '#fff', fontSize: 60, padding: 10 }}>{text}</div>;
    const img = decodePng(new Uint8Array(await new ImageResponse(el, { width: 700, height: 100, ...(fonts ? { fonts } : {}) }).arrayBuffer()));
    const ink = Array.from({ length: img.width }, (_, x) => {
      for (let y = 0; y < img.height; y++) if (pixel(img, x, y)[0] > 90) return true;
      return false;
    });
    const gaps: number[] = [];
    let run = 0, seenInk = false;
    for (const on of ink) {
      if (on) { if (seenInk && run > 0) gaps.push(run); run = 0; seenInk = true; } else run++;
    }
    return gaps[gaps.length - 2]; // [..., word → dot, dot → "A"]
  }

  it('"WATCH · A" has the same word-to-dot gap as an unkerned word ("HHHHH · A"), and no font is fetched', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const fonts = shareCardFonts();
    const watch = await gapBeforeDot('WATCH · A', fonts);
    const plain = await gapBeforeDot('HHHHH · A', fonts);
    expect(Math.abs(watch - plain)).toBeLessThanOrEqual(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    // With next/og's default (kerned) font the same text shows the extra gap this font removes.
    expect(await gapBeforeDot('WATCH · A')).toBeGreaterThan(plain + 4);
  }, 30_000);
});

describe('Global M2 card', () => {
  const months = (lag: number) => Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2025, 5 + i - lag, 1)).toISOString().slice(0, 7));
  const series = (base: number, lag = 0) => ({ observations: months(lag).map((month, i) => ({ month, usdM2: base * (1 + 0.004 * i) })), latestFetchedAt: '2026-09-02T06:00:00.000Z' });

  it('"Data through" names the oldest month too when blocs end in different months', () => {
    expect(dataThroughLabel(['2026-07', '2026-07'])).toBe('Jul 2026');
    expect(dataThroughLabel(['2026-07', '2026-06', '2026-07', '2026-06'])).toBe('Jul 2026 (some blocs Jun 2026)');
    expect(dataThroughLabel([])).toBe('—');
  });

  it('renders from saved data only and never writes (public GET is read-only)', async () => {
    const store = memoryGlobalM2Store({ US: series(21e12), CN: series(43e12), EU: series(16e12), GB: series(4e12, 1), CA: series(2e12, 1) });
    const write = vi.spyOn(store, 'write');
    const read = vi.spyOn(store, 'read');
    const m = await loadM2CardModel({ store });
    expect(m).toMatchObject({ blocCount: '5 of 11 blocs', dataThrough: 'Jul 2026 (some blocs Jun 2026)' });
    expect(read).toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('readOnlyM2Store passes reads through and drops writes', async () => {
    const inner = memoryGlobalM2Store({ US: series(21e12) });
    const write = vi.spyOn(inner, 'write');
    const ro = readOnlyM2Store(inner);
    expect(await ro.write('US', [{ month: '2026-08', usdM2: 1 }], { provider: 'x', classification: 'EXACT' })).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect((await ro.read('US'))?.observations).toHaveLength(15);
  });
});

describe('pickView.scoreText: the share card\'s score wording for the OG card', () => {
  const canonical = { permission: 'WATCH', grade: 'A', setupType: 'EXHAUSTION_FADE', direction: 'short', score: 95, watchReasons: [],
    levels: { entry: 1, invalidation: 2, target: 0.5, riskReward: 2, invalidationBasis: 'swing', targetBasis: 'ema20', flags: [] } };
  it('percentile when calibrated, factors label when not, null for legacy rows', () => {
    const cal = { ...canonical, scoreBasis: 'calibrated_expectancy_percentile', calibration: { pTargetFirst: 0.5, expectedR: 0.2, costsBps: 10, horizonBars: 10, sample: 900, validatedEdge: false } };
    expect(pickView({ score: 95, direction: 'bearish', canonical: cal }).scoreText).toBe('95th pct');
    expect(pickView({ score: 74, direction: 'bullish', canonical: { ...canonical, score: 74, scoreBasis: 'factor_alignment_uncalibrated', calibration: null } }).scoreText)
      .toBe('74/100 factors (uncalibrated)');
    expect(pickView({ score: 60, direction: 'bullish', canonical: null }).scoreText).toBeNull();
  });
});
