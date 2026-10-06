/** Draft-alert skip returned by /api/actions/execute, including an idempotent replay wrapper. */
export function skippedAlertDraftReason(result: {
  kind?: string;
  created?: boolean;
  reason?: string | null;
  output?: { kind?: string; created?: boolean; reason?: string | null } | null;
} | null | undefined): string | null {
  const direct = result?.kind === 'alert_draft'
    ? result
    : result?.output?.kind === 'alert_draft'
      ? result.output
      : null;
  if (direct && direct.created === false && typeof direct.reason === 'string' && direct.reason.trim()) {
    return direct.reason;
  }
  return null;
}

/**
 * Operator focus-strip create. A non-OK response (the cap 403) must not
 * read as a successful alert action.
 */
export function focusAlertCreateFeedback(
  responseOk: boolean,
  body: { alertId?: string | null; message?: string | null } | null,
  symbol: string,
): { message: string; proceed: boolean } {
  if (!responseOk) {
    const message = body?.message?.trim();
    return { message: message || `Alert not created for ${symbol}.`, proceed: false };
  }
  if (body?.alertId) {
    return { message: `Alert created for ${symbol} (${body.alertId})`, proceed: true };
  }
  return { message: `Alert action triggered for ${symbol}`, proceed: true };
}
