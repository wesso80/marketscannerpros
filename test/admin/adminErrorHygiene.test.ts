/**
 * Admin audit A5: admin and operator API routes must not send internal exception text to the browser. The helper logs
 * the full error under a short reference and returns a generic message carrying it. Crypto-markets, portfolio-lab and
 * crypto-discovery routes are excluded here: some throw deliberate operator messages and are reviewed separately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { adminErrorText } from '@/lib/admin/errorResponse';

const EXCLUDED = /^app\/api\/admin\/(crypto-markets|portfolio-lab|crypto-discovery|scanner-data-audit|diagnostics\/scanners)\//;
// Rewritten without raw errors by Codex's Health PR (#550); drop this skip once that lands.
const PENDING_REWRITE = new Set(['app/api/admin/health/route.ts']);

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (name === 'route.ts') out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

describe('adminErrorText', () => {
  it('returns a generic message with a reference and logs the real error under it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new Error('relation "secret_table" does not exist at postgres://user:pw@host');
    const text = adminErrorText(err, '/api/admin/example');
    expect(text).toMatch(/^Request failed \(ref [0-9a-f]{8}\)$/);
    expect(text).not.toContain('secret_table');
    const ref = text.match(/ref ([0-9a-f]{8})/)![1];
    expect(spy).toHaveBeenCalledWith(`[admin-error ${ref}] /api/admin/example`, err);
    spy.mockRestore();
  });
});

describe('admin and operator routes do not return raw exception text', () => {
  const files = [...routes('app/api/admin'), ...routes('app/api/operator')].filter((f) => !EXCLUDED.test(f) && !PENDING_REWRITE.has(f));
  const LEAK = [
    /\b(\w+) instanceof Error \? \1\.message\b/,
    /\b(details?|error|reason|note): (e|err|error)\.message\b/,
    /String\((e|err|error)\)\s*[},]/,
  ];
  it.each(files)('%s', (file) => {
    const src = readFileSync(file, 'utf8');
    for (const re of LEAK) expect(src, `${file} matches ${re}`).not.toMatch(re);
  });
});
