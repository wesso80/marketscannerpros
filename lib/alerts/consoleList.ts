/**
 * Alert radar console list, edit and prefill helpers (TR-24). Pure, so they can be tested.
 */

export interface ConsoleListAlert {
  id: string;
  symbol: string;
  name?: string | null;
  condition_type: string;
  condition_value: number | string;
  is_active: boolean;
  is_recurring?: boolean | null;
  trigger_count: number;
  is_smart_alert?: boolean | null;
  is_multi_condition?: boolean | null;
}

/**
 * Every alert for the console, active ones first (original order kept within each group).
 * Before, only active alerts were listed, so a paused alert (or a one-time alert that had
 * fired and been switched off) vanished with no way to re-arm or delete it here.
 */
export function consoleListAlerts<T extends ConsoleListAlert>(alerts: T[]): T[] {
  return [...alerts.filter((a) => a.is_active), ...alerts.filter((a) => !a.is_active)];
}

/** Clearer label for inactive rows: "Fired" for a one-time alert that triggered, else "Paused". */
export function consoleRowLabel(alert: ConsoleListAlert, status: string): string {
  if (status !== 'Disabled') return status;
  if (!alert.is_active && !alert.is_recurring && Number(alert.trigger_count) > 0) return 'Fired';
  return 'Paused';
}

/** Whether the alert's level (price or %) can be edited in the console. */
export function canEditLevel(alert: ConsoleListAlert): boolean {
  if (alert.is_smart_alert || alert.is_multi_condition) return false;
  const ct = alert.condition_type ?? '';
  return ct.startsWith('price_') || ct.startsWith('percent_change_');
}

export type AlertEditResult =
  | { ok: true; body: { id: string; name: string; conditionValue?: number } }
  | { ok: false; error: string };

/** Validate the console edit form and build the PUT /api/alerts body. */
export function buildAlertEdit(alert: ConsoleListAlert, form: { name: string; level: string }): AlertEditResult {
  const name = form.name.trim();
  if (name.length > 100) return { ok: false, error: 'Name must be 100 characters or fewer' };
  const body: { id: string; name: string; conditionValue?: number } = { id: alert.id, name };
  if (canEditLevel(alert)) {
    const level = Number(String(form.level).trim());
    if (!String(form.level).trim() || !Number.isFinite(level) || level <= 0) {
      return { ok: false, error: alert.condition_type.startsWith('percent_') ? 'Enter a % move above 0' : 'Enter a price above 0' };
    }
    body.conditionValue = level;
  }
  return { ok: true, body };
}

/** Symbol passed from the Watchlist "Alert" button (?symbol=), sanitised; null if absent/invalid. */
export function symbolFromQuery(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.\-/:=^]{0,19}$/.test(s) ? s : null;
}
