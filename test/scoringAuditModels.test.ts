import {afterEach, describe, expect, it, vi} from 'vitest';
import {detectPreMove} from '@/lib/jarvis/radar/premove';
import type {Features} from '@/lib/jarvis/radar/types';
import {computeLiquidityTransmission, type LiquidityTransmissionInput} from '@/lib/intelligence/engines/liquidityTransmission';
import {computeFragility} from '@/lib/intelligence/engines/fragility';
import {scoreOptionCandidatesV21WithDiagnostics} from '@/lib/scoring/options-v21';
import {scoreProSnapshot} from '@/lib/scanner/proScore';
import {evaluateDataTrust} from '@/lib/scanner/dataTrust';
import {computeTechnicalProxy} from '@/lib/scanner/technicalProxy';

afterEach(() => vi.useRealTimers());
const radar = {
  symbol:'SYNTHETIC',price:100,now:{bbWidthPctile:5,ema20:99.5,ema50:99,aboveE50:true,aboveE200:true,atHi20:false,atHi50:false,atr14:2,hi20:101,lo20:95},
  moveAtr:.2,atrExpansion:.7,consolidationTight:true,range20VsAtr:3,squeeze:true,accumRatio:1.5,rsBenchDelta:5,rsBench20:3,rsBench5:3,benchmark:'SPY',
  adx:22,adxPrev5:17,flags:['NEW_TREND_RECLAIM'],distToHi20Pct:-1,distToHi50Pct:-1,rsi:55,rsiPrev5:50,macdHist:.2,macdHistPrev:.1,ret5:2,ret20:3,ret1:.5,
  sectorEtf:'XLK',earningsInDays:null,extensionAtr:.2,ret5Atr:1,dollarVol20:1e8,rsSector5:2,dataQuality:{fresh:true,ohlc:'full'},
} as unknown as Features;
const ctx = {sectorStrengthening:new Set(['XLK']),categoryStrengthening:new Set<string>(),crcsDelta:()=>6};

describe('cross-page scoring audit regressions',()=>{
  it('makes a 30-point extension penalty effective even on the strongest Radar fixture',()=>{
    const base=detectPreMove(radar,ctx), late=detectPreMove({...radar,extensionAtr:3.1},ctx);
    expect(base.baseScore).toBeLessThanOrEqual(100);
    expect(base.score-late.score).toBe(30);
    expect(Object.values(base.componentPoints!).reduce((a,b)=>a+b,0)).toBeCloseTo(base.baseScore!,10);
  });
  it('penalizes missing volume and crowded funding numerically',()=>{
    expect(detectPreMove({...radar,accumRatio:null},ctx).score).toBeLessThan(detectPreMove(radar,ctx).score);
    const crypto={categories:[],volume24h:1e8,fundingMedianPct:.04,oiChangePct:null} as NonNullable<Features['crypto']>;
    const mild=detectPreMove({...radar,crypto},ctx),crowded=detectPreMove({...radar,crypto:{...crypto,fundingMedianPct:.08}},ctx);
    expect(mild.score-crowded.score).toBe(10);
    expect(detectPreMove({...radar,dataQuality:{...radar.dataQuality,fresh:false}},ctx).score).toBe(0);
  });
  it('gives zero evidence quality to the audit fixture with stale liquidity inputs',()=>{
    const input:any={m2:{globalM2USD:1e14,oneMonthPct:null,oneMonthPctPrev:null,threeMonthAnnPct:null,threeMonthAnnPctPrev:null,yoyPct:null,validBlocCount:11,missingBlocs:[],stale:true,interpretationEligible:false,status:'STALE'}};
    for(const k of ['dxy','copper','eem','vgk','hyg','lqd','gold','silver','vix','spx','ndx','btc','eth','total2']) input[k]={m1:null,r20:1,r5:null,stale:true};
    const out=computeLiquidityTransmission(input as LiquidityTransmissionInput);
    expect(out.presenceCoverage).toBe(100);expect(out.confidence).toBe(0);
  });
  it('does not convert empty or single-series Fragility inputs into high confidence',()=>{
    const empty={series:{},dataAsOf:'2026-09-22T00:00:00Z',providersUsed:[],sourceStatus:'DATA_UNAVAILABLE' as const};
    expect(computeFragility(empty,undefined,'2026-09-22T06:00:00Z').confidence).toBe(0);
    const bars=Array.from({length:240},(_,i)=>({date:new Date(Date.UTC(2026,0,1)+i*86400000).toISOString().slice(0,10),close:100,high:101}));
    const partial=computeFragility({...empty,series:{SPY:bars},sourceStatus:'PARTIAL'},undefined,'2026-09-22T06:00:00Z');
    expect(partial.confidence).toBeLessThanOrEqual(partial.inputCoverage!);expect(partial.confidence).toBeLessThan(5);
  });
  it('reconciles all options contributions to the headline for allowed and blocked candidates',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T15:00:00Z'));
    const input={symbol:'SYNTHETIC',timeframe:'swing',spot:100,expectedMovePct:5,ivRank:50,marketDirection:'bullish' as const,marketRegimeAlignment:.8,tfConfluenceScore:80,staleSeconds:0,freshness:'REALTIME' as const,macroRisk:.8,timePermission:'ALLOW' as const,timeQuality:80,marketSession:'regular' as const,
      optionsRows:[{expiration:'2026-10-23',strike:100,type:'call',bid:2,ask:2.02,mark:2.01,delta:.6,open_interest:1000,volume:100},{expiration:'2026-10-23',strike:105,type:'call',bid:1,ask:1.02,mark:1.01,delta:.3,open_interest:1000,volume:100}]};
    for (const timePermission of ['ALLOW','BLOCK'] as const) {
      const {candidates}=scoreOptionCandidatesV21WithDiagnostics({...input,timePermission});
      expect(candidates.length).toBeGreaterThan(0);
      for(const p of candidates){expect(p.contrib).toHaveLength(15);expect(Math.round(p.contrib.reduce((s,c)=>s+c.points,0))).toBe(p.scores.confidence);}
    }
  });
  it('holds a Pro snapshot with missing ATR at WATCH (no risk geometry) without penalising its score',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T15:00:00Z'));
    const pick={indicators:{price:110,ema200:100,rsi:65,adx:30,macd:1,macdSignal:0,mfi:70,volume:1e6,squeeze:false,rsIndexRatio:1.1},dataBasis:{lastCompletedBarAt:'2026-09-21',barInterval:'1d',historyBars:250}};
    const score=scoreProSnapshot(pick,'equity','1d');
    expect(score.compositeV2.direction).toBe('bullish');expect(score.compositeV2.permission).toBe('WATCH');
    expect(score.compositeV2.blockReasons).toEqual([]);
    expect(score.compositeV2.watchReasons.map(r=>r.code)).toContain('INSUFFICIENT_DATA');
    expect(score.compositeV2.missingInputs).toContain('ATR');
    const withAtr=scoreProSnapshot({...pick,indicators:{...pick.indicators,atr:2}},'equity','1d');
    expect(score.compositeV2.composite).toBe(withAtr.compositeV2.composite);
  });
  it('rejects future data times and ages intraday bars within the same session',()=>{
    const nowMs=Date.parse('2026-09-22T19:00:00Z');
    expect(evaluateDataTrust({assetClass:'crypto',timeframe:'1d',price:100,lastBarAt:'2026-09-23',nowMs}).freshness).toBe('unknown');
    expect(evaluateDataTrust({assetClass:'equity',timeframe:'15m',price:100,lastBarAt:'2026-09-22T14:00:00Z',nowMs}).freshness).toBe('stale');
  });
  it('preserves the version and signed scale of the historical technical proxy',()=>{
    const p=computeTechnicalProxy(110,100,60,2,1,1,2,30,60,90,10,120,110,100);
    expect(p.version).toBe('msp.technical-proxy.v1');expect(p.direction).toBe('bullish');expect(p.score).toBe(90);
  });
});
