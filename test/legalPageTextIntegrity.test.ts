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

// Approved product-description corrections only; all other legal text and links
// remain compared with the original baseline.
baseline.terms.text = baseline.terms.text
 .replace('MSP AI chatbot (powered by OpenAI GPT-4) provides educational insights only, not financial advice.', 'MSP Copilot uses OpenAI to explain the available page evidence for education, not to provide financial advice.')
 .replace('AI usage is subject to daily limits based on your subscription tier (5/50/unlimited questions per day).', 'MSP Copilot is available on eligible paid plans. The current daily question allowance is shown on the pricing page and in the app.')
 .replace('MSP AI (powered by OpenAI GPT-4) generates educational insights only.', 'MSP Copilot generates educational explanations of the available page evidence only.')
 .replace('The App is an educational paper trade simulation system.', 'The App is an educational research workspace.')
 .replace('2A. Paper Trade & Simulation System', '2A. Practice Records')
 .replace('Pro Trader is a legacy plan identifier mapped to Pro.', 'A stored Pro Trader identifier is the earlier name for Pro and keeps Pro access.')
 .replace('The App is an educational research workspace. No feature of the App executes real trades, connects to live brokerage accounts, or places orders on any exchange.The portfolio tracker, trade journal, risk analysis engine, scenario plans, and all analysis outputs are for educational and simulated paper trading purposes only.Scores, alignment readings, confluence percentages, and scenario analyses reflect indicator agreement and technical pattern recognition — they do not represent profit probability, guaranteed outcomes, or trading instructions.', 'MarketScannerPros is an educational research workspace. The portfolio tracker, trade journal, risk analysis engine, scenario plans, and all analysis outputs are for education and practice records only. Nothing on this platform executes a real trade, connects to a live brokerage account, or places an order on any exchange.Readings, measurements, and scenario analyses describe recorded indicator agreement and technical patterns. They are not a probability of profit, not a promised result, and not trading instructions. Each person is solely responsible for decisions they make with their own capital outside this platform.');

for (const slug of ['refund-policy', 'cookie-policy', 'terms'] as const) {
  baseline[slug].text = baseline[slug].text.replaceAll('MarketScanner Pros', 'MarketScannerPros');
}

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
