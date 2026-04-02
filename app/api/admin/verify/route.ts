import { NextRequest, NextResponse } from "next/server";
import { isAdminSecret } from '@/lib/quant/operatorAuth';

export async function GET(req: NextRequest) {
  if (!isAdminSecret(req.headers.get('authorization'))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  return NextResponse.json({ ok: true });
}
