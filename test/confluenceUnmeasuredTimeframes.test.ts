import {measuredFixture} from './fixtures/confluenceDemotion';
import {afterEach, expect, it, vi} from 'vitest';
import {confluenceLearningAgent as agent} from '@/lib/confluence-learning-agent';
import {calculateTradeLevels, selectStrikesFromConfluence} from '@/lib/options-confluence-analyzer';
vi.mock('@/lib/db',()=>({q:vi.fn()}));
vi.mock('@/lib/coingecko',()=>({getOHLC:vi.fn(),getPriceBySymbol:vi.fn(),resolveSymbolToId:vi.fn(),COINGECKO_ID_MAP:{}}));
vi.mock('@/lib/avRateGovernor',()=>({avTakeToken:vi.fn()}));
const bars=(n=200)=>Array.from({length:n},(_,i)=>({time:Date.parse('2026-09-28T00:00:00Z')+i*1800000,open:100,high:101,low:99,close:100,volume:1000}));
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
it('does not treat an unmeasured 5m midpoint as downward pull two minutes before close',()=>{
 const r=agent.analyzeDecompressionPull(bars(2),100,Date.parse('2026-10-04T12:03:00Z'));
 expect(r.decompressions).toEqual([]);expect(r.activeCount).toBe(0);expect(r.netPullDirection).toBe('neutral');expect((r as any).unmeasuredTFs).toContain('5m');
});
it.each(['2026-10-04T16:00:00Z','2026-10-05T18:30:00Z'])('counts only measurable equity rows at %s',async(now)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(now));vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Unexpected provider request');}));
 vi.spyOn(agent,'fetchHistoricalData').mockResolvedValue(bars());vi.spyOn(agent,'fetchLivePrice').mockResolvedValue(100.5);
 const r=await agent.scanHierarchical('AAPL','intraday_1h','regular','equity');
 expect((r.decompression as any).unmeasuredTFs).toEqual(expect.arrayContaining(['5m','10m','15m','30m']));
 expect(r.mid50Levels.every(x=>x.level>0&&!['5m','10m','15m','30m'].includes(x.tf))).toBe(true);
 expect(r.clusters.every(x=>x.avgLevel>0)).toBe(true);
 expect(r.decompression.activeCount).toBe(r.decompression.decompressions.filter(x=>x.isDecompressing&&x.mid50Level>0).length);
});
it.each(['crypto','equity'] as const)('short %s history cannot create active levels',async(type)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T16:00:00Z'));vi.spyOn(agent,'fetchHistoricalData').mockResolvedValue(bars(2));vi.spyOn(agent,'fetchLivePrice').mockResolvedValue(101);
 const r=await agent.scanHierarchical(type==='crypto'?'BTC':'AAPL','intraday_1h','regular',type);
 expect(r.mid50Levels).toEqual([]);expect(r.clusters).toEqual([]);expect(r.decompression.activeCount).toBe(0);expect(r.decompression.clusteredCount).toBe(0);expect(r.decompression.pullBias).toBe(0);expect(r.decompression.netPullDirection).toBe('neutral');
 const sibling=agent.analyzeDecompressionPull(bars(90),101,Date.now(),type);
 expect((sibling as any).unmeasuredTFs).toContain('1D');
});

it('keeps existing measured strike and trade levels unchanged',()=>{
 const r=calculateTradeLevels(measuredFixture(),'bullish',null);
 expect(r?.stopLoss).toBeCloseTo(97.4);expect(selectStrikesFromConfluence(measuredFixture(),true,[95,100,105,110],.25)[0].strike).toBe(100);
});
it('uses measured ATR fallback when an opposing midpoint is zero',()=>{
 const fixture=measuredFixture();fixture.mid50Levels=[{tf:'5m',level:0},{tf:'1H',level:104}];
 expect(calculateTradeLevels(fixture,'bullish',null)?.stopLoss).toBeGreaterThan(0);
});
