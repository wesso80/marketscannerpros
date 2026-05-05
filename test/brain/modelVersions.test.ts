/**
 * Phase 10 — Model / rules version registry tests
 *
 * Properties covered:
 *   - hashRulesBody is deterministic and content-sensitive
 *   - registerModelVersion() calls the SQL function (which atomically
 *     supersedes prior rows — see migrations/075_brain_schema_audit.sql)
 *   - registerModelVersion() does NOT issue an UPDATE/DELETE against the
 *     table directly (i.e. it cannot overwrite history)
 *
 * Live-DB integration scenarios (skipped, see bottom):
 *   - calling brain_register_model_version twice creates 2 rows;
 *     the older row gets superseded_at set, body is preserved
 *   - immutability triggers reject UPDATE/DELETE on brain_events,
 *     brain_features (any column), brain_outcomes (immutable cols)
 *   - brain_public_events_safe view excludes admin_only=true rows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { qMock } = vi.hoisted(() => ({ qMock: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: qMock }));

import {
  hashRulesBody,
  registerModelVersion,
} from '../../lib/brain/modelVersions';

beforeEach(() => {
  qMock.mockReset();
});

describe('hashRulesBody', () => {
  it('returns a 64-char sha256 hex digest', () => {
    const h = hashRulesBody('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic for identical input', () => {
    expect(hashRulesBody('rules-v1')).toBe(hashRulesBody('rules-v1'));
  });
  it('changes when the body changes', () => {
    expect(hashRulesBody('rules-v1')).not.toBe(hashRulesBody('rules-v2'));
  });
});

describe('registerModelVersion — append-only contract', () => {
  it('invokes brain_register_model_version() (atomic supersede SQL fn)', async () => {
    qMock.mockResolvedValueOnce([{ id: 7 }]);
    const id = await registerModelVersion({
      modelName: 'edge_scorer',
      version: 'v1.0',
      rulesBody: 'rules-v1.0-body',
    });
    expect(id).toBe(7);
    expect(qMock).toHaveBeenCalledTimes(1);
    const sql = qMock.mock.calls[0][0] as string;
    expect(sql).toContain('brain_register_model_version');
  });

  it('never issues UPDATE/DELETE against brain_model_versions directly', async () => {
    qMock.mockResolvedValueOnce([{ id: 1 }]);
    await registerModelVersion({
      modelName: 'arca_prompt',
      version: 'v2.0',
      rulesBody: 'arca-rules',
    });
    for (const call of qMock.mock.calls) {
      const sql = (call[0] as string).toUpperCase();
      // History-rewriting statements must not appear from this code path.
      expect(sql).not.toMatch(/UPDATE\s+BRAIN_MODEL_VERSIONS\b/);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+BRAIN_MODEL_VERSIONS\b/);
    }
  });

  it('passes the sha256 of rulesBody as rules_hash parameter', async () => {
    qMock.mockResolvedValueOnce([{ id: 1 }]);
    await registerModelVersion({
      modelName: 'edge_scorer',
      version: 'v1.1',
      rulesBody: 'body-A',
    });
    const params = qMock.mock.calls[0][1] as unknown[];
    // brain_register_model_version($1=name, $2=version, $3=rules_hash, ...)
    expect(params[2]).toBe(hashRulesBody('body-A'));
  });

  it('throws when modelName is empty', async () => {
    await expect(
      registerModelVersion({
        modelName: '',
        version: 'v1',
        rulesBody: 'x',
      }),
    ).rejects.toThrow(/modelName required/);
    expect(qMock).not.toHaveBeenCalled();
  });
});

// ─── Live DB integration scaffolds (skipped) ─────────────────────────────────
//
// These need migrations 073/074/075 applied to a test Postgres instance.
// Un-skip when running with DATABASE_URL pointing at a disposable DB.
describe.skip('Live DB — model version history is append-only', () => {
  it('two registrations produce two rows; older has superseded_at set', async () => {
    // 1. registerModelVersion({ modelName: 'edge_scorer', version: 'v1', rulesBody: 'a' })
    // 2. registerModelVersion({ modelName: 'edge_scorer', version: 'v2', rulesBody: 'b' })
    // 3. SELECT … WHERE model_name='edge_scorer' ORDER BY deployed_at DESC
    // expect rows.length === 2 and rows[1].superseded_at !== null
  });
});

describe.skip('Live DB — input snapshots are immutable', () => {
  it('UPDATE on brain_events raises an exception', async () => {
    // INSERT a brain_events row, then UPDATE — expect Postgres error
    // 'brain_events is append-only (Phase 8 immutability rule)'.
  });
  it('UPDATE on brain_features raises an exception', async () => {
    // Same shape — features are frozen feature snapshots.
  });
  it('UPDATE on brain_outcomes immutable fields raises an exception', async () => {
    // Only learning_eligible / eligibility_reasons / memory_dimension /
    // memory_rule_version may be updated; mutating mfe_pct must throw.
  });
});

describe.skip('Live DB — public-safe view excludes admin_only', () => {
  it('admin_only=true rows are absent from brain_public_events_safe', async () => {
    // INSERT one admin_only=true row + one public_safe=true row.
    // SELECT * FROM brain_public_events_safe WHERE event_id IN (...) → only public row.
  });
});
