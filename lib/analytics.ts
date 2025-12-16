"use client";

type AnalyticsEvent =
  | "cta_get_started"
  | "open_pricing"
  | "start_free_trial"
  | "login_submit"
  | "open_scanner"
  | "upgrade_pro"
  | "upgrade_pro_trader"
  | "open_dashboard"
  | "open_ai_analyst";

type EventProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    plausible?: (event: string, options?: { props?: EventProps }) => void;
  }
}

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
  trackWithGa(name, props);
  trackWithClarity(name);
  trackWithPlausible(name, props);
};

export const trackPageView = (path: string) => {
  if (typeof window === "undefined") return;
  const title = document?.title || undefined;
  if (typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title,
    });
  }
  if (typeof window.clarity === "function") {
    window.clarity("event", "page_view");
  }
};
