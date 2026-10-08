import { beforeEach,it,expect,vi } from 'vitest';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'fixture'},resolve:vi.fn(),status:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicQuotaAccess:h.resolve,publicQuota:{status:h.status}}));
import { GET } from '@/app/api/public-usage/route';
beforeEach(()=>{vi.clearAllMocks();h.enabled=true;h.session={workspaceId:'fixture'};h.resolve.mockResolvedValue({bypass:false,subject:'account:fixture',plan:'free'});h.status.mockResolvedValue({plan:'free',quotas:[]});});
it('is inactive before rollout and private when enabled',async()=>{
 h.enabled=false;expect(await (await GET()).json()).toEqual({enabled:false});expect(h.resolve).not.toHaveBeenCalled();
 h.enabled=true;const r=await GET();expect(r.headers.get('cache-control')).toBe('private, no-store');expect(h.status).toHaveBeenCalledWith('account:fixture','free');
});
it('fails closed without exposing subscription diagnostics',async()=>{
 h.resolve.mockRejectedValue(Error('secret database diagnostic'));const r=await GET();expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('secret');
});
