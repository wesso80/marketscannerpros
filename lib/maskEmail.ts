/** First character plus domain, e.g. bradleywessling@yahoo.com.au → b***@yahoo.com.au. */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return "***";
  return `${normalized[0]}***@${normalized.slice(at + 1)}`;
}
