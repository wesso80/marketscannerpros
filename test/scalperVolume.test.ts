import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { scalpVolumeCell, scalpVolumeRatio } from '@/lib/scalper/volume';
import { avRowVolume } from '@/lib/scanner/avVolume';

describe('scalper volume ratio', () => {
  it('computes latest volume vs the 20-bar average', () => {
    const vols = [...Array(19).fill(100), 50];
    const r = scalpVolumeRatio(vols);
    expect(r.volRatio).toBeCloseTo(50 / 97.5, 2);
    expect(r.volSpike).toBe(false);
  });

  it('flags a spike above 1.8x', () => {
    const r = scalpVolumeRatio([...Array(19).fill(10), 60]);
    expect(r.volRatio).toBeGreaterThan(1.8);
    expect(r.volSpike).toBe(true);
  });

  it('returns null (not a fake 1.0x) when the bars have no volume', () => {
    expect(scalpVolumeRatio(Array(30).fill(0))).toEqual({ volRatio: null, volSpike: false });
    expect(scalpVolumeRatio([])).toEqual({ volRatio: null, volSpike: false });
  });

  it('keeps fractional crypto volumes', () => {
    const r = scalpVolumeRatio([...Array(19).fill(0.4), 0.8]);
    expect(r.volRatio).toBeCloseTo(0.8 / 0.42, 2);
  });
});

describe('Vol column cell', () => {
  it('shows the ratio when there is no spike, instead of a bare dash', () => {
    expect(scalpVolumeCell(0.84, false).text).toBe('0.8x');
    expect(scalpVolumeCell(0.84, false).title).toMatch(/No spike/);
  });

  it('marks spikes', () => {
    expect(scalpVolumeCell(2.4, true).text).toBe('🔥 2.4x');
    expect(scalpVolumeCell(2.4, true, 'SPIKE').text).toBe('SPIKE 2.4x');
  });

  it("shows 'n/a' with a tooltip when volume is missing", () => {
    const cell = scalpVolumeCell(null, false);
    expect(cell.text).toBe('n/a');
    expect(cell.title).toMatch(/No volume/);
  });
});

describe('scalper route volume parsing', () => {
  const src = readFileSync('app/api/scalper/run/route.ts', 'utf8');
  it('parses bar volume with the shared AV helper (handles numeric CRYPTO_INTRADAY volume)', () => {
    expect(src).toContain('volume: avRowVolume(v)');
    // CRYPTO_INTRADAY shape (AV demo, ETH 5min): volume is a JSON number.
    expect(avRowVolume({ '1. open': '2681.96', '4. close': '2681.95', '5. volume': 844 })).toBe(844);
  });
  it('no longer defaults the ratio to 1 when average volume is zero', () => {
    expect(src).not.toMatch(/avgVol20 > 0 \? latest\.volume \/ avgVol20 : 1/);
  });
});
