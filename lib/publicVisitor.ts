import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export const VISITOR_COOKIE='msp_public_visitor';
function secret(){const key=process.env.APP_SIGNING_SECRET;if(!key)throw Error('Visitor signing unavailable');return key;}
export function issueVisitor(now=Date.now()) {
 const body=Buffer.from(JSON.stringify({id:randomUUID(),expires:now+30*86400000})).toString('base64url');
 return body+'.'+createHmac('sha256',secret()).update(body).digest('base64url');
}
export function verifyVisitor(token:string|undefined,now=Date.now()):string|null {
 if(!token||token.length>512)return null;
 try{const parts=token.split('.');if(parts.length!==2)return null;const [body,sig]=parts;
 const expected=createHmac('sha256',secret()).update(body).digest();const got=Buffer.from(sig,'base64url');
 if(got.length!==expected.length||!timingSafeEqual(got,expected))return null;
 const value=JSON.parse(Buffer.from(body,'base64url').toString());
 return typeof value.id==='string'&&/^[0-9a-f-]{36}$/.test(value.id)&&Number.isFinite(value.expires)&&value.expires>now?`visitor:${value.id}`:null;
 }catch{return null;}
}
