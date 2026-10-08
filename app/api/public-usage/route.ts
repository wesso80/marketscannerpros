import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { publicQuotaEnabled, publicQuota, resolvePublicQuotaAccess } from '@/lib/publicQuotaAccess';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET() {
  if (!publicQuotaEnabled()) return reply({enabled:false});
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return reply({error:'Please log in'},401);
    const access = await resolvePublicQuotaAccess(session);
    if (access.bypass) return reply({enabled:true,bypass:true});
    return reply({enabled:true,...await publicQuota.status(access.subject,access.plan)});
  } catch { return reply({error:'Usage temporarily unavailable'},503); }
}
