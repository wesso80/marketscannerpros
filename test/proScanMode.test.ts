import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isRetiredFastCryptoRequest, resolveBulkScanMode } from '@/lib/scanner/proScanMode';

describe('Pro Scanner scan mode', () => {
  it('always runs crypto as Deep, whatever an old client asks for', () => {
    for (const requested of ['light', 'hybrid', 'fast', 'deep', 'LIGHT', '', undefined, null, 42]) {
      expect(resolveBulkScanMode('crypto', requested)).toBe('deep');
    }
  });

  it('leaves equity and forex mode handling unchanged', () => {
    expect(resolveBulkScanMode('equity', 'hybrid')).toBe('hybrid');
    expect(resolveBulkScanMode('equity', 'light')).toBe('light');
    expect(resolveBulkScanMode('equity', undefined)).toBe('deep');
    expect(resolveBulkScanMode('forex', 'hybrid')).toBe('hybrid');
  });

  it('flags only crypto Fast requests as retired', () => {
    expect(isRetiredFastCryptoRequest('crypto', 'light')).toBe(true);
    expect(isRetiredFastCryptoRequest('crypto', 'Fast')).toBe(true);
    expect(isRetiredFastCryptoRequest('crypto', 'deep')).toBe(false);
    expect(isRetiredFastCryptoRequest('crypto', undefined)).toBe(false);
    expect(isRetiredFastCryptoRequest('equity', 'light')).toBe(false);
  });

  it('Pro Scanner UI no longer offers a Fast toggle and requests Deep for crypto', () => {
    const page = readFileSync(join(process.cwd(), 'app/tools/scanner/page.tsx'), 'utf8');
    expect(page).not.toContain("(['light', 'deep'] as const)");
    expect(page).not.toMatch(/'Fast'\s*:\s*'Deep'/);
    expect(page).toContain("payload.mode = proAsset === 'crypto' ? 'deep' : 'hybrid';");
    expect(page).toContain('data-testid="pro-scan-mode"');
    expect(page).not.toContain('Fast mode enriches');
  });
});
