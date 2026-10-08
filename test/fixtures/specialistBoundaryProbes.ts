import {PRIVATE_MARKER as secret} from '../support/specialistPublicContract';
const observation={value:0,source:'Synthetic venue',asOf:'2026-10-06T20:00:00Z',basis:'Observed, not fetched',status:'Last close'};
/** Partial provider/model boundary probes; not complete DVE/Breakdown domain inputs. */
export function specialistBoundaryProbes(){return {
 dve:{symbol:'AAPL',price:100,computedAt:'2026-10-07T12:00:00Z',dataAsOf:observation.asOf,
  volatility:{bbwp:50,bbwpBasis:{available:false,window:20,lookback:0,fullYear:false},regimeConfidence:99},
  direction:{score:88,confidence:99,bias:secret},projection:{expectedMovePct:12,projectionQualityScore:99},
  dataQuality:{score:99,missing:['Insufficient history'],warnings:[]},summary:secret},
 crypto:{symbol:'ETH',coinId:'ethereum',identity:{verified:true,okx:{bound:true,instrument:'ETH-USDT-SWAP'}},
  sections:{derivatives:{metrics:[{...observation,label:'Open interest (USD)'},{...observation,value:null,label:'Open interest change, 7d',reason:'Insufficient history'}]},ruleCheck:{stage:secret}},
  top:{rule:{verdict:secret},chart:{ruleStop:90}},budget:{breakdownToday:100,appToday:200,reason:secret}},
 news:{symbol:'AAPL',provider:'Synthetic news',fetchedAt:'2026-10-07T12:00:00Z',
  events:[{headline:'Synthetic event',firstPublishedAt:observation.asOf,maxRelevance:0.99}],
  articles:[{title:'Synthetic article',url:'https://example.invalid/article',publishedAt:observation.asOf,sentimentScore:0.9,summary:secret}]},
 fundamentals:{symbol:'AAPL',latestQuarter:'2026-06-30',revenue:0,profitMargin:null,priceAsOf:observation.asOf,
  analystTargetPrice:999,analystRatings:{strongBuy:10},multiple:{explanation:secret}},
};}
export const specialistEdgeCases = {
 zeroOi:{current:0,baseline:100,expectedChangePct:-100},
 zeroBaseline:{current:100,baseline:0,expectedChangePct:null},
 missingOi:{current:null,baseline:100,expectedChangePct:null},
 funding:{observedAt:'2026-10-06T07:55:00Z',settlementAt:'2026-10-06T08:00:00Z',nextSettlementAt:'2026-10-06T16:00:00Z'},
 insufficientHistory:{hours:25,requestedHours:168,expectedChangePct:null},
 identityCollision:{symbol:'ABC',requestedCoinId:'synthetic-abc-one',venueCoinId:'synthetic-abc-two',bound:false},
} as const;
