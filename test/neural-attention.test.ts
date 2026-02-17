import { describe, expect, it } from 'vitest';
import { buildNeuralAttention } from '../lib/operator/neuralAttention';

function basePresence() {
  return {
    experienceMode: { mode: 'focus' as const },
    controlMatrix: { output: { mode: 'focus' as const } },
    riskLoad: { level: 'MEDIUM' as const, score: 50 },
    adaptiveInputs: {
      marketReality: { volatilityState: 'normal', signalDensity: 70, confluenceDensity: 65, mode: 'balanced' },
      operatorBrain: { state: 'FOCUSED' as const, fatigueScore: 20, riskCapacity: 'MEDIUM' as const },
      learningFeedback: {
        validatedPct: 60,
        ignoredPct: 20,
        wrongContextPct: 10,
        timingIssuePct: 10,
        penalty: 1,
        bonus: 3,
        total7d: 20,
      },
      cognitiveLoad: {
        level: 'MEDIUM' as const,
        value: 52,
        openAlerts: 2,
        unresolvedPlans: 1,
        simultaneousSetups: 2,
      },
    },
  };
}

describe('neural attention', () => {
  it('keeps prior focus when challenger does not beat hysteresis threshold', () => {
    const result = buildNeuralAttention({
      ...basePresence(),
      attentionMemory: {
        currentPrimary: 'NVDA',
        lockedUntilTs: new Date(Date.now() + 5 * 60_000).toISOString(),
        pinnedSymbol: null,
        pinnedUntilTs: null,
        cooldownUntil: {},
        ignoredCounts7d: {},
        snoozeUntilTs: null,
      },
      candidates: [
        { symbol: 'NVDA', signalScore: 78, operatorFit: 81, hasPlan: true, hasAlert: false, status: 'planned' },
        { symbol: 'AMD', signalScore: 80, operatorFit: 80, hasPlan: true, hasAlert: true, status: 'alerted' },
      ],
    });

    expect(result.neuralAttention.focus.primary).toBe('NVDA');
    expect(result.focusShift.changed).toBe(false);
  });

  it('respects pinned focus until expiry', () => {
    const result = buildNeuralAttention({
      ...basePresence(),
      experienceMode: { mode: 'hunt' },
      controlMatrix: { output: { mode: 'hunt' } },
      attentionMemory: {
        currentPrimary: 'NVDA',
        pinnedSymbol: 'AAPL',
        pinnedUntilTs: new Date(Date.now() + 20 * 60_000).toISOString(),
        lockedUntilTs: null,
        cooldownUntil: {},
        ignoredCounts7d: {},
        snoozeUntilTs: null,
      },
      candidates: [
        { symbol: 'AAPL', signalScore: 65, operatorFit: 62, hasPlan: false, hasAlert: false, status: 'candidate' },
        { symbol: 'NVDA', signalScore: 90, operatorFit: 88, hasPlan: true, hasAlert: true, status: 'executed' },
      ],
    });

    expect(result.neuralAttention.focus.primary).toBe('AAPL');
    expect(result.neuralAttention.focus.reason.toLowerCase()).toContain('pinned');
  });
});
