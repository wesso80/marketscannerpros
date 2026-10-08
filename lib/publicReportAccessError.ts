export type ReportAccessIssue = {
  kind: 'limited' | 'pending';
  plan: 'visitor' | 'free' | 'pro';
  resetsAt?: string;
};
export class PublicReportAccessError extends Error {
  constructor(public readonly issue: ReportAccessIssue) {
    super(issue.kind === 'limited' ? 'Daily Symbol report limit reached' : 'This report is already being prepared');
    this.name = 'PublicReportAccessError';
  }
}
/** Only the Symbol route's explicit contract may trigger allowance UI. */
export function parseReportAccessIssue(url: string, status: number, value: unknown): ReportAccessIssue | null {
  if (url.split('?')[0] !== '/api/golden-egg' || !value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const kind = status === 429 && body.code === 'SYMBOL_DAILY_LIMIT' ? 'limited'
    : status === 409 && body.code === 'SYMBOL_REPORT_PENDING' ? 'pending' : null;
  if (!kind || !['visitor', 'free', 'pro'].includes(String(body.plan))) return null;
  const quota = body.quota as {resetsAt?: unknown} | undefined;
  const stamp = quota?.resetsAt;
  return {kind, plan: body.plan as ReportAccessIssue['plan'],
    resetsAt: typeof stamp === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(stamp) && Number.isFinite(Date.parse(stamp)) ? stamp : undefined};
}
