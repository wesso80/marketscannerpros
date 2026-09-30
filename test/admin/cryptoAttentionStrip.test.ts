import {it,expect} from 'vitest';
import {scanDecision} from '@/components/admin/CryptoAttentionStrip';
const now=Date.UTC(2026,8,29,9,10),F=4*3600000;
const scan={startedAt:new Date(Math.floor(now/F)*F+60000).toISOString(),rows:[
 {id:'tosh',symbol:'TOSH',stage:'MOMENTUM_VOLUME',kind:'CONTINUATION',close:1,entryFloor:0.9,maxEntry:1.2,reason:'in zone'},
 {id:'axs',symbol:'AXS',stage:'MOMENTUM_VOLUME',kind:'CONTINUATION',close:5,entryFloor:4,maxEntry:4.5,reason:'chased'},
 {id:'mew',symbol:'MEW',stage:'EXTENDED',reason:'Price and volume advanced, but the completed move exceeds the ATR chase limits'},
 {id:'btc',symbol:'BTC',stage:'NO_SIGNAL',reason:'No qualifying setup'},
]};
const paper=(healthy=true,extra:Record<string,unknown>={})=>({
 portfolio:{status:'ACTIVE',unrealisedPnl:-1145},positions:[1,2],
 journal:[{title:'Crypto paper cycle completed',createdAt:new Date(now-5*60000).toISOString(),evidence:[JSON.stringify({monitorHealthy:healthy,decisions:[],clusters:[{coins:['a','b'],overCap:false,riskUsd:100,capUsd:500}],...extra})]}],
});
it('lists saved closes inside the entry zone and leaves no-signal coins out',()=>{
 const d=scanDecision(paper(),scan,now);
 expect(d.stale).toBe(false);
 expect(d.inZone).toEqual([{symbol:'TOSH',kind:'CONTINUATION'}]);
 expect(d.blocked.map(b=>b.symbol)).toEqual(['AXS','MEW']);
 expect(d.blocked.find(b=>b.symbol==='AXS')?.reason).toBe('Outside the entry zone');
 expect(d.blocked.find(b=>b.symbol==='MEW')?.reason).toContain('chase');
});
it('uses one reason from the last cycle when a coin was blocked',()=>{
 const d=scanDecision(paper(true,{decisions:[{coin:'tosh',status:'BLOCKED',reason:'Correlated cluster risk cap',ask:1}]}),scan,now);
 expect(d.inZone.map(c=>c.symbol)).not.toContain('TOSH');
 expect(d.blocked.filter(b=>b.symbol==='tosh')).toEqual([{symbol:'tosh',reason:'Correlated cluster risk cap'}]);
});
it('reads book health from the saved ledger and the last cycle',()=>{
 const healthy=scanDecision(paper(),scan,now);
 expect(healthy.health).toMatchObject({positions:2,openPnl:-1145,cluster:'INSIDE CAP',exits:'HEALTHY'});
 const over=scanDecision(paper(false,{clusters:[{coins:['ASTER','SYRUP'],overCap:true,riskUsd:3263,capUsd:1508}]}),scan,now);
 expect(over.health.cluster).toBe('OVER CAP');
 expect(over.health.clusterDetail).toContain('ASTER');
 expect(over.health.exits).toBe('UNHEALTHY');
 expect(scanDecision(null,null,now).health).toMatchObject({positions:null,cluster:'NOT RECORDED',exits:'UNKNOWN'});
});
it('marks an old scan window stale and an overdue monitor unhealthy',()=>{
 const old={...scan,startedAt:new Date(Math.floor(now/F)*F-F).toISOString()};
 const late=paper();late.journal[0].createdAt=new Date(now-40*60000).toISOString();
 const d=scanDecision(late,old,now);
 expect(d.stale).toBe(true);
 expect(d.health.exits).toBe('UNHEALTHY');
});
