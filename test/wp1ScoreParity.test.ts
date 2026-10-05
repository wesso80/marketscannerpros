import {expect,it} from 'vitest';
import {buildPayload} from '@/lib/goldenEgg/engine';
import {now,price,ind} from './fixtures/goldenEggTiming';
import baseline from './fixtures/wp1MainScores.json';
// Captured on f33130bd using exactly these inputs. Fixture replay, not live-market proof.
it.each(['AAPL','NVDA','BTC'] as const)('%s preserves main research score, assessment and grade',symbol=>{
 const p=buildPayload(symbol,symbol==='BTC'?'crypto':'equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});
 expect({confluenceScore:p.layer1.confluenceScore,assessment:p.layer1.assessment,grade:p.layer1.grade,canonical:p.canonicalVerdict??null}).toEqual(baseline[symbol]);
});
