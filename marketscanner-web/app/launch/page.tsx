import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// Don't prerender this at build time
export const dynamic = "force-dynamic";

export default async function Launch() {
  const jar = await cookies();
  const hasSession =
    Boolean(jar.get("next-auth.session-token")) ||
    Boolean(jar.get("__Secure-next-auth.session-token"));

  redirect(hasSession ? "/dashboard" : "/signin");
}
