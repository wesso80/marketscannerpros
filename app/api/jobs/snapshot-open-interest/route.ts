import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/adminAuth';
import { getOiEvidence } from '@/lib/crypto/oiHistory';
export async function POST(req: NextRequest) {
 if (!verifyCronAuth(req)) return NextResponse.json({error:'Unauthorized'},{status:401});
 try { const data=await getOiEvidence(); return NextResponse.json({success:true,observedAt:data.observedAt,contracts:data.expectedContracts,carried:data.carriedContracts}); }
 catch { return NextResponse.json({success:false,error:'OI basket unavailable or incomplete'},{status:503}); }
}
export const GET=POST;
