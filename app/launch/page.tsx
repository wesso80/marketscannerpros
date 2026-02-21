import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  // Legacy launch route — redirect to tools dashboard
  redirect("/tools");
}
