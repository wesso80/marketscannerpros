// @vitest-environment jsdom
import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({q:vi.fn(),detect:vi.fn()}));
vi.mock('@/lib/db',()=>({q:mocks.q}));
vi.mock('@/lib/outcomes/positionHorizonLabeller',()=>({detectPositionHorizons:mocks.detect,POSITION_MIGRATION_FILE:'migration105'}));
import {summarizeHorizon,loadPositionHorizonStats,HORIZON_METHOD_NOTE} from '@/lib/admin/positionHorizonStats';
import Component from '@/components/admin/PositionHorizonOutcomes';
beforeEach(()=>{mocks.q.mockReset();mocks.detect.mockReset().mockResolvedValue(['6w']);});
describe('long-horizon evidence denominators',()=>{
 it('does not turn many neutral labels into a sufficient directional sample',()=>{
  const result=summarizeHorizon({setup:null,measured:100,neutral:98,correct:2,wrong:0});
  expect(result).toMatchObject({measured:100,directionalCount:2,winRate:null});
 });
 it('gates each average on its own valid count instead of measured labels',()=>{
  const result=summarizeHorizon({setup:null,measured:100,return_count:1,mfe_count:10,mae_count:9,r_count:2,avg_signed_move:5,avg_mfe:8,avg_mae:-3,avg_r:4});
  expect(result).toMatchObject({returnCount:1,avgReturnPct:null,mfeCount:10,avgMfePct:8,maeCount:9,avgMaePct:null,rCount:2,avgR:null});
 });
 it('preserves zero averages with sufficient samples and rejects nonfinite aggregates',()=>{
  expect(summarizeHorizon({setup:null,measured:10,return_count:10,avg_signed_move:0,r_count:10,avg_r:'Infinity'})).toMatchObject({avgReturnPct:0,avgR:null});
 });
 it('does not guess measurement counts for older payloads',()=>{
  expect(summarizeHorizon({setup:null,measured:100,avg_signed_move:5})).toMatchObject({returnCount:0,avgReturnPct:null});
 });
 it('renders individual denominators and explains that method attribution is unverified',()=>{
  vi.stubGlobal('React',React);
  const html=renderToStaticMarkup(<Component stats={{available:true,minSample:10,note:HORIZON_METHOD_NOTE,horizons:[{horizon:'6w',days:42,overall:summarizeHorizon({setup:null,measured:100,correct:2,neutral:98,return_count:1,avg_signed_move:5}),bySetup:[]}]}}/>);
  expect(html).toContain('Method attribution is unverified');expect(html).toContain('n=2');expect(html).toContain('n=1');expect(html).not.toContain('+5.00%');expect(html).toContain('not enough data');
  vi.unstubAllGlobals();
 });
 it('does not expose raw database errors in either route consumer',async()=>{
  mocks.q.mockRejectedValue(new Error('postgres://private-password@host'));
  const result=await loadPositionHorizonStats();
  expect(result.available).toBe(false);expect(result.error).toMatch(/^Request failed \(ref /);expect(JSON.stringify(result)).not.toContain('private-password');
 });
});
