import {it,expect,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {clusterAllowance,portfolioClusters,positionRiskUsd,correlationScale,instrumentPair,returnCorrelation,CORRELATION} from '@/lib/admin/cryptoCorrelation';
import {parseFourHour} from '@/lib/admin/cryptoVolumeMomentum';
import type {ExchangeBar} from '@/lib/admin/cryptoExchangeVolume';
const F=4*3600000,H=3600000,t0=Date.UTC(2026,8,20);
const walk=(seed:number,n=40)=>{let x=100,s=seed;return Array.from({length:n},(_,i)=>{s=(s*16807)%2147483647;x*=1+((s/2147483647)-.5)*.04;return {t:t0+(i+1)*F,o:x,h:x,l:x,c:x,v:1} as ExchangeBar;});};
const equity=200000,base=500,cap=equity*CORRELATION.clusterRiskPct/100;
it('caps the new trade so its correlated cluster stays within the portfolio cap, and blocks when the cluster is full',()=>{
 const corr={scale:.5,correlated:[{coin:'a'},{coin:'b'}],unavailable:[] as string[]};
 const opens=[{coin:'a',riskUsd:500},{coin:'b',riskUsd:500},{coin:'z',riskUsd:500}];
 const r=clusterAllowance(corr,opens,['a','b','z'],equity,base);
 expect(r).toMatchObject({members:['a','b'],clusterRiskUsd:1000,capUsd:cap,blocked:false});
 expect(r.scale).toBeCloseTo(Math.min(.5,(cap-1000)/base),6);
 expect(clusterAllowance(corr,[{coin:'a',riskUsd:800},{coin:'b',riskUsd:700}],['a','b'],equity,base)).toMatchObject({blocked:true,scale:0});
});
it('counts positions with missing history, or opened after the check, as part of the cluster (never guessed uncorrelated)',()=>{
 const r=clusterAllowance({scale:1,correlated:[],unavailable:['m']},[{coin:'m',riskUsd:400},{coin:'late',riskUsd:400},{coin:'x',riskUsd:400}],['m','x'],equity,base);
 expect(r.members.sort()).toEqual(['late','m']);expect(r.clusterRiskUsd).toBe(800);
});
it('rechecks ALL open positions each cycle: groups correlated ones, flags over-cap clusters, lists missing history separately',()=>{
 const a=walk(7),b=a.map(x=>({...x,c:x.c*2})),c=walk(99);
 const r=portfolioClusters([{coin:'a',bars:a,riskUsd:500},{coin:'b',bars:b,riskUsd:500},{coin:'c',bars:c,riskUsd:500},{coin:'d',bars:null,riskUsd:500}],equity);
 expect(r.clusters).toEqual([{coins:['a','b'],riskUsd:1000,capUsd:cap,overCap:1000>cap}]);
 expect(r.unavailable).toEqual(['d']);
});
it('risk to stop matches the portfolio risk-cap formula and is unbounded without a stop',()=>{
 expect(positionRiskUsd({instrumentType:'coinbase:X-USD',averageEntry:100,stopLoss:95,quantity:10,entryFee:.5})).toBeCloseTo((100-95*.9995)*10+.5+95*.9995*10*.0005,6);
 expect(positionRiskUsd({instrumentType:'coinbase:X-USD',averageEntry:100,stopLoss:null,quantity:10})).toBe(Infinity);
});
it('OKX pairs go through the same check: OKX 4h and Coinbase hourly candles align on close time',()=>{
 expect(instrumentPair('okx-usd-v1:GRASS-USDT')).toEqual({exchange:'okex',product:'GRASS-USDT',quote:'USDT',volumeUnit:'GRASS'});
 const now=t0+41*F+60000,end=Math.floor(now/F)*F,prices=Array.from({length:60},(_,i)=>100*(1+.03*Math.sin(i*1.3)));
 const okxRaw={code:'0',data:prices.map((p,i)=>[String(end-(60-i)*F),String(p),String(p),String(p),String(p),'1','1','1','1']).reverse()};
 const cbRaw=prices.flatMap((p,i)=>[1,2,3,4].map(h=>[(end-(60-i)*F+(h-1)*H)/1000,p,p,p,p,1])).reverse();
 const okx=parseFourHour({exchange:'okex',product:'GRASS-USDT',quote:'USDT',volumeUnit:'GRASS'},okxRaw,now),cb=parseFourHour({exchange:'gdax',product:'GRASS-USD',quote:'USD',volumeUnit:'GRASS'},cbRaw,now);
 expect(okx.at(-1)!.t).toBe(cb.at(-1)!.t);
 expect(returnCorrelation(okx,cb)!.rho).toBeCloseTo(1,6);
 // Missing history for an open position counts as correlated (documented rule).
 expect(correlationScale(okx,[{coin:'celo',bars:null}])).toMatchObject({unavailable:['celo'],scale:1/Math.sqrt(2)});
});
