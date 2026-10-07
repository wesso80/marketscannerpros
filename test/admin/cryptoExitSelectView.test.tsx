// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import CryptoExitSelect from '@/components/admin/CryptoExitSelect';
const st=(meanR:number,d:number|null=null,t:number|null=null)=>({n:400,meanR,totalR:meanR*400,winRate:.45,vsFixed:{meanDiff:d,se:d==null?null:.05,t}});
const summary={strategies:{'fixed-2r':st(.05),'static-best':st(.07,.02,.4),model:st(.09,.04,.8),oracle:st(1.1,1.05,30)},plans:{'fixed-2r':st(.05),'trail-only-v4':st(.07,.02,.4)},modelChoices:{'fixed-2r':250,'trail-only-v4':150}};
const view={config:{version:'exit-select-v1',plans:['fixed-2r','trail-only-v4'],embargoDays:7,foldDays:91,minTrain:300,holdoutDays:91,featuresVersion:'signal-features-v1',gbt:{trees:50,depth:2,minLeaf:50}},
 model:{modelId:'m',trainedAt:'2026-10-07T00:00:00Z',version:'exit-select-v1',report:{dev:{rows:4000},postHoldoutRows:0,folds:[{testFrom:'2023-01-01T00:00:00Z',testTo:'2023-04-02T00:00:00Z',train:600,test:200,staticBest:'trail-only-v4',meanR:{fixed:.05,staticBest:.07,model:.09}}],
  walkForward:summary,holdout:{from:'2026-07-08T00:00:00Z',to:'2026-10-07T00:00:00Z',train:3900,rows:300,staticBest:'trail-only-v4',summary},importance:[{plan:'fixed-2r',top:[{feature:'adx14_4h',share:.4}]}],holdoutLooks:1,labelled:4300,incomplete:120,datasetRunId:'2026-10-06T00:00:00Z'}},
 holdoutLock:{from:'2026-07-08T00:00:00Z',to:'2026-10-07T00:00:00Z',lockedAt:'2026-10-07T00:00:00Z',looks:1},
 live:{recent:[{signalId:'a',coin:'solana',signalAt:'2026-10-07T04:00:00Z',plan:'trail-only-v4',expectedR:.12,decision:'TAKEN',fixedR:null,chosenR:null,resolved:false}],resolved:0,chosenMinusFixedR:null}};
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>structuredClone(view)})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('labels exit selection as log only, shows the baselines, the oracle bound, exclusions and live choices',async()=>{
 render(<CryptoExitSelect/>);
 expect(await screen.findByText(/120 excluded/)).toBeTruthy();
 expect(screen.getByRole('heading',{name:/Exit selection · SIMULATED · LOG ONLY/})).toBeTruthy();
 expect(screen.getByText(/every paper position keeps the live fixed 2R exits/)).toBeTruthy();
 expect(screen.getAllByText('Hindsight best (not achievable)').length).toBe(2);
 expect(screen.getAllByText('Best single plan (picked on training data)').length).toBe(2);
 expect(screen.getByText('See paper ledger')).toBeTruthy();expect(screen.getByText('No resolved choices yet.',{exact:false})).toBeTruthy();
});
