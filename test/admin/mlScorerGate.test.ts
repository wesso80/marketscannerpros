/** ML Scorer: below MIN_TRAINING_SETUPS resolved setups, no prediction, weights or fit figures are returned. */
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ train: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, workspaceId: 'ws-admin' })) }));
vi.mock('@/lib/ml/scorer', async (orig) => ({ ...(await orig<typeof import('@/lib/ml/scorer')>()), trainModel: m.train }));

import { GET, POST } from '@/app/api/admin/ml-scorer/route';
import { FEATURE_DIM } from '@/lib/ml/features';

const model = (n: number) => ({
  n, bias: -0.8, trainedAt: '2026-10-10T00:00:00Z', trainLogLoss: 0.009, trainAcc: 1,
  weights: Array.from({ length: FEATURE_DIM }, (_, i) => (i % 2 ? 0.5 : -0.5)),
  featureNames: Array.from({ length: FEATURE_DIM }, (_, i) => `f${i}`),
});
const post = () => POST(new NextRequest('http://localhost/api/admin/ml-scorer', { method: 'POST', body: JSON.stringify({ features: { direction: 'long' } }) }));

beforeEach(() => m.train.mockReset());

it('withholds weights and fit figures, and refuses to predict, with 7 resolved setups', async () => {
  m.train.mockResolvedValue(model(7));
  const g = await (await GET(new NextRequest('http://localhost/api/admin/ml-scorer'))).json();
  expect(g).toMatchObject({ ok: true, reliable: false, minTrainingSetups: 30, model: { n: 7 } });
  expect(g.model).not.toHaveProperty('topFeatures');
  expect(g.model).not.toHaveProperty('trainAcc');
  const p = await (await post()).json();
  expect(p).toMatchObject({ ok: true, probability: null, reliable: false, modelN: 7 });
  expect(p.reason).toMatch(/7 of 30/);
});

it('returns weights and a probability once the minimum is reached', async () => {
  m.train.mockResolvedValue(model(30));
  const g = await (await GET(new NextRequest('http://localhost/api/admin/ml-scorer'))).json();
  expect(g.reliable).toBe(true);
  expect(g.model.topFeatures.length).toBeGreaterThan(0);
  const p = await (await post()).json();
  expect(p.reliable).toBe(true);
  expect(typeof p.probability).toBe('number');
});
