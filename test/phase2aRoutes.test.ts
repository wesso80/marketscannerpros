import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import config from "../next.config.mjs";
import { PUBLIC_DESTINATIONS } from "@/lib/publicDesign";
import { areaLinks } from "@/lib/toolWorkflows";
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

it("every seven-group navigation destination resolves directly without duplicate destinations or dead links", async () => {
  const redirects = await config.redirects();
  const links = Object.values(areaLinks)
    .flat()
    .map((link) => link.href);
  expect(new Set(links).size).toBe(links.length);
  for (const href of links) {
    const pathname = href.split("?")[0];
    expect(["/tools/workflow", "/login", "/auth/login"]).not.toContain(
      pathname,
    );
    expect(
      redirects.find((rule) => rule.source === pathname),
      href,
    ).toBeUndefined();
    expect(
      existsSync(path.join(process.cwd(), "app", pathname, "page.tsx")),
      href,
    ).toBe(true);
  }
});

it.each([
  ["/tools/crypto-terminal", "/tools/terminal?tab=crypto-terminal"],
  ["/tools/journal", "/tools/workspace?tab=Journal"],
  ["/v2/scanner", "/tools/scanner"],
  ["/v2", "/tools/dashboard"],
  ["/tools/options-terminal", "/tools/options"],
  ["/tools/gainers-losers", "/tools/explorer?tab=movers"],
  ["/tools/heatmap", "/tools/explorer?tab=heatmap"],
  ["/tools/markets", "/tools/explorer"],
  ["/tools/earnings", "/tools/research?tab=earnings"],
  ["/tools/earnings-calendar", "/tools/research?tab=earnings"],
  ["/tools/ai-analyst", "/tools/scanner"],
  ["/tools/crypto-time-confluence", "/tools/terminal?tab=time-confluence"],
  ["/tools/watchlists", "/tools/workspace?tab=Watchlists"],
  ["/tools/backtest", "/tools/workspace?tab=Backtest"],
  ["/tools/settings", "/tools/workspace?tab=Settings"],
  ["/tools/scanner/backtest", "/tools/workspace?tab=Backtest"],
])(
  "retired implementation %s retains its existing redirect to %s",
  async (source, destination) => {
    expect(
      existsSync(path.join(process.cwd(), "app", source, "page.tsx")),
    ).toBe(false);
    expect(await config.redirects()).toContainEqual({
      source,
      destination,
      permanent: true,
    });
    expect(
      existsSync(
        path.join(process.cwd(), "app", destination.split("?")[0], "page.tsx"),
      ),
    ).toBe(true);
  },
);

const pageRedirects = [
  [() => import("../app/resources/page"), "/guide"],
  [
    () => import("../app/resources/platform-guide/page"),
    "/guide?section=platform-guide#platform-guide",
  ],
  [
    () => import("../app/resources/trading-guides/page"),
    "/guide?section=research-guides#research-guides",
  ],
  [() => import("../app/tools/desktop-app/page"), "/tools"],
  [() => import("../app/legal/privacy/page"), "/privacy"],
  [() => import("../app/legal/terms/page"), "/terms"],
  [() => import("../app/legal/cookie-policy/page"), "/cookie-policy"],
  [() => import("../app/legal/refund-policy/page"), "/refund-policy"],
] as const;
it.each(pageRedirects)(
  "legacy page redirects visitors to its canonical destination",
  async (load, destination) => {
    const page = await load();
    expect(() => page.default()).toThrow(`REDIRECT:${destination}`);
  },
);

it("preserves the shared v2 library and embedded pages while retiring the middleware-shadowed quant page", () => {
  expect(existsSync("app/v2/_lib/api.ts")).toBe(true);
  for (const route of [
    "macro",
    "news",
    "economic-calendar",
    "market-movers",
    "company-overview",
    "commodities",
    "portfolio",
    "alerts",
  ]) {
    expect(existsSync(`app/tools/${route}/page.tsx`)).toBe(true);
  }
  expect(existsSync("app/quant/page.tsx")).toBe(false);
  const middleware = readFileSync("middleware.ts", "utf8");
  expect(middleware).toContain("pathname.startsWith('/quant')");
  expect(middleware).toContain("'/admin/quant'");
});

it('accounts for every current public static content route in the seven-group map', async () => {
  const { readdirSync } = await import('node:fs');
  const paths = new Set([...Object.values(areaLinks).flat(), ...PUBLIC_DESTINATIONS].map(link => link.href.split('?')[0]));
  const redirects = new Set((await config.redirects()).map(rule => rule.source));
  // /tools/signal-accuracy stays reachable by URL and off the menus until labelled results exist.
  const intentionallyUnlisted = new Set(['/reviews', '/partners/demo', '/after-checkout', '/auth/verify', '/intelligence/lead-lag', '/intelligence/nq-pressure', '/intelligence/auction', '/intelligence/master', '/intelligence/history', '/tools/signal-accuracy']);
  const pages: string[] = [];
  const walk = (dir: string) => { for (const item of readdirSync(dir, {withFileTypes:true})) { const file=path.join(dir,item.name);if(item.isDirectory()) walk(file);else if(item.name==='page.tsx') pages.push(file); } };
  walk('app');
  for(const file of pages) {
    const route='/' + path.dirname(file).replace(/\\/g, '/').replace(/^app\/?/, '');
    if(/^\/(admin|operator)(\/|$)/.test(route) || route.includes('[') || intentionallyUnlisted.has(route) || redirects.has(route)) continue;
    // Page-level redirects expose no separate content; their destinations are the catalog pages.
    const code=readFileSync(file,'utf8');
    if(/\bredirect\(|router\.replace\(/.test(code)) continue;
    expect(paths.has(route), `Uncatalogued content route: ${route}`).toBe(true);
  }
});
