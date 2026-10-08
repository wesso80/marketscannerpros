import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PublicSymbolPacket } from '@/lib/research/publicSymbolPacket';

export interface PageEvidence {
  version: 'copilot-evidence-v1';
  page: string;
  symbol: string;
  timeframe: string;
  section?: 'core' | 'chart' | 'news' | 'options' | 'ownership' | 'crypto';
  assetType?: string;
  expiry?: string | null;
  capturedAt: string;
  observations: Array<{ id: string; field: string; value: string | number | boolean | null }>;
  missing: string[];
}
const MAX_TOKEN_BYTES = 120_000;
function sign(body: string) {
  const key = process.env.APP_SIGNING_SECRET;
  if (!key) throw Error('Evidence signing unavailable');
  return createHmac('sha256', key).update('public-copilot-v1:' + body).digest();
}
/** Called only with the leaf-projected public contract, never with the internal engine packet.
 * The bearer is bound to the authenticated account and expires; signing grants no Pro entitlement. */
export function issueSymbolEvidence(packet: PublicSymbolPacket, subject: string, now = Date.now()): string | null {
  if (!packet.canonical || packet.contract !== 'public-symbol-v2') return null;
  const observations: PageEvidence['observations'] = [];
  function visit(value: unknown, path: string) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      observations.push({ id: `e${observations.length + 1}`, field: path, value: value as string | number | boolean | null });
    } else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}[${i}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
  }
  visit(packet, 'symbol');
  const evidence: PageEvidence = {
    version: 'copilot-evidence-v1', page: '/tools/golden-egg', symbol: packet.meta.symbol,
    timeframe: packet.meta.timeframe, capturedAt: new Date(now).toISOString(), observations,
    section: 'core', assetType: packet.meta.assetClass, expiry: packet.canonical.options?.expiry ?? null,
    missing: ['This snapshot covers the public core Symbol packet. Separately loaded news, benchmark chart series, full options chain and Volatility tab are not connected to Copilot yet. Do not infer their contents.'],
  };
  const body = Buffer.from(JSON.stringify({ subject, expires: now + 30 * 60_000, evidence })).toString('base64url');
  if (body.length > MAX_TOKEN_BYTES) return null;
  try { return `${body}.${sign(body).toString('base64url')}`; } catch { return null; }
}
/** Only server-built public response adapters may call this. Never sign a request body. */
export function issueSectionEvidence(section: 'chart' | 'news' | 'options' | 'ownership' | 'crypto', symbol: string, assetType: string, data: unknown, subject: string, expiry: string | null = null, now = Date.now()): string | null {
  const observations: PageEvidence['observations'] = [];
  const visit = (value: unknown, field: string): void => {
    // Compact long, already-public series without dropping observations or duplicating their field paths.
    if(Array.isArray(value) && value.length>8){observations.push({id:`${section}_${observations.length+1}`,field,value:JSON.stringify(value)});return;}
    if(value === null || ['string','boolean','number'].includes(typeof value)) observations.push({id:`${section}_${observations.length+1}`,field,value:value as string|number|boolean|null});
    else if(Array.isArray(value))value.forEach((v,i)=>visit(v,`${field}[${i}]`));
    else if(value && typeof value==='object')Object.entries(value).forEach(([k,v])=>visit(v,`${field}.${k}`));
  };
  visit(data,section);
  const evidence:PageEvidence={version:'copilot-evidence-v1',page:'/tools/golden-egg',section,symbol,assetType,expiry,timeframe:section==='chart'?'daily completed bars':'see observation basis',capturedAt:new Date(now).toISOString(),observations,missing:[]};
  const body=Buffer.from(JSON.stringify({subject,expires:now+30*60_000,evidence})).toString('base64url');
  if(body.length>MAX_TOKEN_BYTES)return null;
  try{return `${body}.${sign(body).toString('base64url')}`;}catch{return null;}
}
export function combinePageEvidence(core:PageEvidence,tokens:unknown,subject:string,now=Date.now()):PageEvidence|null {
  if(core.section!=='core' || !Array.isArray(tokens) || tokens.length>5)return null;
  const sections:PageEvidence[]=[];
  for(const token of tokens){
    const s=verifyPageEvidence(token,subject,now);
    if(!s || !s.section || s.section==='core' || s.page!==core.page || s.symbol!==core.symbol || s.assetType!==core.assetType || sections.some(x=>x.section===s.section))return null;
    if(s.section==='options' && s.expiry!==core.expiry)return null;
    sections.push(s);
  }
  const missing=['Volatility section is not connected yet. Do not infer its contents.'];
  for(const name of ['chart','news',...(core.assetType==='crypto'?['crypto']:['options','ownership'])])if(!sections.some(s=>s.section===name))missing.push(`${name}: not loaded or unavailable in this snapshot.`);
  return {...core,observations:[...core.observations,...sections.flatMap(s=>[{id:`${s.section}_captured`,field:`${s.section}.capturedAt (not observation time)`,value:s.capturedAt},...s.observations])],missing};
}
export function verifyPageEvidence(token: unknown, subject: string, now = Date.now()): PageEvidence | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES + 100) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = sign(parts[0]), supplied = Buffer.from(parts[1], 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (value.subject !== subject || !Number.isFinite(value.expires) || value.expires <= now || value.evidence?.version !== 'copilot-evidence-v1') return null;
    return value.evidence;
  } catch { return null; }
}
export const evidenceIdentity = (evidence: PageEvidence) => createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
