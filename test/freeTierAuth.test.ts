import { expect, it } from 'vitest';
import { safeNext } from '@/lib/free/safeNext';
it('allows only safe local return URLs', () => {
  expect(safeNext('/tools/golden-egg?symbol=AAPL')).toBe('/tools/golden-egg?symbol=AAPL');
  for (const url of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', '/%2fevil.com', '/\nevil.com', '/%5cevil.com']) expect(safeNext(url)).toBeNull();
});
