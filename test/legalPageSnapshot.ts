import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import RefundPolicyPage from "../app/refund-policy/page";
import CookiePolicyPage from "../app/cookie-policy/page";
import TermsPage from "../app/terms/page";

export type LegalLink = {
  href: string;
  target: string | null;
  rel: string | null;
  text: string;
};

export type LegalSnapshot = {
  text: string;
  links: LegalLink[];
};

export const LEGAL_PAGES: { slug: string; Page: ComponentType }[] = [
  { slug: "refund-policy", Page: RefundPolicyPage },
  { slug: "cookie-policy", Page: CookiePolicyPage },
  { slug: "terms", Page: TermsPage },
];

export function normalizeLegalText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Visible legal copy and in-body links.
 * Drops the "On this page" menu and the back-to-top control only.
 */
export function snapshotLegalHtml(html: string): LegalSnapshot {
  const { document } = new JSDOM(html).window;
  document.querySelectorAll("[data-legal-chrome]").forEach((node) => node.remove());
  document.querySelectorAll("nav").forEach((nav) => {
    if (normalizeLegalText(nav.textContent || "").includes("On this page")) nav.remove();
  });

  const links = Array.from(document.querySelectorAll("a")).map((anchor) => ({
    href: anchor.getAttribute("href") || "",
    target: anchor.getAttribute("target"),
    rel: anchor.getAttribute("rel"),
    text: normalizeLegalText(anchor.textContent || ""),
  }));

  return {
    text: normalizeLegalText(document.body.textContent || ""),
    links,
  };
}

export function renderLegalSnapshot(Page: ComponentType): LegalSnapshot {
  return snapshotLegalHtml(renderToStaticMarkup(createElement(Page)));
}

export function renderAllLegalSnapshots(): Record<string, LegalSnapshot> {
  return Object.fromEntries(
    LEGAL_PAGES.map(({ slug, Page }) => [slug, renderLegalSnapshot(Page)]),
  );
}

export function diffLegalSnapshots(
  before: LegalSnapshot,
  after: LegalSnapshot,
): string[] {
  const diffs: string[] = [];
  if (before.text !== after.text) {
    diffs.push(`text mismatch\n--- before\n${before.text}\n--- after\n${after.text}`);
  }
  if (JSON.stringify(before.links) !== JSON.stringify(after.links)) {
    diffs.push(
      `link mismatch\n--- before\n${JSON.stringify(before.links, null, 2)}\n--- after\n${JSON.stringify(after.links, null, 2)}`,
    );
  }
  return diffs;
}
