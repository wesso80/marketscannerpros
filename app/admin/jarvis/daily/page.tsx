import { redirect } from "next/navigation";

/**
 * MSP Radar moved to the customer surface at /tools/msp-radar (paid entitlement + admin access enforced there and in /api/msp-radar/*).
 * This admin path is middleware-gated, so only an authorised admin ever reaches this redirect. `?date=` is preserved for archive links.
 */
export default async function JarvisDailyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  redirect(date ? `/tools/msp-radar?date=${date}` : "/tools/msp-radar");
}
