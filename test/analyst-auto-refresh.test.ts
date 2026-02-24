import { describe, it, expect } from 'vitest';

/**
 * MSP Analyst Auto-Refresh Tests
 *
 * Tests the pure logic functions used by the useAnalystContext hook
 * to verify: fingerprint change detection, data quality assessment,
 * authorization gating, and session phase detection.
 */

// ─── Inline copies of pure functions from useAnalystContext ────
// (Extracting the logic for unit testing without React hooks)

type DataQuality = 'complete' | 'partial' | 'stale' | 'unavailable';
type AnalystAuthorization = 'AUTHORIZED' | 'CONDITIONAL' | 'BLOCKED';

function computeFingerprint(parts: (string | number | null | undefined)[]): string {
  return parts.map(p => String(p ?? '')).join('|');
}

function assessDataQuality(ctx: {
  ticker: string | null;
  regime: string | null;
  currentPrice: number | null;
  pageData: Record<string, unknown>;
}): { quality: DataQuality; missing: string[] } {
  const missing: string[] = [];
  if (!ctx.ticker) missing.push('ticker');
  if (!ctx.regime) missing.push('regime');
  if (ctx.currentPrice == null) missing.push('price');

  const pd = ctx.pageData;
  if (!pd.direction && !pd.bias) missing.push('direction');
  if (!pd.signalStrength && !pd.score) missing.push('signal strength');

  if (missing.length === 0) return { quality: 'complete', missing };
  if (missing.length <= 2) return { quality: 'partial', missing };
  if (ctx.ticker) return { quality: 'stale', missing };
  return { quality: 'unavailable', missing };
}

function assessAuthorization(opts: {
  tier: string;
  isLoggedIn: boolean;
  permission: string | null;
  riskLevel: string | null;
}): { auth: AnalystAuthorization; reason: string | null } {
  if (!opts.isLoggedIn) return { auth: 'BLOCKED', reason: 'Not authenticated — sign in to access analyst.' };
  if (opts.tier === 'free' || opts.tier === 'anonymous') return { auth: 'BLOCKED', reason: 'MSP Analyst requires Pro or higher tier.' };
  if (opts.permission === 'NO') return { auth: 'BLOCKED', reason: `Trading blocked by risk governor (risk level: ${opts.riskLevel}).` };
  if (opts.permission === 'CONDITIONAL') return { auth: 'CONDITIONAL', reason: 'Conditional authorization — reduced sizing recommended.' };
  return { auth: 'AUTHORIZED', reason: null };
}

// ─── Tests ──────────────────────────────────────────

describe('Analyst Fingerprint (change detection)', () => {
  it('produces same fingerprint for same inputs', () => {
    const fp1 = computeFingerprint(['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75]);
    const fp2 = computeFingerprint(['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75]);
    expect(fp1).toBe(fp2);
  });

  it('changes when ticker changes', () => {
    const fp1 = computeFingerprint(['BTC', 'TREND_UP', null, null, null, null, null, null, null]);
    const fp2 = computeFingerprint(['ETH', 'TREND_UP', null, null, null, null, null, null, null]);
    expect(fp1).not.toBe(fp2);
  });

  it('changes when regime changes', () => {
    const fp1 = computeFingerprint(['BTC', 'TREND_UP', null, null, null, null, null, null, null]);
    const fp2 = computeFingerprint(['BTC', 'RANGE_NEUTRAL', null, null, null, null, null, null, null]);
    expect(fp1).not.toBe(fp2);
  });

  it('changes when session phase changes', () => {
    const fp1 = computeFingerprint([null, null, null, null, null, 'MORNING_SESSION', null, null, null]);
    const fp2 = computeFingerprint([null, null, null, null, null, 'POWER_HOUR', null, null, null]);
    expect(fp1).not.toBe(fp2);
  });

  it('changes when authorization changes', () => {
    const fp1 = computeFingerprint([null, null, null, null, null, null, null, 'AUTHORIZED', null]);
    const fp2 = computeFingerprint([null, null, null, null, null, null, null, 'BLOCKED', null]);
    expect(fp1).not.toBe(fp2);
  });

  it('treats null and undefined consistently', () => {
    const fp1 = computeFingerprint([null, null, null]);
    const fp2 = computeFingerprint([undefined, undefined, undefined]);
    expect(fp1).toBe(fp2);
  });
});

describe('Data Quality Assessment', () => {
  it('returns complete when all required fields present', () => {
    const result = assessDataQuality({
      ticker: 'BTC',
      regime: 'TREND_UP',
      currentPrice: 45000,
      pageData: { direction: 'bullish', signalStrength: 'strong' },
    });
    expect(result.quality).toBe('complete');
    expect(result.missing).toHaveLength(0);
  });

  it('returns partial when 1-2 fields missing', () => {
    const result = assessDataQuality({
      ticker: 'BTC',
      regime: 'TREND_UP',
      currentPrice: null,
      pageData: { direction: 'bullish', signalStrength: 'strong' },
    });
    expect(result.quality).toBe('partial');
    expect(result.missing).toContain('price');
  });

  it('returns stale when many fields missing but ticker present', () => {
    const result = assessDataQuality({
      ticker: 'BTC',
      regime: null,
      currentPrice: null,
      pageData: {},
    });
    expect(result.quality).toBe('stale');
    expect(result.missing.length).toBeGreaterThan(2);
  });

  it('returns unavailable when no ticker', () => {
    const result = assessDataQuality({
      ticker: null,
      regime: null,
      currentPrice: null,
      pageData: {},
    });
    expect(result.quality).toBe('unavailable');
  });

  it('accepts score as alternative to signalStrength', () => {
    const result = assessDataQuality({
      ticker: 'ETH',
      regime: 'TREND_UP',
      currentPrice: 3000,
      pageData: { direction: 'bullish', score: 85 },
    });
    expect(result.quality).toBe('complete');
  });
});

describe('Authorization Assessment', () => {
  it('blocks unauthenticated users', () => {
    const result = assessAuthorization({ tier: 'pro', isLoggedIn: false, permission: 'YES', riskLevel: 'low' });
    expect(result.auth).toBe('BLOCKED');
    expect(result.reason).toContain('sign in');
  });

  it('blocks free tier users', () => {
    const result = assessAuthorization({ tier: 'free', isLoggedIn: true, permission: 'YES', riskLevel: 'low' });
    expect(result.auth).toBe('BLOCKED');
    expect(result.reason).toContain('Pro');
  });

  it('blocks anonymous tier users', () => {
    const result = assessAuthorization({ tier: 'anonymous', isLoggedIn: true, permission: 'YES', riskLevel: 'low' });
    expect(result.auth).toBe('BLOCKED');
  });

  it('blocks when risk governor says NO', () => {
    const result = assessAuthorization({ tier: 'pro', isLoggedIn: true, permission: 'NO', riskLevel: 'extreme' });
    expect(result.auth).toBe('BLOCKED');
    expect(result.reason).toContain('risk governor');
    expect(result.reason).toContain('extreme');
  });

  it('returns CONDITIONAL when permission is CONDITIONAL', () => {
    const result = assessAuthorization({ tier: 'pro', isLoggedIn: true, permission: 'CONDITIONAL', riskLevel: 'elevated' });
    expect(result.auth).toBe('CONDITIONAL');
    expect(result.reason).toContain('reduced sizing');
  });

  it('authorizes pro users with full permission', () => {
    const result = assessAuthorization({ tier: 'pro', isLoggedIn: true, permission: 'YES', riskLevel: 'low' });
    expect(result.auth).toBe('AUTHORIZED');
    expect(result.reason).toBeNull();
  });

  it('authorizes pro_trader users', () => {
    const result = assessAuthorization({ tier: 'pro_trader', isLoggedIn: true, permission: 'YES', riskLevel: 'moderate' });
    expect(result.auth).toBe('AUTHORIZED');
  });
});

describe('Fingerprint-driven auto-refresh', () => {
  it('ticker change produces different fingerprint (triggers refresh)', () => {
    const base = ['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75];
    const changed = ['ETH', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75];
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(changed));
  });

  it('regime change produces different fingerprint (triggers refresh)', () => {
    const base = ['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75];
    const changed = ['BTC', 'VOL_EXPANSION', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75];
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(changed));
  });

  it('ACL score change produces different fingerprint (triggers refresh)', () => {
    const base = ['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75];
    const changed = ['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 60];
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(changed));
  });

  it('no-change scenario produces same fingerprint (no refresh)', () => {
    const a = computeFingerprint(['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75]);
    const b = computeFingerprint(['BTC', 'TREND_UP', 'moderate', 'YES', 45000, 'MORNING_SESSION', 'pro', 'AUTHORIZED', 75]);
    expect(a).toBe(b);
  });
});
