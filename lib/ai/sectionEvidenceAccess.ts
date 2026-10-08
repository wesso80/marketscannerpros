import { getSessionFromCookie } from '@/lib/auth';
import { publicQuotaEnabled, resolvePublicQuotaAccess } from '@/lib/publicQuotaAccess';
import { issueSectionEvidence } from './publicCopilotEvidence';
/** Optional signing must never break the underlying report or grant access to it. */
export async function sectionEvidenceToken(section:'chart'|'news'|'options'|'ownership'|'crypto'|'dve',symbol:string,assetType:string,data:unknown,expiry:string|null=null) {
  if(!publicQuotaEnabled())return null;
  try {
    const session=await getSessionFromCookie();if(!session?.workspaceId)return null;
    const access=await resolvePublicQuotaAccess(session);
    if(access.bypass || access.plan!=='pro')return null;
    return issueSectionEvidence(section,symbol,assetType,data,access.subject,expiry);
  } catch{return null;}
}
