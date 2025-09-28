import { redirect } from "next/navigation";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";
export default async function Launch() {
  const jar = await cookies();
  const has =
    !!jar.get("next-auth.session-token") || !!jar.get("__Secure-next-auth.session-token");
  redirect(has ? "/app" : "/signin?callbackUrl=/app");
}
