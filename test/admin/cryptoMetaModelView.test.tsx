// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import CryptoMetaModel from '@/components/admin/CryptoMetaModel';
const m=(over={})=>({n:500,positives:220,baseRate:.44,brier:.24,brierClimatology:.247,brierSkill:.028,logLoss:.67,auc:.58,...over});
const cal=Array.from({length:10},(_,k)=>({from:k/10,to:(k+1)/10,n:k===4?100:0,meanPredicted:k===4?.45:null,observed:k===4?.43:null,avgR:k===4?-.05:null}));
const view={config:{version:'meta-v1',target:'Fixed 2R plan ends with net R > 0',embargoDays:7,holdoutDays:91,foldDays:91,minTrain:300,gbt:{trees:120,depth:3,rate:.05,minLeaf:30},featuresVersion:'signal-features-v1',live:{perRun:4,lookbackHours:48}},
 model:{modelId:'x',trainedAt:'2026-10-07T00:00:00Z',datasetRunId:'2026-10-06T00:00:00Z',version:'meta-v1',report:{dev:{from:'2022-01-01T04:00:00Z',to:'2026-07-01T00:00:00Z',rows:4000},postHoldoutRows:0,
  folds:[{testFrom:'2023-01-01T00:00:00Z',testTo:'2023-04-02T00:00:00Z',train:600,test:200,trainBase:.45,metrics:{logistic:m(),gbt:m()}}],oof:{logistic:m(),gbt:m({brierSkill:-.01}),climatologyBase:.45},calibration:{logistic:cal,gbt:cal},
  holdout:{from:'2026-07-08T00:00:00Z',to:'2026-10-07T00:00:00Z',train:3900,rows:300,metrics:{logistic:m(),gbt:m()},calibration:{logistic:cal,gbt:cal}},importance:[{feature:'rsi14_4h',gbtGain:.31,lrCoef:.12}],holdoutLooks:5,labelled:4300,datasetRunId:'r'}},
 holdoutLock:{from:'2026-07-08T00:00:00Z',to:'2026-10-07T00:00:00Z',lockedAt:'2026-10-07T00:00:00Z',looks:5},
 live:{scored:3,unavailable:1,recent:[{signal_id:'a',coin:'solana',signal_at:'2026-10-07T04:00:00Z',scored_at:'2026-10-07T04:20:00Z',status:'SCORED',reason:null,probs:{logistic:.52,gbt:.48,stage:'MOMENTUM_VOLUME'},decision:'SKIPPED',outcome_r:null,ledger_status:'PENDING'},
  {signal_id:'b',coin:'okb',signal_at:'2026-10-07T04:00:00Z',scored_at:'2026-10-07T04:20:00Z',status:'UNAVAILABLE',reason:'Not a Coinbase USD signal; the model was trained on Coinbase candles only',probs:null,decision:'TAKEN',outcome_r:null,ledger_status:'LINKED'}]}};
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>structuredClone(view)})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('labels the model as shadow / log only, warns on repeated holdout looks, and lists live scores with unavailable reasons',async()=>{
 render(<CryptoMetaModel/>);
 expect(await screen.findByText(/Holdout locked/)).toBeTruthy();
 expect(screen.getByRole('heading',{name:/Shadow model · SIMULATED · LOG ONLY/})).toBeTruthy();
 expect(screen.getByText(/never change an entry, a size or an exit/)).toBeTruthy();
 expect(screen.getByText(/repeated looks: treat holdout results as optimistic/)).toBeTruthy();
 expect(screen.getByText(/Not a Coinbase USD signal/)).toBeTruthy();
 expect(screen.getByText('See paper ledger')).toBeTruthy();expect(screen.getByText('Pending')).toBeTruthy();
});
