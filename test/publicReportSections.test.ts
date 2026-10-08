import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const h=vi.hoisted(()=>({actor:null as any,unlocked:false,fetch:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>null}));
vi.mock('@/lib/proTraderAccess',()=>({hasPaidSessionAccess:()=>false}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>true,resolvePublicActor:async()=>h.actor,publicInstrumentKey:(s:string)=>'equity:'+s,publicQuota:{isUnlocked:async()=>h.unlocked}}));
vi.mock('@/lib/rateLimit',()=>({apiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
vi.mock('@/lib/coingecko',()=>({COINGECKO_ID_MAP:{BTC:'bitcoin'}}));
vi.mock('@/lib/goldenEggFetchers',()=>({fetchPrice:h.fetch}));
import {GET} from '@/app/api/symbol-comparison/route';
const call=()=>GET(new NextRequest('http://localhost/api/symbol-comparison?symbol=AAPL&type=equity'));
beforeEach(()=>{h.actor=null;h.unlocked=false;h.fetch.mockReset().mockResolvedValue(null);});
it('withholds chart providers until a signed visitor report has been unlocked',async()=>{
 expect((await call()).status).toBe(401);h.actor={bypass:false,subject:'visitor:fixture',plan:'visitor'};
 expect((await call()).status).toBe(403);expect(h.fetch).not.toHaveBeenCalled();
 h.unlocked=true;const response=await call();expect(response.status).toBe(200);expect(h.fetch).toHaveBeenCalledTimes(3);expect(response.headers.get('cache-control')).toBe('private, no-store');
});
