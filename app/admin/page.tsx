/**
 * Admin Home Route — Private trading-intelligence command terminal.
 *
 * The previous stats overview lives at /admin/overview.
 */
import CommandHome from "@/components/admin/home/CommandHome";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return <CommandHome />;
}
