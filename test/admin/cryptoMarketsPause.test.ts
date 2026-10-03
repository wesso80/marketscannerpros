import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {cryptoMarketsExitsPaused,cryptoMarketsPaused,pausedCryptoMarketsBody} from '@/lib/admin/cryptoMarketsPause';
import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
import {runCryptoMarketData} from '@/lib/admin/cryptoMarketDataJob';
import {runNewListings} from '@/lib/admin/cryptoNewListingsJob';

afterEach(()=>vi.unstubAllEnvs());

it('defaults off, including empty and explicit false',()=>{
 expect(cryptoMarketsPaused({})).toBe(false);
 expect(cryptoMarketsPaused({CRYPTO_MARKETS_PAUSED:''})).toBe(false);
 for(const v of ['false','0','no','off','FALSE'])expect(cryptoMarketsPaused({CRYPTO_MARKETS_PAUSED:v})).toBe(false);
 expect(cryptoMarketsExitsPaused({CRYPTO_MARKETS_PAUSE_EXITS:'true'})).toBe(false);
});

it('turns on only for true, 1, yes, or on, and exits require both flags',()=>{
 for(const v of ['true','TRUE','1','yes','on']){
  expect(cryptoMarketsPaused({CRYPTO_MARKETS_PAUSED:v})).toBe(true);
  expect(cryptoMarketsExitsPaused({CRYPTO_MARKETS_PAUSED:v})).toBe(false);
  expect(cryptoMarketsExitsPaused({CRYPTO_MARKETS_PAUSED:v,CRYPTO_MARKETS_PAUSE_EXITS:'true'})).toBe(true);
 }
 expect(pausedCryptoMarketsBody()).toMatchObject({ok:true,paused:true,skipped:true,reason:'crypto_markets_paused'});
});

it('scheduled spend entry points return a skipped result and do not open storage',async()=>{
 vi.stubEnv('CRYPTO_MARKETS_PAUSED','true');
 const momentum=await runMomentumBatch();
 expect(momentum.status).toBe(200);
 expect(await momentum.json()).toMatchObject({paused:true,ok:true});
 await expect(runCryptoMarketData()).resolves.toMatchObject({ok:true,paused:true,skipped:true});
 await expect(runNewListings()).resolves.toMatchObject({ok:true,paused:true,skipped:true});
});

it('does not change paper entry, exit, or sizing modules',()=>{
 const paper=readFileSync('lib/admin/cryptoPaper.ts','utf8')+readFileSync('lib/admin/cryptoPaperBase.ts','utf8');
 expect(paper).not.toMatch(/CRYPTO_MARKETS_PAUSED|CRYPTO_MARKETS_PAUSE_EXITS/);
 const history=readFileSync('lib/admin/cgHistoryJob.ts','utf8')+readFileSync('lib/admin/cgHistory.ts','utf8');
 expect(history).not.toMatch(/CRYPTO_MARKETS_PAUSED/);
});

it('does not gate public ingestion, the worker scheduler, user alerts, or the public quote API',()=>{
 for(const file of ['worker/ingest-data.ts','worker/scheduler.ts','lib/worker/schedule.ts','app/api/alerts/check/route.ts','app/api/quote/route.ts','middleware.ts']){
  expect(readFileSync(file,'utf8')).not.toMatch(/CRYPTO_MARKETS_PAUSED|cryptoMarketsPaused/);
 }
});
