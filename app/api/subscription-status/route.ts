import { NextRequest, NextResponse } from "next/server";
import { getEffectiveTier } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wid = req.nextUrl.searchParams.get("wid");
  if (!wid) {
    return NextResponse.json({ error: "Missing wid" }, { status: 400 });
  }

  try {
    // Use the correct getEffectiveTier function from lib/db.ts
    const tier = await getEffectiveTier(wid);
    
    return NextResponse.json({ 
      workspace_id: wid, 
      tier: tier // 'free' or 'paid'
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    // Default to free on error
    return NextResponse.json({ 
      workspace_id: wid, 
      tier: 'free' 
    });
  }
}
