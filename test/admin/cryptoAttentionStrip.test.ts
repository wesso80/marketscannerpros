import {it,expect} from 'vitest';
import {attentionChips} from '@/components/admin/CryptoAttentionStrip';
const now=Date.UTC(2026,8,29,9,10),F=4*3600000;
const paper=(minutesAgo:number,healthy=true)=>({portfolio:{status:'ACTIVE',unrealisedPnl:1234},positions:[1,2],reconciliation:{status:'MATCHED',checkedAt:new Date(now).toISOString()},journal:[{title:'Crypto paper cycle completed',createdAt:new Date(now-minutesAgo*60000).toISOString(),evidence:[JSON.stringify({monitorHealthy:healthy})]}]});
const scan={startedAt:new Date(Math.floor(now/F)*F+60000).toISOString(),rows:[{stage:'MOMENTUM_VOLUME'},{stage:'NO_SIGNAL'},{stage:'MOMENTUM_VOLUME'}]};
const ops={operations:{state:{checkedAt:new Date(now-5*60000).toISOString(),healthy:true,issues:[]}}};
const by=(c:ReturnType<typeof attentionChips>,l:string)=>c.find(x=>x.label===l)!;
it('summarizes a healthy account from saved data with sources',()=>{
 const c=attentionChips(paper(5),scan,ops,now);
 expect(by(c,'Last cycle')).toMatchObject({value:'5 min ago',tone:'ok'});
 expect(by(c,'Exit monitoring')).toMatchObject({value:'HEALTHY',tone:'ok'});
 expect(by(c,'Open positions').value).toContain('2 ·');
 expect(by(c,'Confirmed 4h setups')).toMatchObject({value:'2'});
 expect(by(c,'Ledger check')).toMatchObject({value:'MATCHED',tone:'ok'});
 expect(by(c,'Ops health')).toMatchObject({value:'HEALTHY'});
});
it('flags overdue cycles, unhealthy monitoring, stale scans and missing data instead of showing them as current',()=>{
 const c=attentionChips(paper(40,false),{...scan,startedAt:new Date(Math.floor(now/F)*F-F).toISOString()},{},now);
 expect(by(c,'Last cycle')).toMatchObject({value:'OVERDUE',tone:'bad'});
 expect(by(c,'Exit monitoring')).toMatchObject({value:'UNHEALTHY — entries blocked',tone:'bad'});
 expect(by(c,'Confirmed 4h setups')).toMatchObject({value:'STALE SCAN',tone:'warn'});
 expect(by(c,'Ops health')).toMatchObject({value:'NOT CHECKED'});
 expect(by(attentionChips(null,null,null,now),'Paper account')).toMatchObject({value:'UNAVAILABLE',tone:'bad'});
});
