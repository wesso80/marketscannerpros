import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const gate=vi.hoisted(()=>({
 assessOutgoingAlert:vi.fn(async(input:{text?:string;subject?:string})=>({
  action:'send' as const,
  headers:{
   'List-Unsubscribe':'<https://marketscannerpros.app/api/email/unsubscribe?t=test>, <mailto:unsubscribe@marketscannerpros.app?subject=unsubscribe>',
   'List-Unsubscribe-Post':'List-Unsubscribe=One-Click',
  },
  html:`<p>${input.subject??''}</p><p>Unsubscribe from alert emails</p>`,
  text:`${input.text??''}\n\nUnsubscribe from alert emails: https://marketscannerpros.app/api/email/unsubscribe?t=test\n`,
  day:'2026-09-28',
 })),
 cryptoSetupAlertUserId:(email:string)=>`crypto-setup:${email.trim().toLowerCase()}`,
 noteProviderSuppression:vi.fn(async()=>{}),
 releaseAlertSendSlot:vi.fn(async()=>{}),
}));
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/alerts/emailControls',()=>gate);
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
 const args=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 const body=JSON.parse(args[1].body as string);
 expect(body.to).toEqual(['test@example.com']);
 expect(body.from).toBe('MarketScannerPros Alerts <alerts@marketscannerpros.app>');
 expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
 expect(body.headers['List-Unsubscribe']).toContain('<mailto:unsubscribe@marketscannerpros.app?subject=unsubscribe>');
 expect(body.text).toContain('Unsubscribe from alert emails:');
 expect(body.html).toContain('Unsubscribe');
 expect(args[1].headers).toHaveProperty('Idempotency-Key');
});
it('does not call the provider when the setup is queued for the digest',async()=>{
 gate.assessOutgoingAlert.mockResolvedValueOnce({action:'queued',reason:'digest'});
 expect(await sendCryptoSetupEmails(scan,now)).toMatchObject({accepted:0});
 expect(fetcher).not.toHaveBeenCalled();
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
