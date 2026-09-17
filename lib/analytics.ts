"use client";

import { capturePostHogEvent, capturePostHogPageView } from "@/lib/posthog-browser";

type AnalyticsEvent =
  | "cta_get_started"
  | "open_pricing"
  | "pricing_viewed"
  | "start_free_trial"
  | "login_submit"
  | "open_scanner"
  | "checkout_started"
  | "checkout_failed"
  | "checkout_cancelled"
  | "subscription_started"
  | "upgrade_pro"
  | "upgrade_pro_trader"
  | "open_dashboard"
  | "open_ai_analyst";

type EventProps = Record<string, string | number | boolean | undefined>;

type StoredAttribution = {
  capturedAt: number;
  props: EventProps;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    plausible?: (event: string, options?: { props?: EventProps }) => void;
  }
}

const ATTRIBUTION_STORAGE_KEY = "msp-marketing-attribution";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const cleanValue = (value: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 160);
};

const externalReferrerDomain = () => {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname === window.location.hostname) return undefined;
    return referrer.hostname.slice(0, 160);
  } catch {
    return undefined;
  }
};

const readStoredAttribution = (): EventProps => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as StoredAttribution;
    if (!stored?.capturedAt || Date.now() - stored.capturedAt > ATTRIBUTION_TTL_MS) {
      localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return {};
    }
    return stored.props || {};
  } catch {
    return {};
  }
};

export const captureMarketingAttribution = (): EventProps => {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const currentTouch: EventProps = {};
  let hasUtm = false;

  for (const key of UTM_KEYS) {
    const value = cleanValue(params.get(key));
    if (!value) continue;
    currentTouch[key] = value;
    hasUtm = true;
  }

  if (!hasUtm) return readStoredAttribution();

  currentTouch.marketing_landing_path = window.location.pathname.slice(0, 240);
  const referrerDomain = externalReferrerDomain();
  if (referrerDomain) currentTouch.marketing_referrer_domain = referrerDomain;

  try {
    const stored: StoredAttribution = {
      capturedAt: Date.now(),
      props: currentTouch,
    };
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Analytics still works even when storage is unavailable.
  }

  return currentTouch;
};

export const getMarketingAttribution = (): EventProps => readStoredAttribution();

const trackWithGa = (name: AnalyticsEvent, props?: EventProps) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, { event_category: "engagement", ...props });
};

const trackWithClarity = (name: AnalyticsEvent) => {
  if (typeof window === "undefined" || typeof window.clarity !== "function") return;
  window.clarity("event", name);
};

const trackWithPlausible = (name: AnalyticsEvent, props?: EventProps) => {
  if (typeof window === "undefined" || typeof window.plausible !== "function") return;
  window.plausible(name, props ? { props } : undefined);
};

export const trackEvent = (name: AnalyticsEvent, props?: EventProps) => {
  const combinedProps = { ...getMarketingAttribution(), ...props };
  trackWithGa(name, combinedProps);
  trackWithClarity(name);
  trackWithPlausible(name, combinedProps);
  capturePostHogEvent(name, combinedProps);
};

export const trackPageView = (path: string) => {
  if (typeof window === "undefined") return;
  const title = document?.title || undefined;
  const attribution = getMarketingAttribution();
  if (typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title,
      ...attribution,
    });
  }
  if (typeof window.clarity === "function") {
    window.clarity("event", "page_view");
  }
  capturePostHogPageView(path, title, attribution);
};
