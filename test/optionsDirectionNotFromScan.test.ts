import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.hoisted(()=>{process.env.ALPHA_VANTAGE_API_KEY='mock-only';});
vi.mock('@/lib/db',()=>({q:vi.fn()}));
vi.mock('@/lib/options/chainCache',async()=>({defaultChainProviders:()=>['REALTIME_OPTIONS'],fetchSharedOptionsChain:vi.fn(async()=>{const {mockChain}=await import('./fixtures/confluenceDemotion');return mockChain();})}));
import {resolveOptionsDirection,calculateCompositeScore,optionsAnalyzer} from '@/lib/options-confluence-analyzer';
import {makeScanFixture,NOW,decisions} from './fixtures/confluenceDemotion';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(NOW));vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Unexpected provider request');}));});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
it.each([
 [.5,100,93,2,true,'bullish'],[.5,null,93,2,true,'neutral'],[.5,100,107,2,true,'neutral'],[null,100,93,10,true,'neutral'],[.5,100,93,7,true,'neutral'],[.5,100,93,2,false,'neutral'],[1.3,100,107,2,true,'bearish'],
] as const)('direction uses agreeing chain evidence (%s/%s/%s/%s)',(pcRatio,maxPain,price,dte,maxPainReliable,expected)=>{
 const r=resolveOptionsDirection({pcRatio,maxPain,price,dte,hasMeaningfulOI:true,maxPainReliable});expect(r.direction).toBe(expected);expect(r.reason).not.toMatch(/TF|cluster|confluence|closing together/i);
 if(expected==='bullish')expect(r.score).toBeCloseTo(74.444,2);
});
it('scan direction and score cannot decide the composite; two agreeing components have full agreement',async()=>{
 const a=await makeScanFixture(),b=structuredClone(a);a.scoreBreakdown.directionScore=80;a.prediction.direction='bullish';b.scoreBreakdown.directionScore=-80;b.prediction.direction='bearish';
 const neutral=(s:any)=>calculateCompositeScore(s,{pcRatio:.85,sentiment:'neutral'} as any,null,null,null,undefined,2,{hasMeaningfulOI:true});
 expect(neutral(a).finalDirection).toBe('neutral');expect(neutral(b).directionScore).toBe(neutral(a).directionScore);
 const strong=calculateCompositeScore(a,{pcRatio:.5,sentiment:'bullish'} as any,null,null,null,{maxPain:100,currentPrice:93},2,{hasMeaningfulOI:true});expect(strong.confidence).toBe(100);expect(strong.alignedWeightPct).toBe(100);
});
it('flipping only the scan direction cannot change options direction, strikes or verdict',async()=>{
 const a=await makeScanFixture(),b=structuredClone(a);a.decompression.netPullDirection='bullish';a.prediction.direction='bullish';a.scoreBreakdown.directionScore=80;b.decompression.netPullDirection='bearish';b.prediction.direction='bearish';b.scoreBreakdown.directionScore=-80;
 vi.spyOn((optionsAnalyzer as any).confluenceAgent,'scanHierarchical').mockResolvedValueOnce(a).mockResolvedValueOnce(b);
 const x=await optionsAnalyzer.analyzeForOptions('AAPL','intraday_1h','2026-10-09');const y=await optionsAnalyzer.analyzeForOptions('AAPL','intraday_1h','2026-10-09');
 expect(decisions(x)).toEqual(decisions(y));expect(x.directionStatus).toBe('unknown');expect(x.tradeSnapshot?.verdict).toBe('WAIT');expect(x.primaryStrike).toBeNull();expect(x.primaryExpiration).toBeNull();
});
it('the Options view shows no direction at all (W3: chain evidence only)',()=>{expect(readFileSync('components/options-terminal/OptionsChainEvidence.tsx','utf8')).not.toMatch(/\.direction\b|directionStatus|Direction:/);});
