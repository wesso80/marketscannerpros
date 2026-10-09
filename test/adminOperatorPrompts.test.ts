/**
 * The owner's private desk gets direct trade plans; the public never sees these prompts.
 * - /api/msp-analyst is wrapped by privateAnalystHandler (admin/operator only).
 * - /api/ai/copilot sends public users to publicCopilot; only the admin handler uses the operator prompts.
 * - The public copilot modules never import the admin prompts.
 * - The operator rules forbid placing orders or using a broker, and require the AI output standard fields.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_OPERATOR_RULES } from '@/lib/prompts/adminOperatorRules';

const read = (f: string) => readFileSync(f, 'utf8');
const ADMIN_PROMPTS = ['adminOperatorRules', 'arcaV3Engine', 'mspAnalystV2', 'scannerExplainerRules', 'platformKnowledge'];

describe('admin operator prompts stay private', () => {
  it('msp-analyst is admin-gated before any handler work', () => {
    expect(read('app/api/msp-analyst/route.ts')).toMatch(/export const POST = privateAnalystHandler\(/);
    expect(read('lib/ai/legacyAnalystAccess.ts')).toMatch(/session\.is_admin === true \|\| isOperator\(/);
  });

  it('copilot routes public users to the public copilot and only admins to the operator handler', () => {
    expect(read('app/api/ai/copilot/route.ts')).toMatch(/routeCopilotRequest\(req, handleLegacyPost\)/);
    const access = read('lib/ai/copilotAccess.ts');
    expect(access).toMatch(/if \(publicAiScope\(\)\) return publicCopilot\(request\)/);
    expect(access).toMatch(/privateAccess \? legacyHandler\(request\) : unavailable\(\)/);
  });

  it('no public copilot module imports an admin prompt', () => {
    const publicFiles = readdirSync('lib/ai').filter((f) => /^publicCopilot/.test(f)).map((f) => `lib/ai/${f}`);
    expect(publicFiles.length).toBeGreaterThan(0);
    for (const f of publicFiles) for (const p of ADMIN_PROMPTS) expect(read(f), `${f} imports ${p}`).not.toContain(`prompts/${p}`);
  });

  it('admin-only surfaces list matches the files that use the operator prompts', () => {
    const compliance = read('test/public-compliance-copy.test.ts');
    const list = compliance.slice(compliance.indexOf('ADMIN_ONLY_AI_SURFACES'), compliance.indexOf('];', compliance.indexOf('ADMIN_ONLY_AI_SURFACES')));
    for (const f of ['app/api/msp-analyst/route.ts', 'lib/prompts/arcaV3Engine.ts', 'lib/prompts/mspAnalystV2.ts', 'lib/prompts/scannerExplainerRules.ts']) expect(list).toContain(f);
    // The copilot route also hosts public routing, so it stays a public surface.
    expect(list).not.toContain('app/api/ai/copilot/route.ts');
  });

  it('operator rules: direct plans allowed, never place orders or use a broker, required fields present', () => {
    expect(ADMIN_OPERATOR_RULES).toMatch(/Never place, route, queue or claim to have sent an order/);
    expect(ADMIN_OPERATOR_RULES).toMatch(/never connect to or act through a broker/);
    for (const field of ['Opportunity Score', 'Evidence Quality Score', 'Personal exposure', 'Confidence statement', 'What confirms', 'invalidates', 'Main risk']) {
      expect(ADMIN_OPERATOR_RULES).toContain(field);
    }
    expect(ADMIN_OPERATOR_RULES).toMatch(/Never present a score as a probability/);
  });
});
