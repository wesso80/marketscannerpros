import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h=vi.hoisted(()=>({scope:{plan:'pro',subject:'account:a'} as any,started:vi.fn()}));
vi.mock('@/lib/publicAiQuota',()=>({publicAiScope:()=>h.scope,markPublicAiProviderStarted:h.started}));
import { publicCopilot } from '@/lib/ai/publicCopilot';
import { issueSymbolEvidence } from '@/lib/ai/publicCopilotEvidence';
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.stubEnv('APP_SIGNING_SECRET','test-only');vi.stubEnv('OPENAI_API_KEY','fake-not-a-key');h.scope={plan:'pro',subject:'account:a'};h.started.mockClear();fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const token=()=>issueSymbolEvidence({contract:'public-symbol-v2',meta:{symbol:'AAPL',timeframe:'daily'},canonical:{price:123}} as any,'account:a');
const request=(extra={})=>new NextRequest('http://localhost/api/ai/copilot',{method:'POST',body:JSON.stringify({message:'Explain this page',pagePath:'/tools/golden-egg',symbol:'AAPL',evidenceToken:token(),...extra})});
it('fails before model calls for Free, missing evidence or another symbol',async()=>{
 h.scope.plan='free';expect((await publicCopilot(request())).status).toBe(403);
 h.scope.plan='pro';expect((await publicCopilot(request({evidenceToken:'forged'}))).status).toBe(409);
 expect((await publicCopilot(request({symbol:'BTC'}))).status).toBe(409);expect(fetcher).not.toHaveBeenCalled();
});
it('sends signed evidence only, no client history, private data or tools',async()=>{
 fetcher.mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify({statements:[{kind:'explanation',text:'missing',evidenceIds:[]}]})}}]}));
 const result=await publicCopilot(request({pageData:{score:'PRIVATE_SENTINEL'},conversationHistory:[{content:'HISTORY_SENTINEL'}]}));
 expect(result.status).toBe(200);
 const sent=JSON.parse(fetcher.mock.calls[0][1].body);expect(sent.tools).toBeUndefined();
 expect(JSON.stringify(sent)).not.toMatch(/PRIVATE_SENTINEL|HISTORY_SENTINEL/);
 expect(sent.response_format.json_schema.strict).toBe(true);
});
it('reports missing key, rejected output and interrupted provider truthfully',async()=>{
 vi.stubEnv('OPENAI_API_KEY','');expect((await publicCopilot(request())).status).toBe(503);expect(h.started).not.toHaveBeenCalled();
 vi.stubEnv('OPENAI_API_KEY','fake');fetcher.mockResolvedValueOnce(Response.json({choices:[{message:{content:'{}'}}]}));expect((await publicCopilot(request())).status).toBe(422);
 fetcher.mockRejectedValueOnce(Error('timeout'));expect((await publicCopilot(request())).status).toBe(503);
});

it.each(['You should buy now.', 'The recorded price is 987.65.', 'Read https://example.com.'])(
 'withholds rejected model output: %s', async text => {
  fetcher.mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify({statements:[{kind:'explanation',text,evidenceIds:[]}]})}}]}));
  const result=await publicCopilot(request());
  expect(result.status).toBe(422);
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  const body=await result.json();
  expect(body.content).toBeUndefined();
  expect(body.error).toContain('No question credit was used');
  expect(JSON.stringify(body)).not.toContain(text);
 });
