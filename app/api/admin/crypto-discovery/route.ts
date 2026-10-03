import {runDiscoveryBatch} from '@/lib/admin/cryptoDiscoveryBatch';
import {cryptoMarketsPauseBanner} from '@/lib/admin/cryptoMarketsPause';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getRedis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const KEY = 'admin:crypto-discovery:v1';
export async function GET(req: Request) {
  if (!(await requireAdmin(req)).ok) return NextResponse.json({error:'Unauthorized'}, {status:403});
  try {
    const redis = getRedis();
    if (!redis) throw new Error('Discovery cache unavailable');
    return NextResponse.json({ snapshot: await redis.get(KEY), ...cryptoMarketsPauseBanner() }, {headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Discovery cache unavailable'}, {status:503}); }
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 return runDiscoveryBatch();
}
