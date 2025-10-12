import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  // Use environment variable for app URL
  const target = process.env.NEXT_PUBLIC_APP_URL;
  
  if (!target) {
    // If no URL is configured, show error page instead of hardcoded fallback
    throw new Error("NEXT_PUBLIC_APP_URL environment variable is not configured");
  }

  // Normalize trailing slash and redirect server-side
  const url = target.endsWith("/") ? target : target + "/";
  redirect(url);
}
