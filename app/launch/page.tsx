import { redirect } from "next/navigation";

export const metadata = {
  title: "Launch",
  alternates: { canonical: "/tools" },
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function Page() {
  // Legacy launch route — redirect to tools dashboard
  redirect("/tools");
}
