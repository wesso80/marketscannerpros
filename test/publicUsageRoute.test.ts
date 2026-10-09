import { NextRequest } from 'next/server';
import { beforeEach,describe,it,expect,vi } from 'vitest';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'fixture'},resolve:vi.fn(),status:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicActor:h.resolve,publicQuota:{status:h.status}}));
import { GET,POST } from '@/app/api/public-usage/route';
const INTERNAL='http://0.0.0.0:10000/api/public-usage';
const post=(headers:Record<string,string>,url=INTERNAL)=>POST(new NextRequest(url,{method:'POST',headers}));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('APP_SIGNING_SECRET','local-fixture-signing-key');h.enabled=true;h.session={workspaceId:'fixture'};h.resolve.mockResolvedValue({bypass:false,subject:'account:fixture',plan:'free'});h.status.mockResolvedValue({plan:'free',quotas:[]});});
it('is inactive before rollout and private when enabled',async()=>{
 h.enabled=false;expect(await (await GET(new NextRequest('http://localhost/api/public-usage'))).json()).toEqual({enabled:false});expect(h.resolve).not.toHaveBeenCalled();
 h.enabled=true;const r=await GET(new NextRequest('http://localhost/api/public-usage'));expect(r.headers.get('cache-control')).toBe('private, no-store');expect(h.status).toHaveBeenCalledWith('account:fixture','free');
});
it('fails closed without exposing subscription diagnostics',async()=>{
 h.resolve.mockRejectedValue(Error('secret database diagnostic'));const r=await GET(new NextRequest('http://localhost/api/public-usage'));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('secret');
});

it('issues a signed browser cookie only through a same-origin, rate-limited opt-in',async()=>{
 const rejected=await POST(new NextRequest('http://localhost/api/public-usage',{method:'POST',headers:{origin:'https://elsewhere.test'}}));expect(rejected.status).toBe(403);
 const accepted=await POST(new NextRequest('http://localhost/api/public-usage',{method:'POST',headers:{origin:'http://localhost'}}));expect(accepted.status).toBe(200);expect(accepted.headers.get('set-cookie')).toContain('HttpOnly');expect(accepted.headers.get('set-cookie')).toContain('SameSite=lax');
});

describe('public origin behind the Render proxy',()=>{
 it('accepts the public origin when nextUrl is the internal host',async()=>{
  const accepted=await post({origin:'https://marketscannerpros.app','x-forwarded-host':'marketscannerpros.app','x-forwarded-proto':'https'});
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get('set-cookie')).toContain('Secure');
 });
 it('accepts the www origin',async()=>{
  expect((await post({origin:'https://www.marketscannerpros.app','x-forwarded-host':'marketscannerpros.app','x-forwarded-proto':'https'})).status).toBe(200);
 });
 it('accepts a configured site URL origin',async()=>{
  try {
   vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://site.example');
   expect((await post({origin:'https://site.example','x-forwarded-host':'0.0.0.0:10000','x-forwarded-proto':'http'})).status).toBe(200);
   vi.stubEnv('NEXT_PUBLIC_SITE_URL','');
   vi.stubEnv('NEXT_PUBLIC_APP_URL','https://staging.example/app');
   expect((await post({origin:'https://staging.example','x-forwarded-host':'spoofed.example','x-forwarded-proto':'https'})).status).toBe(200);
  } finally { vi.unstubAllEnvs(); vi.stubEnv('APP_SIGNING_SECRET','local-fixture-signing-key'); }
 });
 it('accepts a same-site Referer when Origin is absent',async()=>{
  expect((await post({referer:'https://marketscannerpros.app/tools/AAPL'})).status).toBe(200);
 });
 it('rejects a foreign origin',async()=>{
  const rejected=await post({origin:'https://evil.example','x-forwarded-host':'marketscannerpros.app','x-forwarded-proto':'https',referer:'https://marketscannerpros.app/'});
  expect(rejected.status).toBe(403);
  expect(await rejected.json()).toEqual({error:'Same-origin request required'});
 });
 it('rejects a missing Origin and Referer',async()=>{
  expect((await post({'x-forwarded-host':'marketscannerpros.app','x-forwarded-proto':'https'})).status).toBe(403);
 });
 it('rejects a spoofed x-forwarded-host that does not match Origin and is not allowlisted',async()=>{
  expect((await post({origin:'https://evil.example','x-forwarded-host':'spoofed.example','x-forwarded-proto':'https'})).status).toBe(403);
 });
 it('does not let a matching spoofed x-forwarded-host widen trust',async()=>{
  expect((await post({origin:'https://evil.example','x-forwarded-host':'evil.example','x-forwarded-proto':'https'})).status).toBe(403);
 });
 it('does not let a spoofed host header widen trust',async()=>{
  expect((await post({origin:'https://evil.example',host:'evil.example','x-forwarded-proto':'https'})).status).toBe(403);
 });
 it('rejects lookalike origins by exact match',async()=>{
  for(const origin of ['https://marketscannerpros.app.evil.example','https://evilmarketscannerpros.app','https://marketscannerpros.app:8443','http://marketscannerpros.app'])
   expect((await post({origin,'x-forwarded-host':'marketscannerpros.app','x-forwarded-proto':'https'})).status).toBe(403);
 });
});
