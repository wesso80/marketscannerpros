import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PublicSymbolPacket } from '@/lib/research/publicSymbolPacket';

export interface PageEvidence {
  version: 'copilot-evidence-v1';
  page: string;
  symbol: string;
  timeframe: string;
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
    missing: ['This snapshot covers the public core Symbol packet. Separately loaded news, benchmark chart series, full options chain and Volatility tab are not connected to Copilot yet. Do not infer their contents.'],
  };
  const body = Buffer.from(JSON.stringify({ subject, expires: now + 30 * 60_000, evidence })).toString('base64url');
  if (body.length > MAX_TOKEN_BYTES) return null;
  try { return `${body}.${sign(body).toString('base64url')}`; } catch { return null; }
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
