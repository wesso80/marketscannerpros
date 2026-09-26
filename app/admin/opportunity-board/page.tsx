import AdminOpportunityBoard from "@/components/admin/AdminOpportunityBoard";
import { defaultAdminMarket } from "@/lib/admin/defaultAdminMarket";

export const dynamic = "force-dynamic";

export default function OpportunityBoardPage() {
  // Opens on EQUITIES while crypto market data (OPERATOR_CG_FETCH_ENABLED) is off.
  return <AdminOpportunityBoard defaultMarket={defaultAdminMarket()} />;
}
