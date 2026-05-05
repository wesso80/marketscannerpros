/**
 * Phase 10 — Brain Layer test scaffolds
 *
 * Property covered:
 *   - learning event is created WITH workspace_id
 *   - admin_only and public_safe are mutually exclusive
 *   - hashInputs() is deterministic (snapshot integrity helper)
 *
 * These tests mock `@/lib/db` so they do not require a live Postgres.
 * Live-DB integration tests (immutability triggers, public-safe view)
 * live in `test/brain/_live.skip.test.ts` (TODO scaffold below).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { qMock } = vi.hoisted(() => ({ qMock: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: qMock }));

import { recordBrainEvent, hashInputs } from '../../lib/brain/eventRecorder';

beforeEach(() => {
  qMock.mockReset();
  qMock.mockResolvedValue([]);
});

describe('recordBrainEvent — workspace_id contract', () => {
  it('throws when workspaceId is missing', async () => {
    await expect(
      recordBrainEvent({
        workspaceId: '',
        eventType: 'scanner.result_generated',
        source: 'scanner',
        dataFreshness: 'real-time',
        adminOnly: true,
        publicSafe: false,
      } as any),
    ).rejects.toThrow(/workspaceId is required/i);
    expect(qMock).not.toHaveBeenCalled();
  });

  it('throws when adminOnly and publicSafe are both true', async () => {
    await expect(
      recordBrainEvent({
        workspaceId: 'ws-1',
        eventType: 'scanner.result_generated',
        source: 'scanner',
        dataFreshness: 'real-time',
        adminOnly: true,
        publicSafe: true,
      } as any),
    ).rejects.toThrow(/mutually exclusive/i);
  });

  it('persists workspace_id as the 2nd parameter to the INSERT', async () => {
    await recordBrainEvent({
      workspaceId: 'ws-42',
      eventType: 'scanner.result_generated',
      source: 'scanner',
      dataFreshness: 'real-time',
      adminOnly: true,
      publicSafe: false,
    } as any);
    expect(qMock).toHaveBeenCalledTimes(1);
    const params = qMock.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe('ws-42');
  });
});

describe('hashInputs — snapshot determinism', () => {
  it('produces the same hash regardless of object key order', () => {
    const a = hashInputs({ b: 2, a: 1, c: [3, 4, { y: 9, x: 8 }] });
    const b = hashInputs({ c: [3, 4, { x: 8, y: 9 }], a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('changes when a value changes', () => {
    const a = hashInputs({ a: 1 });
    const b = hashInputs({ a: 2 });
    expect(a).not.toBe(b);
  });
});
