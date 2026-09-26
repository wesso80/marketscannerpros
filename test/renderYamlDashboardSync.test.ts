import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * render.yaml must mirror values set live on the Render dashboard, otherwise a
 * Blueprint sync silently reverts them. Parsed as text (no yaml dependency):
 * each service block starts at "  - type:" and runs to the next one.
 */
const yaml = readFileSync(join(__dirname, '..', 'render.yaml'), 'utf8');

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
  it('persist-edge-packets-crypto runs every 15 minutes (no longer the Feb-30 pause)', () => {
    const block = serviceBlock('persist-edge-packets-crypto');
    expect(block).toMatch(/\n    schedule: "\*\/15 \* \* \* \*"/);
    expect(block).not.toContain('"0 0 30 2 *"');
    expect(block).toContain(`--data '{"market":"CRYPTO","timeframe":"15m"}'`);
  });

  it('daily-operator-morning-brief posts an explicit EQUITIES market', () => {
    const block = serviceBlock('daily-operator-morning-brief');
    expect(block).toContain(`--data '{"scanLimit":80,"market":"EQUITIES"}'`);
  });

  it('web service ALPHA_VANTAGE_RPM is 600', () => {
    expect(envValue(serviceBlock('marketscannerpros'), 'ALPHA_VANTAGE_RPM')).toBe('600');
  });

  it('OPERATOR_CG_FETCH_ENABLED is not pinned in render.yaml (dashboard owns it)', () => {
    expect(yaml).not.toMatch(/- key: OPERATOR_CG_FETCH_ENABLED\n\s+value:/);
  });
});
