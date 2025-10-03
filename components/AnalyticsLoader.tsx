"use client";
import { useEffect } from "react";

export default function AnalyticsLoader() {
  useEffect(() => {
    try {
      const consent = localStorage.getItem("msp-consent");
      const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
      if (consent === "accepted" && domain) {
        if (!document.querySelector('script[data-msa="plausible"]')) {
          const s = document.createElement("script");
          s.src = "https://plausible.io/js/script.js";
          s.defer = true;
          s.setAttribute("data-domain", domain);
          s.setAttribute("data-msa", "plausible");
          s.onerror = () => console.log("Analytics blocked or unavailable");
          document.head.appendChild(s);
        }
      }
      
      window.addEventListener('unhandledrejection', (event) => {
        if (event.reason?.message?.includes('plausible')) {
          event.preventDefault();
        }
      });
    } catch {}
  }, []);

  return null;
}
