import { describe, expect, it } from 'vitest';
import { evaluateDiamondConfirmation } from '@/lib/diamondHunterValidation';

const base = {
  score: 82,
  stage: 'DIAMOND' as const,
  confidence: 'DEEP_CHECKED' as const,
  attention: 'EARLY' as const,
  hardReject: false,
  riskFlags: [] as string[],
  ageMinutes: 8,
  liquidityUsd: 150_000,
  isHoneypot: false as const,
  qualifyingScanCount: 3,
  diamondScanCount: 2,
  liquidityChangePct: 5,
};

describe('Diamond Hunter V2 confirmation ladder', () => {
  it('keeps a first-spike Diamond provisional', () => {
    const result = evaluateDiamondConfirmation({
      ...base,
      qualifyingScanCount: 1,
      diamondScanCount: 1,
    });
    expect(result.validationStage).toBe('PROVISIONAL_DIAMOND');
    expect(result.blockers.some((item) => item.includes('repeated qualifying scans'))).toBe(true);
  });

  it('confirms a persistent, deep-checked, liquid, known-safe Diamond', () => {
    const result = evaluateDiamondConfirmation(base);
    expect(result.validationStage).toBe('CONFIRMED_DIAMOND');
    expect(result.passed).toBe(result.required);
    expect(result.blockers).toEqual([]);
  });

  it('does not confirm when honeypot status is unknown', () => {
    const result = evaluateDiamondConfirmation({
      ...base,
      isHoneypot: 'unknown' as const,
      riskFlags: ['Honeypot status unknown'],
    });
    expect(result.validationStage).toBe('PROVISIONAL_DIAMOND');
    expect(result.blockers.some((item) => item.toLowerCase().includes('honeypot'))).toBe(true);
  });

  it('does not confirm after material liquidity withdrawal', () => {
    const result = evaluateDiamondConfirmation({
      ...base,
      liquidityChangePct: -25,
    });
    expect(result.validationStage).toBe('PROVISIONAL_DIAMOND');
    expect(result.blockers.some((item) => item.includes('fallen more than 20%'))).toBe(true);
  });

  it('preserves watch and emerging states below the Diamond threshold', () => {
    expect(evaluateDiamondConfirmation({ ...base, score: 65, stage: 'WATCH' }).validationStage).toBe('WATCH');
    expect(evaluateDiamondConfirmation({ ...base, score: 75, stage: 'EMERGING' }).validationStage).toBe('EMERGING');
  });
});
