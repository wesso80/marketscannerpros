import {it,expect} from 'vitest';
import {ownershipEvidence,cryptoBreakdownEvidence} from '@/lib/ai/ownershipCryptoEvidence';
it('projects ownership leaf fields without private additions, preserving filing dates and unavailable data',()=>{
 const hidden={privateScore:'PRIVATE_SENTINEL'};
 const result=ownershipEvidence({symbol:'AAPL',...hidden,insider:{status:'unavailable',reason:'No feed',...hidden},congress:{status:'ok',totalTrades:1,lastTradeDate:'2026-10-01',last12m:{buys:1,sells:0,other:0,...hidden},recent:[{date:'2026-10-01',filedDate:'2026-10-05',amountMin:0,amountMax:null,...hidden}]},institutional:{status:'ok',ownershipPct:0,topHolders:[{name:'Fixture',shares:0,changeShares:null,...hidden}],...hidden}} as any);
 expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
 expect(result.congress).toMatchObject({recent:[{date:'2026-10-01',filedDate:'2026-10-05',amountMin:0,amountMax:null}]});
 expect(result.insider).toEqual({status:'unavailable',reason:'No feed'});
});
const breakdown=()=>{
 const section={source:'fixture',asOf:'2026-10-08T00:00:00Z',basis:'venue observation',status:'Live',value:{metrics:[{label:'Open interest (USD)',value:0,privateScore:'PRIVATE_SENTINEL'},{label:'Funding, 8h-equivalent',value:null},{label:'Rule stop',value:999},{label:'New private metric',value:999}],notes:['PRIVATE_SENTINEL']}};
 return {symbol:'BTC',coinId:'bitcoin',identity:{coinId:'bitcoin',verified:true,source:'symbol map',okx:{bound:true,instrument:'BTC-USDT-SWAP'},yahoo:{bound:true}},sections:Object.fromEntries(['price','earlyContext','marketContext','derivatives','liquidity','supply','levels'].map(k=>[k,section])),top:{rule:{score:'PRIVATE_SENTINEL'}},budget:{private:'PRIVATE_SENTINEL'}} as any;
};
it('rejects unbound crypto identities and preserves zero versus missing without model fields',()=>{
 const b=breakdown();const result=cryptoBreakdownEvidence(b,'bitcoin')!;
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SENTINEL|999/);
 expect(result.sections.derivatives.metrics).toMatchObject([{label:'Open interest (USD)',value:0},{label:'Funding, 8h-equivalent',value:null}]);
 expect(cryptoBreakdownEvidence(b,'different-coin')).toBeNull();
 expect(cryptoBreakdownEvidence(b,undefined)).toBeNull();
 b.identity.verified=false;expect(cryptoBreakdownEvidence(b,'bitcoin')).toBeNull();
});
