#!/usr/bin/env node
/**
 * scripts/brain/register-versions.ts
 *
 * Phase 8 — register the currently-deployed engine versions in
 * brain_model_versions. Idempotent: re-registering an identical
 * (model_name, version, scope, rules_hash) is a no-op (UPDATE notes only),
 * and a new version automatically supersedes the prior active row.
 *
 * Run after every deploy from your release pipeline:
 *   npx tsx scripts/brain/register-versions.ts
 */

import { registerModelVersion } from '../../lib/brain/modelVersions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Engine {
  modelName: string;
  version: string;
  rulesBodyFiles: string[]; // files concatenated to compute rules_hash
  notes?: string;
}

const root = join(__dirname, '..', '..');

const ENGINES: Engine[] = [
  {
    modelName: 'scanner',
    version: 'v3.4',
    rulesBodyFiles: ['app/api/scanner/run/route.ts'],
    notes: 'Evidence-renormalized score, direction floor, coverage-aware confidence, structure-anchored stop, cached-source penalty, RG enforcement.',
  },
  {
    modelName: 'golden_egg',
    version: 'v2.1',
    rulesBodyFiles: ['app/api/golden-egg/route.ts'],
    notes: 'Coverage-renormalized component blend, direction floor, structure-anchored invalidation, anti-bias on NEUTRAL.',
  },
  {
    modelName: 'time_confluence',
    version: 'v2.1',
    rulesBodyFiles: ['components/time/scoring.ts'],
    notes: 'Evidence-renormalized setup blend, direction floor, coverage-aware confidence, ALLOW→WAIT downgrade.',
  },
  {
    modelName: 'backtest',
    version: 'v1.2',
    rulesBodyFiles: ['app/api/backtest/route.ts', 'lib/backtest/runStrategy.ts'],
    notes: 'Sample-size aware confidence (40+ trades, 250+ bars).',
  },
  {
    modelName: 'engine_bridge',
    version: 'v1.0',
    rulesBodyFiles: ['lib/brain/engineBridge.ts'],
    notes: 'Shared coverage-aware confidence + direction floor utilities.',
  },
  {
    modelName: 'arca_prompt',
    version: 'v3',
    rulesBodyFiles: ['lib/prompts/arcaV3Engine.ts', 'lib/admin/arcaPrompt.ts'],
    notes: 'ARCA V3 narrative + decision trace prompt.',
  },
];

async function main() {
  const deployedBy = process.env.DEPLOYED_BY ?? process.env.USER ?? 'system';
  let ok = 0;
  let fail = 0;
  for (const eng of ENGINES) {
    try {
      const body = eng.rulesBodyFiles
        .map((f) => {
          try {
            return readFileSync(join(root, f), 'utf8');
          } catch {
            return '';
          }
        })
        .join('\n---\n');
      if (!body.trim()) {
        console.warn(`[register] ${eng.modelName}: no rules body found, skipping`);
        fail++;
        continue;
      }
      const id = await registerModelVersion({
        modelName: eng.modelName,
        version: eng.version,
        rulesBody: body,
        scope: 'global',
        deployedBy,
        notes: eng.notes,
      });
      console.log(`[register] ${eng.modelName} ${eng.version}  id=${id}`);
      ok++;
    } catch (err: any) {
      console.error(`[register] ${eng.modelName} FAILED:`, err?.message ?? err);
      fail++;
    }
  }
  console.log(`[register] done: ok=${ok} fail=${fail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[register] FAILED:', err);
    process.exit(1);
  });
