import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  // Prefer ENV, fall back to your Streamlit app
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || "";
  const target = fromEnv || "https://market-scanner-1-wesso80.replit.app";

  // Normalize trailing slash and redirect server-side (no quotes in header)
  const url = target.endsWith("/") ? target : target + "/";
  redirect(url);
}
