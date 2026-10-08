import { beforeEach,it,expect,vi } from 'vitest';
const h=vi.hoisted(()=>({q:vi.fn(),operator:false}));
vi.mock('@/lib/db',()=>({q:h.q,tx:vi.fn()}));
vi.mock('@/lib/quant/operatorAuth',()=>({isOperator:()=>h.operator}));
vi.mock('@/lib/coingecko',()=>({COINGECKO_ID_MAP:{BTC:'bitcoin',XBT:'bitcoin'}}));
import { resolvePublicQuotaAccess, publicInstrumentKey } from '@/lib/publicQuotaAccess';
const session={cid:'fixture',workspaceId:'fixture',tier:'pro',exp:9999999999};
beforeEach(()=>{h.q.mockReset();h.operator=false;});
it('does not trust a paid cookie without an active subscription',async()=>{
 h.q.mockResolvedValue([]);expect(await resolvePublicQuotaAccess(session)).toMatchObject({plan:'free'});
 h.q.mockRejectedValue(Error('offline'));await expect(resolvePublicQuotaAccess(session)).rejects.toThrow('offline');
});
it('recognizes verified active and unexpired trial access, including cancellation at period end',async()=>{
 h.q.mockResolvedValue([{tier:'pro',status:'active',current_period_end:null}]);expect(await resolvePublicQuotaAccess(session)).toMatchObject({plan:'pro'});
 h.q.mockResolvedValue([{tier:'pro',status:'trialing',current_period_end:new Date(Date.now()+60000)}]);expect(await resolvePublicQuotaAccess(session)).toMatchObject({plan:'pro'});
 h.q.mockResolvedValue([{tier:'pro',status:'trialing',current_period_end:new Date(0)}]);expect(await resolvePublicQuotaAccess(session)).toMatchObject({plan:'free'});
});
it('retains signed admin and operator bypass without quota/subscription reads',async()=>{
 expect(await resolvePublicQuotaAccess({...session,is_admin:true})).toEqual({bypass:true});h.operator=true;
 expect(await resolvePublicQuotaAccess(session)).toEqual({bypass:true});expect(h.q).not.toHaveBeenCalled();
});
it('binds mapped crypto aliases to one identity and rejects unmapped types',()=>{
 expect(publicInstrumentKey('BTC','crypto')).toBe(publicInstrumentKey('XBT','crypto'));
 expect(publicInstrumentKey('BTC','equity')).not.toBe(publicInstrumentKey('BTC','crypto'));
 expect(()=>publicInstrumentKey('UNKNOWN','crypto')).toThrow();expect(()=>publicInstrumentKey('EURUSD','forex')).toThrow();
});
