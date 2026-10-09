import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({q:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/db',()=>({q:m.q}));vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));vi.mock('@/lib/admin/errorResponse',()=>({adminErrorText:vi.fn()}));
import {compareExpectancy,type ShadowRow} from '@/lib/admin/expectancyShadow';
import {GET} from '@/app/api/admin/expectancy-shadow/route';
import {evidence} from './fixtures/outcomeEvidence';
const rows=(n:number,known=true):ShadowRow[]=>Array.from({length:n},(_,i)=>({id:String(i),symbol_match:true,playbook_match:true,signed_move:2,outcome:'correct',signal_at:'2026-10-01',provenance_evidence:known?evidence():{...evidence(),provenance:null}}));
beforeEach(()=>{m.q.mockReset().mockResolvedValue([]);m.auth.mockReset().mockResolvedValue({ok:true});});
it('does not double count overlapping histories to meet the score threshold',()=>{
 const result=compareExpectancy(rows(20),50);expect(result.current.overlap).toBe(20);expect(result.current.eligibilitySample).toBe(20);expect(result.current.scoreBoost).toBe(0);
});
it('shows a hypothetical difference without passing unknown rows into verified history',()=>{
 const result=compareExpectancy([...rows(15),...rows(15,false)],99);
 expect(result.current.scoreBoost).toBe(3.6);expect(result.current.hypotheticalEliteScore).toBe(100);expect(result.verified.scoreBoost).toBe(0);expect(result.hypotheticalScoreDelta).toBe(-1);
});
it('preserves no-base-score and empty-verified states',()=>{
 const r=compareExpectancy(rows(30,false),null);expect(r.verifiedSampleAvailable).toBe(false);expect(r.hypotheticalScoreDelta).toBeNull();expect(r.verified.symbol.sample).toBe(0);
});
it('rejects before database work and does not cache refusals',async()=>{
 m.auth.mockResolvedValue({ok:false});const r=await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow'));expect(r.status).toBe(403);expect(m.q).not.toHaveBeenCalled();expect(r.headers.get('Cache-Control')).toBe('private, no-store');
});
it.each(['symbol=','symbol=AAPL&playbook=P&baseScore=NaN','symbol=AAPL&playbook=P&baseScore=101','symbol=AAPL&playbook='])('rejects bad input %s',async query=>{
 expect((await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow?'+query))).status).toBe(400);expect(m.q).not.toHaveBeenCalled();
});
it('projects summaries only and binds exact input parameters',async()=>{
 m.q.mockResolvedValue(rows(30));const r=await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow?symbol=aapl&playbook=Breakout&baseScore=0'));const body=await r.json();
 expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(m.q.mock.calls[0][1]).toEqual(['AAPL','Breakout',expect.any(String)]);expect(body.baseScore).toBe(0);expect(JSON.stringify(body)).not.toMatch(/provenance_evidence|entryPrice|observedPrice/);
});
it('never returns partial results or raw errors',async()=>{
 m.q.mockResolvedValue(rows(20001));expect((await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow?symbol=AAPL&playbook=P'))).status).toBe(422);
 m.q.mockRejectedValue(new Error('private key'));const r=await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow?symbol=AAPL&playbook=P'));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('private key');
});
