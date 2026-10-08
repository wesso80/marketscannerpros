import {issueSymbolEvidence,verifyPageEvidence} from '../../../lib/ai/publicCopilotEvidence';
import {validateCopilotAnswer} from '../../../lib/ai/publicCopilotPolicy';
export function successFixture(){
 const at='2026-10-07T20:00:00Z';
 const packet:any={contract:'public-symbol-v2',meta:{symbol:'AAPL',assetClass:'equity',price:123,asOfTs:at,timeframe:'daily'},priceEvidence:null,timingEvidence:null,optionsRequest:null,
 canonical:{symbol:'AAPL',assetClass:'equity',timeframe:'daily',barInterval:'daily',price:123,changePct:1.5,priceTs:at,lastCompletedBarAt:at,historyBars:300,source:'fixture',
 indicators:{rsi:55,adx:22,atr:2,atrPct:1.6,ema20:120,ema50:119,ema200:110,sma20:120,sma50:119,macdHist:0.2,macd:0.5,macdSignal:0.3,stochK:50,computedOn:'daily'},
 liquidity:{volume:1000000,avgVolume:900000,advUsd:110000000,volumeBasis:'fixture'},dataTrust:{level:'high',label:'Synthetic fixture',reasons:[],freshness:'fresh'},options:null,fundamentals:null,network:null,derivatives:null,crossMarket:{summary:'Not collected',items:[]}},
 layer2:{setup:{keyLevels:[]}},layer3:{structure:{trend:{closeVsSma50:'above',closeVsSma20:'above',lastBar:'up',basis:'Synthetic fixture'},volatility:{regime:'normal',atr:2,bbwp:0},liquidity:{}},momentum:{indicators:[]},options:null,timeConfluence:null}};
 const token=issueSymbolEvidence(packet,'fixture-account')!;
 const evidence=verifyPageEvidence(token,'fixture-account')!;
 const id=evidence.observations.find(o=>o.field==='symbol.canonical.price')!.id;
 const content=validateCopilotAnswer({statements:[{kind:'observation',text:'',evidenceIds:[id]},{kind:'explanation',text:'timing',evidenceIds:[]},{kind:'explanation',text:'advice',evidenceIds:[]}]},evidence)!;
 return {packet,token,content,evidence};
}
