import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
import {getRedis} from '@/lib/redis';
import {sendCryptoSetupEmails} from '@/lib/admin/cryptoSetupEmail';
import type {MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
const now=Date.parse('2026-09-28T22:00:00Z');
const scan={startedAt:new Date(now).toISOString(),rows:[{id:'test',symbol:'TEST',stage:'MOMENTUM_VOLUME',asOf:'2026-09-28T20:00:00Z',kind:'BREAKOUT',pair:{exchange:'gdax',product:'TEST-USD',quote:'USD'},relativeVolume:2,changePct:3}]} as MomentumScan;
let values:Map<string,unknown>,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 values=new Map();vi.stubEnv('CRYPTO_SETUP_ALERT_EMAIL','test@example.com');vi.stubEnv('RESEND_API_KEY','fake');
 vi.mocked(getRedis).mockReturnValue({get:vi.fn(async(k:string)=>values.get(k)),set:vi.fn(async(k:string,v:unknown,o?:{nx?:boolean})=>{if(o?.nx&&values.has(k))return null;values.set(k,v);return 'OK';})} as never);
 fetcher=vi.fn(async()=>Response.json({id:'email-1'}));vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
it('sends once for a confirmed signal despite repeated scans',async()=>{
 expect(await sendCryptoSetupEmails(scan,now)).toMatchObject({accepted:1});expect(await sendCryptoSetupEmails(scan,now)).toMatchObject({accepted:0});expect(fetcher).toHaveBeenCalledOnce();
 const args=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(JSON.parse(args[1].body as string).to).toEqual(['test@example.com']);expect(args[1].headers).toHaveProperty('Idempotency-Key');
});
it('does not email watch, extended or stale scans',async()=>{
 for(const stage of ['VOLUME_WATCH','EXTENDED'])await sendCryptoSetupEmails({...scan,rows:[{...scan.rows[0],stage}]} as MomentumScan,now);
 await sendCryptoSetupEmails(scan,now+4*3600000);expect(fetcher).not.toHaveBeenCalled();
});
it('fails visibly without marking a rejected message sent',async()=>{
 fetcher.mockResolvedValue(Response.json({message:'Domain not verified'},{status:403}));expect(await sendCryptoSetupEmails(scan,now)).toMatchObject({accepted:0,error:expect.stringContaining('403')});expect([...values.keys()].some(k=>k.endsWith(':sent'))).toBe(false);
});
it('uses identical payload and idempotency key after an uncertain retry',async()=>{
 fetcher.mockRejectedValueOnce(Error('timeout'));await sendCryptoSetupEmails(scan,now);
 for(const k of values.keys())if(k.endsWith(':lock'))values.delete(k);
 expect(await sendCryptoSetupEmails({...scan,rows:[{...scan.rows[0],changePct:4}]},now)).toMatchObject({accepted:1});
 const first=fetcher.mock.calls[0] as unknown as [string,RequestInit],second=fetcher.mock.calls[1] as unknown as [string,RequestInit];
 expect(second[1].body).toEqual(first[1].body);expect(second[1].headers).toEqual(first[1].headers);
});
it('sends nothing when unconfigured',async()=>{vi.stubEnv('CRYPTO_SETUP_ALERT_EMAIL','');expect(await sendCryptoSetupEmails(scan,now)).toMatchObject({enabled:false});expect(fetcher).not.toHaveBeenCalled();});
