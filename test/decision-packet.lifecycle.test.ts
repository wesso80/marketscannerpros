import { describe, expect, it } from 'vitest';
import {
  advanceStatus,
  buildDecisionPacketFingerprint,
  statusFromEventType,
} from '../lib/workflow/decisionPacketLifecycle';

describe('decision packet lifecycle', () => {
  it('advances status monotonically', () => {
    expect(advanceStatus('candidate', 'planned')).toBe('planned');
    expect(advanceStatus('planned', 'alerted')).toBe('alerted');
    expect(advanceStatus('alerted', 'executed')).toBe('executed');
    expect(advanceStatus('executed', 'closed')).toBe('closed');

    expect(advanceStatus('closed', 'candidate')).toBe('closed');
    expect(advanceStatus('executed', 'planned')).toBe('executed');
  });

  it('maps event types to expected lifecycle states', () => {
    expect(statusFromEventType('candidate.created')).toBe('candidate');
    expect(statusFromEventType('trade.plan.created')).toBe('planned');
    expect(statusFromEventType('trade.executed')).toBe('executed');
    expect(statusFromEventType('trade.closed')).toBe('closed');
  });

  it('creates deterministic semantic fingerprint for equivalent setup payloads', () => {
    const left = buildDecisionPacketFingerprint({
      symbol: 'nvda',
      signalSource: 'scanner',
      bias: 'bullish',
      timeframeBias: ['1h', '4h'],
      entryZone: 692.10004,
      invalidation: 684.1999,
      riskScore: 63.29,
    });

    const right = buildDecisionPacketFingerprint({
      symbol: 'NVDA',
      signalSource: 'SCANNER',
      bias: 'BULLISH',
      timeframeBias: ['4h', '1h'],
      entryZone: 692.1001,
      invalidation: 684.2,
      riskScore: 63.3,
    });

    expect(left).toBe(right);
  });
});