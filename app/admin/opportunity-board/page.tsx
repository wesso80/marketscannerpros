import AdminOpportunityBoard from "@/components/admin/AdminOpportunityBoard";
import { defaultAdminMarket } from "@/lib/admin/defaultAdminMarket";

export const dynamic = "force-dynamic";

export default function OpportunityBoardPage() {
  // Opens on EQUITIES (admin default); crypto is one toggle away.
  return <AdminOpportunityBoard defaultMarket={defaultAdminMarket()} />;
}
