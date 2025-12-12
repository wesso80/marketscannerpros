import { NextResponse } from "next/server";
export async function GET() {
  const secret =
    process.env.APP_SIGNING_SECRET || process.env.NEXTAUTH_SECRET || "";
  return NextResponse.json({
    secretPresent: !!secret,
    secretLength: secret.length ? secret.length : 0,
  });
}
