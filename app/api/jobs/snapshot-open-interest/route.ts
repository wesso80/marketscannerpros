import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/adminAuth';
import { getOiEvidence } from '@/lib/crypto/oiHistory';
export async function POST(req: NextRequest) {
 if (!verifyCronAuth(req)) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const data=await getOiEvidence();
  const persisted = data.persistence === 'ok';
  return NextResponse.json({
    success: persisted,
    persisted,
    observedAt: data.observedAt,
    contracts: data.expectedContracts,
    carried: data.carriedContracts,
  }, { status: persisted ? 200 : 500 });
 }
 catch { return NextResponse.json({success:false, persisted:false, error:'OI basket unavailable or incomplete'},{status:503}); }
}
export const GET=POST;
