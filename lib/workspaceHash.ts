import crypto from "crypto";

export function hashWorkspaceId(customerId: string): string {
  // Deterministic, stable workspace id derived from Stripe customer id (UUID format)
  const hashBytes = crypto.createHash("sha256").update(customerId).digest();
  // Format as UUID: 8-4-4-4-12 characters
  return `${hashBytes.subarray(0, 4).toString('hex')}-${hashBytes.subarray(4, 6).toString('hex')}-${hashBytes.subarray(6, 8).toString('hex')}-${hashBytes.subarray(8, 10).toString('hex')}-${hashBytes.subarray(10, 16).toString('hex')}`;
}
