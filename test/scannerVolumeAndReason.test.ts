import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avRowVolume } from '@/lib/scanner/avVolume';
import { completedSessionAvgVolume } from '@/lib/scanner/equityScanInputs';
import { legacyExecutionReason } from '@/lib/scanner/legacyReason';

// Shape of a real TIME_SERIES_DAILY_ADJUSTED row (AV demo payload, IBM 2026-09-24): volume is field 6.
const adjustedRow = (vol: string) => ({
  '1. open': '232.0', '2. high': '232.6168', '3. low': '226.01', '4. close': '227.06',
  '5. adjusted close': '227.06', '6. volume': vol, '7. dividend amount': '0.0000', '8. split coefficient': '1.0',
});

describe('avRowVolume', () => {
  it('reads 6. volume from TIME_SERIES_DAILY_ADJUSTED rows', () => {
    expect(avRowVolume(adjustedRow('4149575'))).toBe(4149575);
  });
  it('reads 5. volume from TIME_SERIES_DAILY / INTRADAY rows', () => {
    expect(avRowVolume({ '1. open': '1', '4. close': '1', '5. volume': '1000' })).toBe(1000);
  });
  it('never returns the adjusted close as volume, and missing/garbage volume is 0', () => {
    expect(avRowVolume({ '5. adjusted close': '227.06' })).toBe(0);
    expect(avRowVolume({ '6. volume': 'n/a' })).toBe(0);
    expect(avRowVolume(null)).toBe(0);
  });
  it('gives the scanner a 20-day average volume from worker-parsed daily bars (was always null)', () => {
    const nowMs = Date.parse('2026-09-25T15:47:00Z'); // US session open, 25 Sep bar unfinished
    const bars = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(Date.parse('2026-08-20T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
      return { ts: d, volume: avRowVolume(adjustedRow('2000000')) || null };
    });
    expect(completedSessionAvgVolume(bars, nowMs, 20)).toBe(2_000_000);
    // What the old parser (v['5. volume'] || '0') stored: every bar 0 → stored as null → no average.
    const oldBars = bars.map((b) => ({ ...b, volume: parseInt((adjustedRow('2000000') as any)['5. volume'] || '0', 10) || null }));
    expect(completedSessionAvgVolume(oldBars, nowMs, 20)).toBeNull();
  });
  it('the worker and on-demand daily parsers use it', () => {
    for (const file of ['worker/ingest-data.ts', 'lib/onDemandFetch.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('avRowVolume(v)');
      expect(src).not.toMatch(/v\['5\. volume'\] \|\| '0'/);
    }
  });
});

describe('legacyExecutionReason', () => {
  it('a neutral MSP composite reads as split factors, not a risk-mode cap', () => {
    // buildInstitutionalPickScoreV2 raises both codes when the composite has no net direction.
    expect(legacyExecutionReason(['direction_neutral', 'tf_alignment_low', 'risk_mode_block'])).toBe('MSP factors split (no net direction)');
  });
  it('a real risk-off tape keeps a risk label', () => {
    expect(legacyExecutionReason(['risk_mode_block'])).toMatch(/Risk-off/);
  });
  it('alignment and no reason', () => {
    expect(legacyExecutionReason(['tf_alignment_low', 'no_trigger'])).toBe('Alignment below threshold');
    expect(legacyExecutionReason(['no_trigger'])).toBeNull();
    expect(legacyExecutionReason(undefined)).toBeNull();
  });
  it('is the same for bullish and bearish rows (reasons carry no side)', () => {
    expect(legacyExecutionReason(['risk_mode_block', 'direction_neutral'])).toBe(legacyExecutionReason(['direction_neutral', 'risk_mode_block']));
  });
});
