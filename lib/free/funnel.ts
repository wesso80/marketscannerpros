'use client';
import { trackEvent } from '@/lib/analytics';
export type FreeEvent = 'free_signup' | 'first_scan' | 'scan_limit_hit' | 'upgrade_click' | 'locked_preview_view';
/** Only non-personal placement names; no account, email or researched-symbol payload. */
export function trackStartHereStep(step: 1 | 2 | 3) {
  try {
    if (localStorage.getItem('msp-consent') !== 'accepted') return;
    trackEvent('start_here_step', { step });
  } catch { /* Optional analytics cannot block a user action. */ }
}

export function trackFreeEvent(name: FreeEvent, where: string, onceKey?: string) {
  try {
    if (localStorage.getItem('msp-consent') !== 'accepted') return;
    const key = onceKey ? `msp-free-event:${name}:${onceKey}` : null;
    if (key && sessionStorage.getItem(key)) return;
    trackEvent(name, name === 'locked_preview_view' ? { tool: where } : { where });
    if (key) sessionStorage.setItem(key, '1');
  } catch { /* Optional analytics cannot block a user action. */ }
}
