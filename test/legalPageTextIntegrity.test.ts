import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  diffLegalSnapshots,
  LEGAL_PAGES,
  renderAllLegalSnapshots,
  type LegalSnapshot,
} from "./legalPageSnapshot";

const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/legal-page-text-baseline.json", import.meta.url), "utf8"),
) as Record<string, LegalSnapshot>;

const TERMS_HEADING_IDS = [
  "eligibility",
  "use",
  "paper",
  "ai",
  "billing",
  "ip",
  "warranty",
  "liability",
  "privacy",
  "termination",
  "governing",
  "disputes",
  "indemnification",
  "changes",
  "contact",
];

describe("legal page text matches the pre-change pages", () => {
  const current = renderAllLegalSnapshots();

  for (const slug of ["refund-policy", "cookie-policy", "terms"] as const) {
    it(`${slug} has zero text or link differences`, () => {
      const diffs = diffLegalSnapshots(baseline[slug], current[slug]);
      if (diffs.length === 0) {
        console.log(
          `${slug}: ZERO differences (text ${current[slug].text.length} chars, ${current[slug].links.length} links)`,
        );
      } else {
        console.log(`${slug}: DIFFERENCES\n${diffs.join("\n\n")}`);
      }
      expect(diffs, diffs.join("\n\n")).toEqual([]);
    });
  }

  it("keeps effective dates and billing amounts", () => {
    expect(current["refund-policy"].text).toContain("Effective Date: 20 December 2025");
    expect(current["cookie-policy"].text).toContain("Effective Date: 7 October 2025");
    expect(current.terms.text).toContain("Effective Date: 13 December 2025");
    expect(current.terms.text).toContain("Free and Pro ($24.99/month or $249/year) plans");
  });
});

describe("legal page navigation chrome", () => {
  for (const { slug, Page } of LEGAL_PAGES) {
    it(`${slug} exposes an On this page menu and no page-local back-to-top`, () => {
      const html = renderToStaticMarkup(createElement(Page));
      const { document } = new JSDOM(html).window;
      const details = document.querySelector("details");
      expect(details).not.toBeNull();
      expect(details?.hasAttribute("open")).toBe(false);
      expect(details?.querySelector("summary")?.textContent).toBe("On this page");

      expect(document.getElementById("legal-top")).toBeNull();
      expect(document.querySelector("[data-legal-chrome='back-to-top']")).toBeNull();
      expect(document.body.textContent).not.toContain("Back to top");
      expect(document.body.textContent).not.toContain("↑ Top");

      const h2s = Array.from(document.querySelectorAll("[data-legal-prose] h2"));
      const ids = h2s.map((heading) => heading.getAttribute("id"));
      expect(ids.every((id) => id && id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);

      for (const nav of Array.from(document.querySelectorAll("[data-legal-chrome='toc'] nav"))) {
        expect(nav.querySelector("p, summary")?.textContent?.trim() || "On this page").toBe(
          "On this page",
        );
        const hrefs = Array.from(nav.querySelectorAll("a")).map((anchor) =>
          anchor.getAttribute("href"),
        );
        expect(hrefs).toEqual(ids.map((id) => `#${id}`));
        const labels = Array.from(nav.querySelectorAll("a")).map((anchor) =>
          anchor.textContent?.replace(/\s+/g, " ").trim(),
        );
        expect(labels).toEqual(
          h2s.map((heading) => heading.textContent?.replace(/\s+/g, " ").trim()),
        );
      }

      if (slug === "terms") expect(ids).toEqual(TERMS_HEADING_IDS);
    });
  }
});
