import AdminClientLayout from "./admin-client-layout";
import { adminDiscoveryOnly } from "@/lib/admin/discoveryOnly";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminClientLayout discoveryPaused={adminDiscoveryOnly()}>{children}</AdminClientLayout>;
}
