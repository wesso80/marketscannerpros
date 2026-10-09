import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
describe('scanner labels describe, they do not forecast',()=>{
 it('the scanner shows an unvalidated-ordering note and no "confidence"/"confluence" claims',()=>{
  const page=read('app/tools/scanner/page.tsx');
  expect(page).toContain('data-scanner-ordering-note');
  expect(page).toContain('historical validation on unseen data is not established');
  expect(page).not.toContain("'Strong confluence'");
  expect(page).not.toContain('>Confluence<');
  expect(page).toContain('Reading (unvalidated)');
  expect(page).not.toContain('Score (unvalidated)');
  const templates = read('components/scanner/ScanTemplatesBar.tsx');
  expect(templates).toContain("label: 'Indicators agreeing'");
  expect(templates).toContain('Rows where at least 3 timeframes agree and data quality is high');
  expect(templates).not.toContain('High Alignment');
  expect(templates).not.toContain('Indicator agreement 70+');
  expect(templates).not.toMatch(/\d+%\+ confidence/);
 });
 it('missing reference levels never render as $0.00 and the level ratio is not coloured as a result',()=>{
  for(const f of ['components/markets/RightRail.tsx','components/markets/tabs/OverviewTab.tsx']){
   const s=read(f);
   expect(s).not.toMatch(/\.(entry|stop|target) \?\? 0\)\.toFixed/);
   expect(s).not.toMatch(/rMultiple \?\? 0\) >= 2 \? 'text-emerald-400'/);
   expect(s).toContain("'Not available'");
  }
 });
 it('the scanner API refuses forex instead of scoring placeholder volume',()=>{
  expect(read('app/api/scanner/run/route.ts')).toMatch(/if \(\(type as string\) === 'forex'\) \{\s*return NextResponse\.json\(\{ error: 'Forex scanning is retired/);
 });
});
