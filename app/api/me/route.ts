// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";

export async function GET() {
  const session = getSessionFromCookie();
  
  if (!session) {
    return NextResponse.json({ 
      tier: "free", 
      workspaceId: null,
      authenticated: false 
    });
  }

  return NextResponse.json({ 
    tier: session.tier, 
    workspaceId: session.workspaceId,
    authenticated: true
  });
}
