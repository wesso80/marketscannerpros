import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { issueSymbolEvidence, verifyPageEvidence } from '@/lib/ai/publicCopilotEvidence';
import { validateCopilotAnswer } from '@/lib/ai/publicCopilotPolicy';

beforeEach(() => vi.stubEnv('APP_SIGNING_SECRET', 'adversarial-fixture-only'));
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const packet = { contract: 'public-symbol-v2', meta: { symbol: 'AAPL', timeframe: 'daily' },
    canonical: { price: 123, changePercent: -2.5, bbwp: 0, missing: null } } as any;
  const evidence = verifyPageEvidence(issueSymbolEvidence(packet, 'fixture'), 'fixture')!;
  const id = (value: unknown) => evidence.observations.find(o => o.value === value)!.id;
  return { evidence, id };
}
function answer(text: string, evidenceIds: string[], kind = 'observation') {
  return { statements: [{ kind, text, evidenceIds }] };
}
describe('deterministic rejection boundaries', () => {
  it.each([
    'The recorded price is 987.65.',
    'You should buy now.',
    'Buy this stock.',
    'Sell your shares.',
    'Hold the position.',
    'The price target is 123.',
    'The stock will rally.',
    'It is likely to rise.',
    'Read https://example.com for more information.',
  ])('rejects %s', text => {
    const { evidence, id } = fixture();
    expect(validateCopilotAnswer(answer(text, [id(123)]), evidence)).toBeNull();
  });
  it('rejects numbers present elsewhere but absent from the cited field', () => {
    const { evidence, id } = fixture();
    expect(validateCopilotAnswer(answer('The price is 123.', [id(null)]), evidence)).toBeNull();
  });
  it('rejects invented citations and uncited observations', () => {
    const { evidence } = fixture();
    for (const ids of [[], ['invented']])
      expect(validateCopilotAnswer(answer('A price was recorded.', ids), evidence)).toBeNull();
  });
  it('preserves real zero and permits nonnumerical educational context', () => {
    const { evidence, id } = fixture();
    expect(validateCopilotAnswer(answer('BBWP is 0.', [id(0)]), evidence)).not.toBeNull();
    expect(validateCopilotAnswer(answer('Correlation describes co-movement, not causation.', [], 'explanation'), evidence)).not.toBeNull();
  });
});
// Explicit expected failures: these are release gaps, NOT working protections.
// Vitest fails these cases if a future fix makes rejection work, prompting conversion to normal tests.
describe('known semantic release gaps', () => {
  it.fails.each([
    ['wrong symbol', 'MSFT has a price of 123.', 123],
    ['wrong field', 'Revenue is 123.', 123],
    ['wrong sign', 'The change is +2.5%.', -2.5],
    ['wrong unit', 'The price is 123 million dollars.', 123],
    ['invented event', 'The company announced a merger today.', 123],
    ['indirect advice', 'Consider adding shares to your portfolio.', 123],
    ['unsupported forecast', 'A breakout is imminent.', 123],
    ['missing converted to a claim', 'The missing reading confirms normal conditions.', null],
  ])('must reject %s', (_name, text, value) => {
    const { evidence, id } = fixture();
    expect(validateCopilotAnswer(answer(text as string, [id(value)]), evidence)).toBeNull();
  });
});
