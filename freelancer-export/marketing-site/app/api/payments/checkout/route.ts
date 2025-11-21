import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Payments are temporarily disabled." }, { status: 403 });
}
