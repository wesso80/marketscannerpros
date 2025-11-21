import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyBearer } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const claims = await verifyBearer(auth);
    
    if (!claims || !claims.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate short-lived token for Streamlit (20-30 min)
    const appToken = await signToken({
      userId: claims.userId,
      email: claims.email,
      tier: claims.tier
    }, '30m');

    return NextResponse.json({ token: appToken });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
