import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * render.yaml must mirror values set live on the Render dashboard, otherwise a
 * Blueprint sync silently reverts them. Parsed as text (no yaml dependency):
 * each service block starts at "  - type:" and runs to the next one.
 */
const yaml = readFileSync(join(__dirname, '..', 'render.yaml'), 'utf8').replace(/\r\n/g, '\n'); // CRLF on Windows checkouts

function serviceBlock(name: string): string {
  const blocks = yaml.split(/\n(?=  - type: )/);
  const block = blocks.find((b) => new RegExp(`\\n    name: ${name}\\n`).test(b));
  if (!block) throw new Error(`service ${name} not found in render.yaml`);
  return block;
}

function envValue(block: string, key: string): string | null {
  const m = block.match(new RegExp(`- key: ${key}\\n\\s+value: "([^"]*)"`));
  return m ? m[1] : null;
}

describe('render.yaml matches the Render dashboard (2026-09-27)', () => {
  // persist-edge-packets-crypto and daily-operator-morning-brief moved into the worker schedule on 2026-10-02;
  // their schedule/body pins now live in test/worker/scheduler.test.ts against lib/worker/schedule.ts.
  it('the migrated cron services are gone from render.yaml', () => {
    expect(() => serviceBlock('persist-edge-packets-crypto')).toThrow();
    expect(() => serviceBlock('daily-operator-morning-brief')).toThrow();
  });

  it('web service ALPHA_VANTAGE_RPM is 600', () => {
    expect(envValue(serviceBlock('marketscannerpros'), 'ALPHA_VANTAGE_RPM')).toBe('600');
  });

  it('OPERATOR_CG_FETCH_ENABLED is not pinned in render.yaml (dashboard owns it)', () => {
    expect(yaml).not.toMatch(/- key: OPERATOR_CG_FETCH_ENABLED\n\s+value:/);
  });
});
