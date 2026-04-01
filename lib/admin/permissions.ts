export type AdminRole = "public" | "member" | "admin" | "superadmin";

export const ADMIN_ROLES: AdminRole[] = ["admin", "superadmin"];

export function canAccessAdmin(role: AdminRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canAccessOperator(role: AdminRole): boolean {
  return role === "admin" || role === "superadmin";
}

export function canAccessSystem(role: AdminRole): boolean {
  return role === "superadmin";
}
