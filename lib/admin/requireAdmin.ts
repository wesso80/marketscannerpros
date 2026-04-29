/**
 * Re-export shim — the admin terminal upgrade brief expects to import
 * `requireAdmin` from `@/lib/admin/requireAdmin`. The canonical implementation
 * lives in `@/lib/adminAuth`. Keep this file as a stable, brief-aligned import
 * surface so future admin modules can use the documented path.
 */
export { requireAdmin } from "@/lib/adminAuth";
export type { AdminAuthResult } from "@/lib/adminAuth";
