import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.hoisted(()=>{process.env.ALPHA_VANTAGE_API_KEY='mock-only';});
vi.mock('@/lib/db',()=>({q:vi.fn()}));
vi.mock('@/lib/options/chainCache',async()=>({defaultChainProviders:()=>['REALTIME_OPTIONS'],fetchSharedOptionsChain:vi.fn(async()=>{const {mockChain}=await import('./fixtures/confluenceDemotion');return mockChain();})}));
import {confluenceLearningAgent as agent} from '@/lib/confluence-learning-agent';
import {optionsAnalyzer,calculateCompositeScore} from '@/lib/options-confluence-analyzer';
import {makeScanFixture,NOW,varyCalendar,decisions} from './fixtures/confluenceDemotion';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(NOW));vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Unexpected network request');}));});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
it('calendar changes display facts but no option decision fields',async()=>{
 const scan=await makeScanFixture();const low=varyCalendar(scan,false),high=varyCalendar(scan,true);
 vi.spyOn((optionsAnalyzer as any).confluenceAgent,'scanHierarchical').mockResolvedValueOnce(low).mockResolvedValueOnce(high);
 const a=await optionsAnalyzer.analyzeForOptions('AAPL','intraday_1h','2026-10-09');
 const b=await optionsAnalyzer.analyzeForOptions('AAPL','intraday_1h','2026-10-09');
 expect(a.candleCloseConfluence).not.toEqual(b.candleCloseConfluence);
 expect(a.aiMarketState?.edges.timeEdge).not.toEqual(b.aiMarketState?.edges.timeEdge);
 expect(decisions(a)).toEqual(decisions(b));
});
it('calendar does not contribute to composite confidence',async()=>{
 const scan=await makeScanFixture();scan.decompression.netPullDirection='bullish';scan.scoreBreakdown.directionScore=80;
 const score=(high:boolean)=>calculateCompositeScore(varyCalendar(scan,high),{pcRatio:.5,sentiment:'bullish'} as any,null,null,null,{maxPain:107,currentPrice:100},2,{hasMeaningfulOI:true});
 expect(score(false).confidence).toBe(score(true).confidence);
});
it('agent confidence has no candle-rating boost on identical bars',async()=>{
 const scan=await makeScanFixture();vi.spyOn(agent,'calculateCandleCloseConfluence').mockReturnValueOnce(varyCalendar(scan,false).candleCloseConfluence).mockReturnValueOnce(varyCalendar(scan,true).candleCloseConfluence);
 const a=await agent.scanHierarchical('AAPL','intraday_1h','regular','equity');const b=await agent.scanHierarchical('AAPL','intraday_1h','regular','equity');
 expect(a.candleCloseConfluence.confluenceScore).not.toBe(b.candleCloseConfluence.confluenceScore);expect(a.prediction.confidence).toBe(b.prediction.confidence);
});
