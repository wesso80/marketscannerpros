import { NextRequest } from 'next/server';
import { beforeEach,it,expect,vi } from 'vitest';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'fixture'},resolve:vi.fn(),status:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicActor:h.resolve,publicQuota:{status:h.status}}));
import { GET,POST } from '@/app/api/public-usage/route';
beforeEach(()=>{vi.clearAllMocks();h.enabled=true;h.session={workspaceId:'fixture'};h.resolve.mockResolvedValue({bypass:false,subject:'account:fixture',plan:'free'});h.status.mockResolvedValue({plan:'free',quotas:[]});});
it('is inactive before rollout and private when enabled',async()=>{
 h.enabled=false;expect(await (await GET(new NextRequest('http://localhost/api/public-usage'))).json()).toEqual({enabled:false});expect(h.resolve).not.toHaveBeenCalled();
 h.enabled=true;const r=await GET(new NextRequest('http://localhost/api/public-usage'));expect(r.headers.get('cache-control')).toBe('private, no-store');expect(h.status).toHaveBeenCalledWith('account:fixture','free');
});
it('fails closed without exposing subscription diagnostics',async()=>{
 h.resolve.mockRejectedValue(Error('secret database diagnostic'));const r=await GET(new NextRequest('http://localhost/api/public-usage'));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('secret');
});

it('issues a signed browser cookie only through a same-origin, rate-limited opt-in',async()=>{
 vi.stubEnv('APP_SIGNING_SECRET','local-fixture-signing-key');
 try {
 const rejected=await POST(new NextRequest('http://localhost/api/public-usage',{method:'POST',headers:{origin:'https://elsewhere.test'}}));expect(rejected.status).toBe(403);
 const accepted=await POST(new NextRequest('http://localhost/api/public-usage',{method:'POST',headers:{origin:'http://localhost'}}));expect(accepted.status).toBe(200);expect(accepted.headers.get('set-cookie')).toContain('HttpOnly');expect(accepted.headers.get('set-cookie')).toContain('SameSite=lax');
 }finally{vi.unstubAllEnvs();}
});
