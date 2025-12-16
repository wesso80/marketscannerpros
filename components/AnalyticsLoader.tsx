"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

const CONSENT_KEY = "msp-consent";
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

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
    trackPageView(currentPath || "/");
  }, [currentPath, enabled]);

  return null;
}