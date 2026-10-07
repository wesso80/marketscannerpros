import {planCryptoPaper,type CryptoPaperQuote} from './cryptoPaperMarket';
import {clusterAllowance,correlationScale} from './cryptoCorrelation';
import type {VolumeMomentum} from './cryptoVolumeMomentum';

/**
 * The paper account's account-level entry checks, as one pure function shared by the live cycle (inside its
 * portfolio lock) and the history replay. Order and reason strings are the live ledger's; changing either changes
 * live behaviour and the replay together. No I/O: callers read the account, open positions and counts first.
 */
/** Live paper limits (moved here from cryptoPaper so pure research code can share them without the live engine). */
export const CRYPTO_PAPER_LIMITS={riskPerTradePct:.25,notionalPct:10,maxPairVolumePct:1,maxVolumeAgeHours:6,positions:20,openRiskPct:5,dailyEntries:30,cycleEntries:4,cycleValidations:8,lossFromStartPct:5};
export type EntryGateLimits={positions:number;lossFromStartPct:number;dailyEntries:number;riskPerTradePct:number;openRiskPct:number};
export type EntryGateInput={
 coin:string;alreadyTraded:boolean;
 opens:{coin:string;riskUsd:number}[];
 /** Coins whose 4h history was checked for correlation (the rest count as unverified). */
 checkedCoins:string[];
 account:{equity:number;cash:number;startingBalance:number;feesPct:number;slippagePct:number};
 dailyEntries:number;
 /** Non-null: research-sleeve entry under beta limits (cluster cap and correlation scaling apply). */
 refusal:string|null;
 corr:ReturnType<typeof correlationScale>;
 signal:VolumeMomentum;quote:CryptoPaperQuote;now:number;costRate:number;liquidityCapUsd:number;
};
export type EntryGateResult={ok:true;plan:Extract<ReturnType<typeof planCryptoPaper>,{ok:true}>;cluster:ReturnType<typeof clusterAllowance>}|{ok:false;reason:string};
export function paperEntryGate(x:EntryGateInput,L:EntryGateLimits):EntryGateResult{
 const fail=(reason:string)=>({ok:false as const,reason});
 if(x.alreadyTraded)return fail('Signal already traded');
 if(x.opens.some(p=>p.coin===x.coin))return fail('Position already open');
 if(x.opens.length>=L.positions)return fail(`${L.positions}-position cap`);
 if(x.account.feesPct!==.05||x.account.slippagePct!==.05)return fail('Unexpected paper cost settings');
 if(x.account.equity<x.account.startingBalance*(1-L.lossFromStartPct/100))return fail(`${L.lossFromStartPct}% loss-from-start entry stop`);
 if(x.dailyEntries>=L.dailyEntries)return fail(`Daily ${L.dailyEntries}-entry cap`);
 // Portfolio-level cap on the candidate's correlated cluster (existing positions are only counted, never resized).
 const cluster=clusterAllowance(x.corr,x.opens,x.checkedCoins,x.account.equity,x.account.equity*L.riskPerTradePct/100);
 if(x.refusal&&cluster.blocked)return fail(`Correlated cluster risk cap: ${cluster.members.join(', ')} already risk USD ${cluster.clusterRiskUsd.toFixed(2)} of USD ${cluster.capUsd.toFixed(2)}`);
 const plan=planCryptoPaper(x.signal,x.quote,x.account.equity,x.account.cash,x.now,x.costRate,x.liquidityCapUsd,x.refusal?cluster.scale:1);
 if(!plan.ok)return fail(plan.reason);
 if(x.opens.reduce((s,p)=>s+p.riskUsd,0)+plan.risk>x.account.equity*L.openRiskPct/100)return fail(`${L.openRiskPct}% portfolio risk cap`);
 return {ok:true,plan,cluster};
}
