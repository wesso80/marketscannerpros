export type MacroResponseAccess = 'ok' | 'locked' | 'unavailable';

/** Auth and empty-state only. 401/403 stay locked; the route itself is unchanged. */
export function macroResponseAccess(status: number): MacroResponseAccess {
  if (status === 401 || status === 403) return 'locked';
  if (status >= 200 && status < 300) return 'ok';
  return 'unavailable';
}
