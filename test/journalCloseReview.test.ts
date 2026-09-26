import { describe, expect, it } from 'vitest';
import { buildCloseReviewNotes, closeOutcomeFromPrices, followedPlanValue } from '@/lib/journal/closeReview';
import { tagOutcome } from '@/lib/learning-engine';

describe('Close modal review answers (TR-32)', () => {
  it('outcome comes from realised P&L, not a preset', () => {
    expect(closeOutcomeFromPrices('long', 100, 110)).toBe('win');
    expect(closeOutcomeFromPrices('long', 100, 90)).toBe('loss');
    expect(closeOutcomeFromPrices('short', 100, 90)).toBe('win');
    expect(closeOutcomeFromPrices('short', 100, 110)).toBe('loss');
    expect(closeOutcomeFromPrices('long', 100, 100)).toBe('breakeven');
    expect(closeOutcomeFromPrices('long', 100, 0)).toBeNull();
    expect(closeOutcomeFromPrices('long', 100, Number.NaN)).toBeNull();
  });

  it('followed plan is null unless answered', () => {
    expect(followedPlanValue('')).toBeNull();
    expect(followedPlanValue('yes')).toBe(true);
    expect(followedPlanValue('no')).toBe(false);
  });

  it('saves nothing for unanswered review fields', () => {
    expect(buildCloseReviewNotes({ setupQuality: '', errorType: '', reviewText: '' })).toBe('');
    expect(buildCloseReviewNotes({ setupQuality: '', errorType: '', reviewText: '  took profit early  ' })).toBe('took profit early');
  });

  it('labels answered fields', () => {
    expect(buildCloseReviewNotes({ setupQuality: 'A', errorType: 'entry_late', reviewText: 'ok' })).toBe('Setup quality: A | Error type: entry_late | ok');
    expect(buildCloseReviewNotes({ errorType: 'no_stop' })).toBe('Error type: no_stop');
  });
});

describe('rule adherence ignores unanswered followed-plan', () => {
  const base = { symbol: 'TEST', regime: 'X', flowState: 'N', playbook: 'p', taken: true, mfeR: 1, maeR: -0.3 };
  it('unknown adherence: quality from result only, not an assumed 60', () => {
    expect(tagOutcome({ ...base, resultR: 0, ruleAdherence: null }).quality).toBe(50);
    expect(tagOutcome({ ...base, resultR: 1, ruleAdherence: null }).quality).toBe(75);
    expect(tagOutcome({ ...base, resultR: -2, ruleAdherence: null }).quality).toBe(0);
    // and it no longer equals the old neutral-60 score
    expect(tagOutcome({ ...base, resultR: 1, ruleAdherence: null }).quality).not.toBe(tagOutcome({ ...base, resultR: 1, ruleAdherence: 60 }).quality);
  });
  it('answered adherence is scored exactly as before', () => {
    expect(tagOutcome({ ...base, resultR: 0.5, ruleAdherence: 80 }).quality).toBe(98.5); // 56 + 7.5 + 35
    expect(tagOutcome({ ...base, resultR: -1, ruleAdherence: 40 }).quality).toBe(48);
  });
});
