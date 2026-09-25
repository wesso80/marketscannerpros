/**
 * Alert radar console status (app/tools/alerts). TR-25.
 *
 * Multi-condition alerts are not evaluated by any alert checker (PR #64), so the
 * console shows them as "Not checked", never "Armed", and doesn't count them as
 * active alerts.
 */
import { alertThreshold } from '../alertPresentation';

export interface ConsoleAlert {
  condition_type: string;
  condition_value: number;
  is_active: boolean;
  triggered_at?: string;
  is_multi_condition?: boolean;
  cooldown_minutes?: number | null;
}

export type ConsoleStatus = 'Armed' | 'Cooldown' | 'Disabled' | 'Incomplete' | 'Not checked';

export function deriveStatus(alert: ConsoleAlert, nowMs = Date.now()): ConsoleStatus {
  if (alert.is_multi_condition) return 'Not checked';
  if (!alert.is_active) return 'Disabled';
  if (alert.condition_type.startsWith('price_') && (alertThreshold(alert.condition_value) ?? 0) <= 0) return 'Incomplete';
  if (!alert.triggered_at || !alert.cooldown_minutes) return 'Armed';
  const ms = nowMs - new Date(alert.triggered_at).getTime();
  return ms < alert.cooldown_minutes * 60_000 ? 'Cooldown' : 'Armed';
}

/** Active alerts that a checker actually evaluates (multi-condition excluded). */
export function checkedActiveAlerts<T extends ConsoleAlert>(alerts: T[]): T[] {
  return alerts.filter((a) => a.is_active && !a.is_multi_condition);
}

/** Legacy multi-condition alerts, listed under Basic as "Not checked" so they can be seen and deleted. */
export function legacyMultiAlerts<T extends ConsoleAlert>(alerts: T[]): T[] {
  return alerts.filter((a) => Boolean(a.is_multi_condition));
}
