import { redirect } from "next/navigation";

// AI Analyst page removed  the MSP Analyst bot is available on every page
// via the floating button in the bottom-right corner.
// Redirect any existing bookmarks to the scanner.
export default function AiAnalystPage() {
  redirect("/tools/scanner");
}
