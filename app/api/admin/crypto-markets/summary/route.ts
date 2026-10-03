import {NextResponse} from 'next/server';
import {isValidAdminSecret} from '@/lib/adminAuth';
import {buildCryptoSummary} from '@/lib/admin/cryptoSummary';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/**
 * Read-only simulated crypto summary for bots. GET only.
 * Auth is CRYPTO_SUMMARY_KEY only: header `x-crypto-summary-key` or `Authorization: Bearer`.
 * Set CRYPTO_SUMMARY_KEY on Render. Never commit a value. ADMIN_SECRET and session cookies are not accepted.
 */
function authorized(req:Request){
 const expected=process.env.CRYPTO_SUMMARY_KEY;
 if(!expected)return false;
 const header=req.headers.get('x-crypto-summary-key');
 const auth=req.headers.get('authorization')??'';
 const bearer=/^Bearer\s+\S/i.test(auth)?auth.replace(/^Bearer\s+/i,'').trim():null;
 return isValidAdminSecret(header?.trim()||null,expected)||isValidAdminSecret(bearer,expected);
}
function reply(body:unknown,status=200){
 return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:Request){
 if(!authorized(req))return reply({error:'Unauthorized'},403);
 try{return reply(await buildCryptoSummary());}
 catch{return reply({error:'Summary unavailable',simulated:true},503);}
}
