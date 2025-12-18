"use client";
import { useEffect } from "react";

export default function AppUrlFixer() {
  useEffect(() => {
    const appUrl = "/tools/scanner";
    // Rewrite any stale links
    document.querySelectorAll('a[href="https://your-real-app-url"], a[href="/launch"]').forEach((a) => {
      (a as HTMLAnchorElement).setAttribute("href", appUrl);
      (a as HTMLAnchorElement).setAttribute("target", "_blank");
      (a as HTMLAnchorElement).setAttribute("rel", "noopener");
    });
  }, []);
  return null;
}
