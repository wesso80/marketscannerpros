import {expect,it} from 'vitest';
import {paperEntryGate,type EntryGateInput} from '@/lib/admin/cryptoEntryGate';
import {parsePaperQuote,planCryptoPaper} from '@/lib/admin/cryptoPaperMarket';
import type {VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';

const now=Date.parse('2026-09-28T04:05:00Z');
const signal={stage:'MOMENTUM_VOLUME',asOf:'2026-09-28T04:00:00Z',stop:95,target:112,maxEntry:102,entryFloor:99} as VolumeMomentum;
const quote=parsePaperQuote({bid:'99.99',ask:'100',time:new Date(now).toISOString()},'SOL-USD',now);
const L={positions:20,lossFromStartPct:5,dailyEntries:30,riskPerTradePct:.25,openRiskPct:5};
const noCorr={scale:1,correlated:[],unavailable:[]} as EntryGateInput['corr'];
const base:EntryGateInput={coin:'solana',alreadyTraded:false,opens:[],checkedCoins:[],
 account:{equity:200000,cash:200000,startingBalance:200000,feesPct:.05,slippagePct:.05},dailyEntries:0,refusal:null,
 corr:noCorr,signal,quote,now,costRate:.0005,liquidityCapUsd:Infinity};

it('opens with exactly the plan planCryptoPaper gives', ()=>{
 const g=paperEntryGate(base,L);
 expect(g.ok).toBe(true);
 expect(g.ok&&g.plan).toEqual(planCryptoPaper(signal,quote,200000,200000,now,.0005,Infinity,1));
});

it.each<[string,Partial<EntryGateInput>,string]>([
 ['duplicate signal',{alreadyTraded:true},'Signal already traded'],
 ['open position',{opens:[{coin:'solana',riskUsd:100}]},'Position already open'],
 ['position cap',{opens:Array.from({length:20},(_,i)=>({coin:`c${i}`,riskUsd:1}))},'20-position cap'],
 ['cost settings',{account:{...base.account,feesPct:.1}},'Unexpected paper cost settings'],
 ['loss from start',{account:{...base.account,equity:189999}},'5% loss-from-start entry stop'],
 ['daily cap',{dailyEntries:30},'Daily 30-entry cap'],
 ['plan failure',{quote:{...quote,ask:103,bid:102.99}},'Current quote is outside the valid entry zone'],
 ['open risk cap',{opens:[{coin:'x',riskUsd:9990}],checkedCoins:['x']},'5% portfolio risk cap'],
])('blocks: %s',(_,patch,reason)=>{
 expect(paperEntryGate({...base,...patch},L)).toEqual({ok:false,reason});
});

it('checks in the live order (first failing reason wins)', ()=>{
 expect(paperEntryGate({...base,alreadyTraded:true,dailyEntries:99,opens:[{coin:'solana',riskUsd:1}]},L)).toEqual({ok:false,reason:'Signal already traded'});
 expect(paperEntryGate({...base,dailyEntries:99,account:{...base.account,equity:1}},L)).toEqual({ok:false,reason:'5% loss-from-start entry stop'});
});

it('cluster cap blocks and scales only research-sleeve entries (refusal set)', ()=>{
 // Cap is 0.75% of 200k = USD 1500; a normal trade risks USD 500.
 const corr={scale:1,correlated:[{coin:'eth',rho:.9}],unavailable:[]} as EntryGateInput['corr'];
 const full=[{coin:'eth',riskUsd:1500}];
 expect(paperEntryGate({...base,corr,opens:full,checkedCoins:['eth']},L).ok).toBe(true); // live sleeve: no cluster cap
 expect(paperEntryGate({...base,corr,opens:full,checkedCoins:['eth'],refusal:'BTC down'},L))
  .toEqual({ok:false,reason:'Correlated cluster risk cap: eth already risk USD 1500.00 of USD 1500.00'});
 const part=[{coin:'eth',riskUsd:1200}];
 const g=paperEntryGate({...base,corr,opens:part,checkedCoins:['eth'],refusal:'BTC down'},L);
 expect(g.ok&&g.cluster.scale).toBeCloseTo(.6);
 expect(g.ok&&g.plan).toEqual(planCryptoPaper(signal,quote,200000,200000,now,.0005,Infinity,.6));
 // Unchecked open coins count as cluster members (unverified correlation).
 expect(paperEntryGate({...base,corr:noCorr,opens:full,checkedCoins:[],refusal:'BTC down'},L).ok).toBe(false);
});
