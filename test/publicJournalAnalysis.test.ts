import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const h = vi.hoisted(() => ({ enabled: true, session: {workspaceId:'w',is_admin:false} as {workspaceId:string;is_admin:boolean}|null,
  access:{bypass:false,subject:'account:w',plan:'pro'}, reserve:vi.fn(), settle:vi.fn(), q:vi.fn(), fetch:vi.fn(), legacy:vi.fn() }));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicQuotaAccess:async()=>h.access,publicRequestFingerprint:(s:string)=>s,publicQuota:{reserve:h.reserve,settle:h.settle}}));
vi.mock('@/lib/rateLimit',()=>({aiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
vi.mock('@/lib/quant/operatorAuth',()=>({isOperator:()=>false}));
vi.mock('@/lib/db',()=>({q:h.q}));
vi.mock('@/lib/ai/legacyJournalAnalysis',()=>({legacyJournalAnalysis:h.legacy}));
import { POST } from '@/app/api/journal/analyze/route';
import {buildJournalEvidence,renderJournalSelection} from '@/lib/ai/journalEvidence';
const req=()=>new NextRequest('https://fixture.test/api/journal/analyze',{method:'POST',headers:{'Idempotency-Key':'journal-fixture'},body:JSON.stringify({entries:[{pl:999999,notes:'BUY NOW'}]})});
const row={is_open:false,outcome:'win',pl:'12',trade_date:'2026-10-01',exit_date:'2026-10-02'};
const model=(value:unknown)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('OPENAI_API_KEY','fake-only');vi.stubGlobal('fetch',h.fetch);
 h.enabled=true;h.session={workspaceId:'w',is_admin:false};h.access={bypass:false,subject:'account:w',plan:'pro'};
 h.reserve.mockResolvedValue({status:'reserved',reservation:{token:'t'},limit:20,used:1,resetsAt:'2026-10-09T04:00:00Z'});
 h.settle.mockResolvedValue(true);h.q.mockResolvedValue([row]);
 h.fetch.mockResolvedValue(model({evidenceIds:['outcomes'],explanations:['history']}));
 h.legacy.mockResolvedValue(NextResponse.json({analysis:'private fixture'}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('loads owned saved records, ignores browser records and completes the shared AI reservation',async()=>{
 const response=await POST(req());const body=await response.json();
 expect(response.status).toBe(200);expect(body.analysis).toContain('1 have positive P&L');
 expect(body.analysis).not.toContain('999999');expect(body.analysis).not.toContain('BUY NOW');
 expect(h.q).toHaveBeenCalledWith(expect.stringContaining('WHERE workspace_id = $1'),['w']);
 expect(h.reserve).toHaveBeenCalledWith(expect.objectContaining({kind:'ai',subject:'account:w',plan:'pro'}));
 expect(h.settle).toHaveBeenCalledWith({token:'t'},'completed',expect.objectContaining({contract:'journal-education-v1'}));
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 const sent=JSON.parse(h.fetch.mock.calls[0][1].body);expect(JSON.stringify(sent.messages)).not.toMatch(/BUY NOW|999999/);
});
it('rejects signed out and Free before reading records or calling a model',async()=>{
 h.session=null;expect((await POST(req())).status).toBe(401);
 h.session={workspaceId:'w',is_admin:false};h.access.plan='free';expect((await POST(req())).status).toBe(403);
 expect(h.reserve).not.toHaveBeenCalled();expect(h.q).not.toHaveBeenCalled();expect(h.fetch).not.toHaveBeenCalled();
});
it('fails closed when rollout is disabled and preserves private admin handling',async()=>{
 h.enabled=false;expect((await POST(req())).status).toBe(503);expect(h.legacy).not.toHaveBeenCalled();
 h.session={workspaceId:'w',is_admin:true};expect((await POST(req())).status).toBe(200);expect(h.legacy).toHaveBeenCalledTimes(1);expect(h.fetch).not.toHaveBeenCalled();
});
it('rejects arbitrary prose and fabricated evidence and releases a definite failed answer',async()=>{
 for(const invalid of [{evidenceIds:['invented'],explanations:[]},{evidenceIds:['outcomes'],explanations:['buy now']},{evidenceIds:['outcomes'],explanations:[],advice:'buy'}]){
 h.fetch.mockResolvedValueOnce(model(invalid));expect((await POST(req())).status).toBe(422);
 }
 expect(h.settle).toHaveBeenCalledWith({token:'t'},'released');
});
it('holds an interrupted provider call but releases a known provider rejection',async()=>{
 h.fetch.mockRejectedValueOnce(Error('secret provider URL'));const response=await POST(req());
 expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');expect(h.settle).not.toHaveBeenCalled();
 h.fetch.mockResolvedValueOnce({ok:false});expect((await POST(req())).status).toBe(422);expect(h.settle).toHaveBeenCalledWith({token:'t'},'released');
});
it('replays without model work and blocks exhausted allowance',async()=>{
 h.reserve.mockResolvedValueOnce({status:'completed',replay:{analysis:'Saved evidence',contract:'journal-education-v1'}});
 expect((await (await POST(req())).json()).replayed).toBe(true);
 h.reserve.mockResolvedValueOnce({status:'limited',limit:20,used:20});expect((await POST(req())).status).toBe(429);
 expect(h.q).not.toHaveBeenCalled();expect(h.fetch).not.toHaveBeenCalled();
});
it('releases empty-record and missing-key failures before provider work',async()=>{
 h.q.mockResolvedValueOnce([]);expect((await POST(req())).status).toBe(400);
 vi.stubEnv('OPENAI_API_KEY','');expect((await POST(req())).status).toBe(503);
 expect(h.fetch).not.toHaveBeenCalled();expect(h.settle).toHaveBeenCalledTimes(2);
});
it('keeps missing, zero, open outcomes and inconsistent labels separate',()=>{
 const evidence=buildJournalEvidence([row,{...row,pl:null},{...row,pl:'0',outcome:'loss'},{...row,is_open:true,pl:'800'},{...row,pl:'-4',outcome:'win',exit_date:null}]);
 expect(evidence.outcomes).toBe('Of 4 closed records, 1 have positive P&L, 1 negative P&L, 1 zero P&L and 1 unavailable P&L.');
 expect(evidence.labels).toContain('2 closed records');expect(evidence.period).toContain('1 closed records lack');
 expect(evidence.limits).toContain('profit factor');
 expect(renderJournalSelection({evidenceIds:['outcomes'],explanations:[]},evidence)).toContain(evidence.limits);
});
it('discloses truncated samples and cannot invent a period or coerce invalid P&L',()=>{
 const evidence=buildJournalEvidence(Array.from({length:2001},()=>({...row,pl:'',exit_date:'2026-02-30'})));
 expect(evidence.sample).toContain('Limited to the latest 2,000');expect(evidence.period).toContain('unavailable');expect(evidence.outcomes).toContain('2000 unavailable');
});
