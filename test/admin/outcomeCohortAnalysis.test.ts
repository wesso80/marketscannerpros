import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { analyzeOutcomeCohort, type AnalysisRow } from '@/lib/admin/outcomeCohortAnalysis';
import { evidence } from './fixtures/outcomeEvidence';
const mocks = vi.hoisted(() => ({q: vi.fn(), auth: vi.fn()}));
vi.mock('@/lib/db', () => ({q: mocks.q}));
vi.mock('@/lib/adminAuth', () => ({requireAdmin: mocks.auth}));
vi.mock('@/lib/admin/errorResponse', () => ({adminErrorText: vi.fn()}));
import { GET } from '@/app/api/admin/outcome-cohorts/route';
const row = (): AnalysisRow => ({group_name: 'A', signal_at: '2026-10-01T12:00:00Z', provenance_evidence: evidence()});
const req = (query = '') => new NextRequest(`http://localhost/api/admin/outcome-cohorts${query}`);
beforeEach(() => {mocks.q.mockReset().mockResolvedValue([]); mocks.auth.mockReset().mockResolvedValue({ok:true});});
describe('cohort calculations', () => {
  it('separates valid evidence, missing attribution and mismatched measurements without fallback', () => {
    const valid = row(), unknown = row(), mismatch = row();
    unknown.provenance_evidence = {...evidence(), provenance:null, outcome:'wrong', pctMove:-2};
    mismatch.provenance_evidence = {...evidence(), outcome:'neutral', pctMove:0};
    const all = [valid, unknown, mismatch];
    expect(analyzeOutcomeCohort(all,'all').overall).toMatchObject({records:3,correct:1,wrong:1,neutral:1,directionalHitRate:50,avgSignedMovePct:0});
    const verified = analyzeOutcomeCohort(all,'verified');
    expect(verified.provenance).toEqual({cohort:'verified',total:3,verified:1,unknown:1,inconsistent:1,selected:1});
    expect(verified.overall.directionalHitRate).toBe(100);
    expect(analyzeOutcomeCohort(all,'unverified').overall.directionalHitRate).toBe(0);
    expect(analyzeOutcomeCohort([unknown],'verified')).toMatchObject({overall:{records:0,directionalHitRate:null,avgSignedMovePct:null},dataAsOf:null,groups:[]});
  });
  it('signs SHORT moves and gives neutral its own denominator; skips invalid moves', () => {
    const short = row(), neutral = row(), invalid = row();
    short.provenance_evidence = {...evidence(), direction:'SHORT', pctMove:-2};
    neutral.provenance_evidence = {...evidence(), outcome:'neutral', pctMove:0};
    invalid.provenance_evidence = {...evidence(), outcome:'wrong', pctMove:101};
    expect(analyzeOutcomeCohort([short,neutral,invalid],'all').overall).toMatchObject({records:3,directionalDenominator:2,moveSamples:2,avgSignedMovePct:1,directionalHitRate:50});
  });
  it('keeps every group in alphabetical order and selected timestamps only', () => {
    const a = row(), z = {...row(),group_name:'Z',signal_at:'2026-10-09T12:00:00Z',provenance_evidence:undefined};
    expect(analyzeOutcomeCohort([z,a],'all').groups.map(g=>g.name)).toEqual(['A','Z']);
    expect(analyzeOutcomeCohort([z,a],'verified').dataAsOf).toBe('2026-10-01T12:00:00.000Z');
  });
});
describe('admin route contract', () => {
  it('rejects before fetching and marks refusal private', async () => {
    mocks.auth.mockResolvedValue({ok:false});const res = await GET(req());
    expect(res.status).toBe(403);expect(res.headers.get('Cache-Control')).toBe('private, no-store');expect(mocks.q).not.toHaveBeenCalled();
  });
  it.each(['?scope=__proto__','?scope=constructor','?days=NaN','?days=365','?scope=public'])('rejects invalid inputs %s before fetching',async query=>{
    expect((await GET(req(query))).status).toBe(400);expect(mocks.q).not.toHaveBeenCalled();
  });
  it.each(['signals','scorecard','backtest'])('uses the %s scope and strips raw evidence',async scope=>{
    mocks.q.mockResolvedValue([row()]);const res = await GET(req(`?scope=${scope}&cohort=verified&days=7`));const body = await res.json();
    expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.overall.records).toBe(1);expect(mocks.q.mock.calls[0][1]).toEqual([scope,7,expect.any(String),20001]);
    expect(JSON.stringify(body)).not.toMatch(/provenance_evidence|entryPrice|observedPrice|label-ai-outcomes/);
  });
  it('refuses oversized cohorts rather than reporting a truncated rate', async () => {
    mocks.q.mockResolvedValue(Array(20001).fill(row()));const res = await GET(req());const body = await res.json();
    expect(res.status).toBe(422);expect(body.overall).toBeUndefined();expect(body.error).toContain('no partial statistics');
  });
  it('does not return provider/database error details or success counts on failure',async()=>{
    mocks.q.mockRejectedValue(new Error('private connection key'));const res = await GET(req());const body = await res.json();
    expect(res.status).toBe(503);expect(res.headers.get('Cache-Control')).toBe('private, no-store');expect(JSON.stringify(body)).not.toContain('private connection');expect(body.overall).toBeUndefined();
  });
});
