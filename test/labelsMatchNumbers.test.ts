import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { m2BlocCoverage, m2BlocName, notCollectedText } from '@/lib/intelligence/m2Coverage';
import { collectionStatus, thresholdChip, THRESHOLD_RULE_NOTE } from '@/lib/signals/thresholdLabels';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('labels match their own numbers (display only)', () => {
  it('Liquidity: the not-collected count equals the listed names', () => {
    expect(notCollectedText('M2 blocs', ['IN', 'KR'].map((b) => m2BlocName(b)))).toBe('2 M2 blocs not collected: India, South Korea');
    expect(notCollectedText('M2 blocs', [])).toBe('All M2 blocs collected');
    const page = read('app/intelligence/liquidity/page.tsx');
    expect(page).not.toContain('{data.quality.missingInputCount} inputs not collected');
  });

  it('Global M2 and Liquidity use one coverage figure, computed the same way', () => {
    expect(m2BlocCoverage(9, 11)).toMatchObject({ valid: 9, total: 11, missing: 2, percent: 81.8, label: '9 / 11 blocs (81.8%)' });
    expect(m2BlocCoverage(0, 0).percent).toBe(0);
    expect(read('app/intelligence/global-m2/page.tsx')).toContain("label: 'Bloc coverage', value: m2BlocCoverage(");
    expect(read('app/intelligence/liquidity/page.tsx')).toContain('label="Bloc coverage"');
    // The weighted figure stays, labelled as covering included blocs only.
    expect(read('app/intelligence/global-m2/page.tsx')).toContain('Weighted coverage of included blocs');
  });

  it('Signal accuracy: thresholds show a sign, so a 0.50% move cannot read as both OK and NO', () => {
    const chip = thresholdChip({ horizon_label: '1h', correct_threshold: 0.5, wrong_threshold: 0.5 });
    expect(chip).toBe('1h: OK at +0.5% or more · NO at −0.5% or worse');
    expect(THRESHOLD_RULE_NOTE).toMatch(/exactly at the threshold counts as OK/);
    const page = read('app/tools/signal-accuracy/page.tsx');
    expect(page).not.toContain('NO &le;{t.wrong_threshold}%');
    expect(page.match(/THRESHOLD_RULE_NOTE/g)?.length).toBe(2); // import + one render
  });

  it('Signal accuracy: observations without labels say results are still being collected, with no empty stats', () => {
    expect(collectionStatus(9274, 0)).toBe('Results are still being collected: 9,274 observations recorded, none labelled yet.');
    expect(collectionStatus(9274, 10)).toBeNull();
    expect(read('app/tools/signal-accuracy/page.tsx')).toContain('{overall && overall.labeled > 0 && (');
  });

  it('Admin Transcripts: the operator pause is a grey notice with the same wording, not a red error', () => {
    const page = read('app/admin/transcripts/page.tsx');
    expect(page).toContain('error === ADMIN_EQUITIES_PAUSED_MESSAGE');
    expect(page).toContain('data-paused-notice');
  });

  it('Liquidity stage table labels the clock position, not active/inactive', () => {
    const page = read('app/intelligence/liquidity/page.tsx');
    expect(page).toContain("label: 'Clock position'");
    expect(page).not.toContain("'Inactive'");
  });
});
