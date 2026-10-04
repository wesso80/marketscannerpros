import {vi} from 'vitest';
import {confluenceLearningAgent as agent, type HierarchicalScanResult} from '@/lib/confluence-learning-agent';
export const NOW='2026-10-05T15:43:00Z';
export function syntheticBars(n=1000){return Array.from({length:n},(_,i)=>({time:Date.parse(NOW)-(n-i)*1800000,open:100,high:102,low:98,close:100,volume:1000}));}
export async function makeScanFixture(overrides:Partial<HierarchicalScanResult>={}){
 vi.spyOn(agent,'fetchHistoricalData').mockResolvedValue(syntheticBars());vi.spyOn(agent,'fetchLivePrice').mockResolvedValue(100);
 const scan=await agent.scanHierarchical('AAPL','intraday_1h','regular','equity');
 return Object.assign(scan,overrides);
}
export function varyCalendar(scan:HierarchicalScanResult,high:boolean){
 const copy=structuredClone(scan),c=copy.candleCloseConfluence;
 c.confluenceScore=high?100:5;c.confluenceRating=high?'extreme':'low';
 c.closingNow.count=high?6:0;c.closingNow.timeframes=high?['1h','2h','3h','4h','6h','8h']:[];
 c.specialEvents.isMonthEnd=high;return copy;
}
export function mockChain(){return {provider:'REALTIME_OPTIONS',payloadMeta:{},rows:[...Array.from({length:25},(_,i)=>90+i)].flatMap(strike=>['call','put'].map(type=>({contractID:`AAPL-${strike}-${type}`,symbol:'AAPL',expiration:'2026-10-09',strike:String(strike),type,bid:'2',ask:'2.1',last:'2.05',mark:'2.05',volume:'200',open_interest:type==='call'?'500':'250',implied_volatility:'.3',delta:type==='call'?'.5':'-.5',gamma:'.02',theta:'-.03',vega:'.1',rho:'.01',date:'2026-10-05'})))};}
export function decisions(r:any){return {direction:r.direction,tradeQuality:r.tradeQuality,optionsGrade:r.optionsGrade,composite:[r.compositeScore.finalDirection,r.compositeScore.directionScore,r.compositeScore.confidence,r.compositeScore.qualityScore],gate:r.aiMarketState?.tradeQualityGate,strategy:r.strategyRecommendation?.strategy,verdict:r.tradeSnapshot?.verdict,setupGrade:r.tradeSnapshot?.setupGrade,primaryStrike:r.primaryStrike,primaryExpiration:r.primaryExpiration,maxRiskPercent:r.maxRiskPercent,overallState:r.professionalTradeStack?.overallState,overallEdgeScore:r.professionalTradeStack?.overallEdgeScore,intent:r.institutionalIntent};}
