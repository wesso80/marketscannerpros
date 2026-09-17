"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureMarketingAttribution, trackEvent, trackPageView } from "@/lib/analytics";
import { initializePostHog } from "@/lib/posthog-browser";

const CONSENT_KEY = "msp-consent";
const CHECKOUT_CONTEXT_KEY = "msp-checkout-context";
const CHECKOUT_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

type CheckoutContext = {
  plan?: string;
  billing?: string;
  referral_applied?: boolean;
  startedAt: number;
};

const loadPlausible = () => {
  if (!PLAUSIBLE_DOMAIN) return;
  if (document.querySelector('script[data-msa="plausible"]')) return;
  const script = document.createElement("script");
  script.src = "https://plausible.io/js/script.js";
  script.defer = true;
  script.setAttribute("data-domain", PLAUSIBLE_DOMAIN);
  script.setAttribute("data-msa", "plausible");
  script.onerror = () => console.log("Analytics blocked or unavailable");
  document.head.appendChild(script);
};

const loadGa = () => {
  if (!GA_ID || typeof window === "undefined") return;
  if (typeof window.gtag === "function") return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.setAttribute("data-msa", "ga4");
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
};

const loadClarity = () => {
  if (!CLARITY_ID || typeof window === "undefined") return;
  if (typeof window.clarity === "function") return;

  const w = window as unknown as {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  };

  const clarityFn = (...args: unknown[]) => {
    const q = (clarityFn as any).q || ((clarityFn as any).q = []);
    q.push(args);
  };

  w.clarity = clarityFn;

  const script = document.createElement("script");
  script.async = true;
  script.setAttribute("data-msa", "clarity");
  script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);
};

const hasConsent = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
};

const getRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const getRequestMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  const requestMethod = typeof Request !== "undefined" && input instanceof Request ? input.method : undefined;
  return (init?.method || requestMethod || "GET").toUpperCase();
};

const parseCheckoutContext = (init?: RequestInit): CheckoutContext => {
  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  return {
    plan: body.plan === "pro" ? "pro" : undefined,
    billing: body.billing === "yearly" ? "yearly" : "monthly",
    referral_applied: Boolean(body.referralCode),
    startedAt: Date.now(),
  };
};

const checkoutEventProps = (context: CheckoutContext | null) => {
  if (!context) return {};
  return {
    plan: context.plan,
    billing: context.billing,
    referral_applied: context.referral_applied,
  };
};

const storeCheckoutContext = (context: CheckoutContext) => {
  try {
    sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Funnel tracking remains best-effort when storage is unavailable.
  }
};

const clearCheckoutContext = () => {
  try {
    sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
  } catch {
    // Ignore storage failures.
  }
};

const readCheckoutContext = (): CheckoutContext | null => {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_CONTEXT_KEY);
    if (!raw) return null;
    const context = JSON.parse(raw) as CheckoutContext;
    if (!context?.startedAt || Date.now() - context.startedAt > CHECKOUT_CONTEXT_TTL_MS) {
      clearCheckoutContext();
      return null;
    }
    return context;
  } catch {
    return null;
  }
};

export default function AnalyticsLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(false);

  const currentPath = useMemo(() => {
    const search = searchParams?.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const initialize = () => {
      if (!hasConsent()) return;
      loadPlausible();
      loadGa();
      loadClarity();
      initializePostHog();
      captureMarketingAttribution();
      setEnabled(true);
    };

    initialize();

    const handleConsent = () => initialize();
    const swallowPlausibleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes("plausible")) {
        event.preventDefault();
      }
    };

    window.addEventListener("storage", handleConsent);
    window.addEventListener("msp-consent-accepted", handleConsent);
    window.addEventListener("unhandledrejection", swallowPlausibleRejection);

    return () => {
      window.removeEventListener("storage", handleConsent);
      window.removeEventListener("msp-consent-accepted", handleConsent);
      window.removeEventListener("unhandledrejection", swallowPlausibleRejection);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    captureMarketingAttribution();
    trackPageView(currentPath || "/");
  }, [currentPath, enabled]);

  useEffect(() => {
    if (!enabled || pathname !== "/pricing") return;

    trackEvent("pricing_viewed", { path: currentPath || "/pricing" });

    const pendingCheckout = readCheckoutContext();
    if (pendingCheckout) {
      trackEvent("checkout_cancelled", checkoutEventProps(pendingCheckout));
      clearCheckoutContext();
    }
  }, [enabled, pathname, currentPath]);

  useEffect(() => {
    if (!enabled) return;

    const originalFetch = window.fetch;

    window.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [input, init] = args;
      const requestUrl = getRequestUrl(input);
      const requestMethod = getRequestMethod(input, init);
      const isCheckout = requestMethod === "POST" && requestUrl.includes("/api/payments/checkout");
      const isCheckoutConfirm = requestUrl.includes("/api/stripe/confirm");
      const checkoutContext = isCheckout ? parseCheckoutContext(init) : null;

      if (checkoutContext) {
        storeCheckoutContext(checkoutContext);
        trackEvent("checkout_started", checkoutEventProps(checkoutContext));
      }

      try {
        const response = await originalFetch(...args);

        if (isCheckout && !response.ok) {
          trackEvent("checkout_failed", {
            ...checkoutEventProps(checkoutContext),
            status_code: response.status,
          });
          clearCheckoutContext();
        }

        if (isCheckoutConfirm && response.ok) {
          const completedCheckout = readCheckoutContext();
          if (completedCheckout) {
            trackEvent("subscription_started", {
              ...checkoutEventProps(completedCheckout),
              confirmation: "stripe_confirm",
            });
            clearCheckoutContext();
          }
        }

        return response;
      } catch (error) {
        if (isCheckout) {
          trackEvent("checkout_failed", {
            ...checkoutEventProps(checkoutContext),
            network_error: true,
          });
          clearCheckoutContext();
        }
        throw error;
      }
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, [enabled]);

  return null;
}
