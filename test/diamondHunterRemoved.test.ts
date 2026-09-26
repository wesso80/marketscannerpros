import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toolWorkflows, workflowArea } from '@/lib/toolWorkflows';

const root = resolve(__dirname, '..');

describe('Diamond Hunter is removed', () => {
  it('has no page, API route, cron route, component or scoring library left', () => {
    for (const p of [
      'app/tools/diamond-hunter', 'app/api/crypto/diamond-hunter', 'app/api/cron/diamond-hunter', 'components/diamond',
      'lib/diamondHunter.ts', 'lib/diamondHunterScanner.ts', 'lib/diamondHunterHistory.ts', 'lib/diamondHunterValidation.ts', 'lib/diamondHunterOutcomeTracker.ts',
    ]) expect(existsSync(resolve(root, p)), p).toBe(false);
  });

  it('is gone from the tool directory and nav', () => {
    expect(JSON.stringify(toolWorkflows)).not.toMatch(/diamond/i);
    expect(readFileSync(resolve(root, 'lib/toolWorkflows.ts'), 'utf8')).not.toMatch(/diamond/i);
    expect(workflowArea('/tools/scanner')).toBe('scanner');
  });

  it('old links redirect to the crypto tools page instead of 404ing', () => {
    const config = readFileSync(resolve(root, 'next.config.mjs'), 'utf8');
    expect(config).toContain("{ source: '/tools/diamond-hunter', destination: '/tools/explorer?tab=crypto-command', permanent: false }");
  });
});
