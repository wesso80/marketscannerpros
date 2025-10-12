import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wid = req.nextUrl.searchParams.get("wid");
  if (!wid) return NextResponse.json({ error: "Missing wid" }, { status: 400 });

  const client = createClient({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    "SELECT plan_code, subscription_status FROM user_subscriptions WHERE workspace_id=$1 LIMIT 1",
    [wid]
  );
  await client.end();

  const r = rows[0];
  const tier =
    r && r.subscription_status === "active" && r.plan_code === "pro" ? "pro" : "free";
  return NextResponse.json({ workspace_id: wid, tier });
}
