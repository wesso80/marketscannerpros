'use client';
import { trackEvent } from '@/lib/analytics';
export type FreeEvent = 'free_signup' | 'first_scan' | 'scan_limit_hit' | 'upgrade_click' | 'locked_preview_view';
export type FunnelEvent = 'sign_up' | 'first_scan' | 'limit_hit' | 'upgrade_click' | 'purchase' | 'paid';
type EventProps = Record<string, string | number | boolean | undefined>;
const ONCE_FOREVER = new Set<FunnelEvent>(['sign_up', 'first_scan']);
const UPGRADE_TEXT = /^(upgrade|see pricing|view pricing|go pro|unlock)\b/i;

/** Only non-personal placement names; no account, email or researched-symbol payload. */
export function trackFreeEvent(name: FreeEvent, where: string, onceKey?: string) {
  try {
    if (localStorage.getItem('msp-consent') !== 'accepted') return;
    const key = onceKey ? `msp-free-event:${name}:${onceKey}` : null;
    if (key && sessionStorage.getItem(key)) return;
    const props = name === 'locked_preview_view'
      ? { tool: where }
      : name === 'upgrade_click'
        ? { where, placement: where }
        : { where };
    trackEvent(name, props);
    if (key) sessionStorage.setItem(key, '1');
  } catch { /* Optional analytics cannot block a user action. */ }
}

export function limitOnceKey(limit: string, now = new Date()): string {
  return `${limit}:${now.toISOString().slice(0, 10)}`;
}

function onceStorageKey(name: FunnelEvent, once?: true | string): string | null {
  if (once === true || (once === undefined && ONCE_FOREVER.has(name))) return `msp-funnel-once:${name}`;
  if (typeof once === 'string' && once) return `msp-funnel-once:${name}:${once}`;
  return null;
}

/**
 * Client funnel event. Sends only after analytics consent, because that is when
 * the existing analytics scripts are allowed to load. sign_up and first_scan are
 * remembered and sent on the later accept if the action happened first.
 */
export function trackFunnelEvent(name: FunnelEvent, props?: EventProps, options?: { once?: true | string }): boolean {
  try {
    const key = onceStorageKey(name, options?.once ?? (ONCE_FOREVER.has(name) ? true : undefined));
    if (key && localStorage.getItem(key)) return false;
    if (localStorage.getItem('msp-consent') !== 'accepted') {
      if (name === 'sign_up' || name === 'first_scan') {
        localStorage.setItem(`msp-funnel-pending:${name}`, JSON.stringify(props || {}));
      }
      return false;
    }
    trackEvent(name, props);
    if (key) localStorage.setItem(key, '1');
    localStorage.removeItem(`msp-funnel-pending:${name}`);
    return true;
  } catch {
    return false;
  }
}

export function flushPendingFunnelEvents(): void {
  for (const name of ['sign_up', 'first_scan'] as const) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(`msp-funnel-pending:${name}`); } catch { return; }
    if (!raw) continue;
    let props: EventProps = {};
    try { props = JSON.parse(raw) as EventProps; } catch { props = {}; }
    trackFunnelEvent(name, props, { once: true });
  }
}

function linkPath(href: string): string {
  if (!href || href.startsWith('#')) return '';
  try { return new URL(href, 'https://marketscannerpros.app').pathname; } catch { return ''; }
}

/** Placement for an Upgrade or Pricing control. Null when this click is not one, or a marked handler already records it. */
export function upgradePlacementFromClick(target: EventTarget | null, pagePath: string): string | null {
  const el = target instanceof Element ? target.closest('a,button') : null;
  if (!el || el.getAttribute('data-funnel-upgrade') === 'handled') return null;
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (/^(start free|current plan|not now|redirecting…|redirecting\.\.\.)$/i.test(text)) return null;
  const toPricing = linkPath(el.getAttribute('href') || '') === '/pricing';
  if (!toPricing && !UPGRADE_TEXT.test(text)) return null;
  const explicit = el.getAttribute('data-placement');
  if (explicit?.trim()) return explicit.trim().slice(0, 80);
  const label = text.slice(0, 48) || 'pricing';
  return `${pagePath || '/'}:${label}`.slice(0, 120);
}

const AI_LIMIT_PATH = /\/api\/(?:msp-analyst|ai\/(?:copilot|explain|analyst-context))(?:\?|$)/;

/** Reads a scan or AI response the analytics loader already intercepted. Consent is enforced by trackFunnelEvent. */
export async function noteFunnelResponse(url: string, method: string, response: Pick<Response, 'ok' | 'status' | 'clone'>): Promise<void> {
  if (method !== 'POST' || typeof response?.clone !== 'function') return;
  const scans = url.includes('/api/scanner/run');
  const ai = AI_LIMIT_PATH.test(url.split('#')[0] || url);
  if (!scans && !ai) return;
  let data: { firstScan?: boolean; limitReached?: boolean } | null = null;
  try { data = await response.clone().json(); } catch { return; }
  if (scans && response.ok && data?.firstScan === true) {
    trackFunnelEvent('first_scan', { where: 'scanner', placement: 'scanner' }, { once: true });
  }
  if (response.status === 429 && data?.limitReached === true) {
    const limit = scans ? 'scans' : 'ai_questions';
    trackFunnelEvent('limit_hit', { limit, where: limit, placement: limit }, { once: limitOnceKey(limit) });
  }
}
