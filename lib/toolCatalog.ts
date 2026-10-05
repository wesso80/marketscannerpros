import { areaLinks, primaryNavTools } from "./toolWorkflows";
export interface ToolPage {
  key: string; // Stable saved-page identifier.
  href: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  tier?: "free" | "pro";
  /** Shown muted in the menu and All tools. The route still resolves. */
  comingSoon?: boolean;
  /** Retired names matched by All tools search. Not shown in the catalog. */
  aliases?: string[];
}
// Catalog copy/access labels do not grant access; the existing page/API gates remain authoritative.
const metadata: Record<string, Partial<ToolPage>> = {
  "/auth": { description: "Access your account" },
  "/tools/explorer?tab=movers": {
    key: "markets",
    description: "Gainers, losers and activity",
    icon: "MV",
    tier: "free",
  },
  "/tools/explorer?tab=heatmap": {
    key: "heatmap",
    description: "Visual sector and market heatmap",
    icon: "HM",
  },
  "/tools/scanner": {
    key: "scanner",
    description: "Multi-timeframe technical scanner",
    icon: "SC",
  },
  "/tools/terminal?tab=time-confluence": {
    key: "confluence-scanner",
    description: "Timeframe alignment",
    icon: "CF",
    tier: "pro",
  },
  "/tools/golden-egg": {
    key: "golden-egg",
    description: "Single-symbol research",
    icon: "GE",
    tier: "pro",
  },
  "/tools/terminal?tab=time-scanner": {
    key: "time-scanner",
    description: "Time-based research",
    icon: "TM",
    tier: "pro",
  },
  "/tools/signal-accuracy": {
    key: "signal-accuracy",
    description: "Recorded research outcomes",
    icon: "AC",
    tier: "pro",
  },
  "/tools/explorer?tab=crypto-command": {
    key: "crypto",
    description: "Cryptocurrency market overview",
    icon: "CR",
    tier: "pro",
  },
  "/tools/crypto-dashboard": {
    key: "crypto-dashboard",
    description: "Funding rates, open interest, liquidations",
    icon: "DV",
    tier: "pro",
  },
  "/tools/explorer?tab=crypto-intel": {
    key: "crypto-intel",
    description: "GT Score, whale tracker, treasury & crypto news (in Markets)",
    icon: "CI",
    tier: "pro",
  },
  "/tools/options": {
    key: "options-terminal",
    description: "Options chains and context",
    icon: "OT",
    tier: "pro",
  },
  "/tools/research": {
    key: "research",
    description: "News and event research",
    icon: "RS",
    tier: "pro",
  },
  "/tools/terminal": {
    key: "terminal",
    description: "Charts and specialist tabs",
    icon: "TR",
    tier: "free",
  },
  "/tools/explorer": {
    key: "explorer",
    description: "Market summaries and deep views",
    icon: "EX",
    tier: "free",
  },
  "/tools/dashboard?tab=macro": {
    key: "macro",
    description: "Global regime summary",
    icon: "MA",
    tier: "free",
  },
  "/tools/explorer?tab=commodities": {
    key: "commodities",
    description: "Commodity prices and trends",
    icon: "CM",
  },
  "/tools/research?tab=earnings": {
    key: "earnings",
    description: "Company earnings catalysts in Research",
    icon: "ER",
    tier: "pro",
  },
  "/tools/research?tab=calendar": {
    key: "economic-calendar",
    description: "Economic events and indicators calendar",
    icon: "MC",
    tier: "pro",
  },
  "/tools/volatility-engine": {
    key: "volatility-engine",
    description: "Volatility research",
    icon: "VE",
    tier: "pro",
  },
  "/tools/liquidity-sweep": {
    key: "liquidity-sweep",
    description: "Sweep and reclaim research",
    icon: "LS",
    tier: "free",
  },
  "/tools/command-center": {
    key: "command-hub",
    description: "Session overview",
    icon: "CC",
    tier: "free",
  },
  "/tools/workspace?tab=portfolio": {
    key: "portfolio",
    description: "Positions and exposure",
    icon: "PF",
    tier: "free",
  },
  "/tools/workspace?tab=journal": {
    key: "journal",
    description: "Your own trade records",
    icon: "JR",
    tier: "free",
  },
  "/tools/workspace?tab=backtest": {
    key: "backtest",
    description: "Test strategies inside Workspace",
    icon: "BT",
    tier: "pro",
  },
  "/tools/workspace?tab=alerts": {
    key: "alerts",
    description: "Manage condition alerts in Workspace",
    icon: "AL",
  },
  "/tools/workspace?tab=watchlists": {
    key: "watchlists",
    description: "Organise symbol lists in Workspace",
    icon: "WL",
  },
  "/tools/dashboard?tab=pages": {
    key: "dashboard",
    description: "Your saved pages",
    icon: "DB",
  },
  "/tools/explorer?tab=crypto-command&section=heatmap": {
    key: "crypto-heatmap",
    description: "Crypto sector heatmap",
    icon: "CH",
    tier: "pro",
  },
  "/tools/terminal?tab=crypto-terminal": {
    key: "crypto-terminal",
    description: "Crypto derivatives research",
    icon: "CT",
    tier: "pro",
  },
  "/tools/msp-radar": {
    description: "Dated research reports",
    tier: "pro",
  },
  "/tools/scalper": {
    description: "Intraday research",
    tier: "pro",
  },
  "/tools/workspace?tab=learning": {
    description: "Review research process",
    tier: "pro",
  },
  "/tools/start": {
    description: "Saved market summary",
    tier: "free",
  },
  "/daily-pick": {
    description: "Dated daily research",
    tier: "free",
  },
  "/intelligence": {
    description: "Macro research modules",
    tier: "pro",
  },
  "/intelligence/global-m2": {
    description: "Global money supply",
    tier: "pro",
  },
  "/intelligence/fragility": {
    description: "Market fragility research",
    tier: "pro",
  },
  "/intelligence/liquidity": {
    description: "Liquidity transmission",
    tier: "pro",
  },
  "/guide": {
    description: "Tool walkthroughs",
  },
  "/guide/open-interest": {
    description: "Positioning research guide",
  },
  "/methodology": {
    description: "How research is calculated",
  },
  "/blog": {
    description: "Articles and updates",
  },
  "/about": {
    description: "About the platform",
  },
  "/contact": {
    description: "Get in touch",
  },
  "/partners": {
    description: "Partner information",
  },
  "/": {
    description: "Platform introduction",
  },
  "/account": {
    description: "Plan and account details",
  },
  "/pricing": {
    description: "Plans and limits",
  },
  "/tools/referrals": {
    description: "Referral details",
  },
  "/compliance-hub": {
    description: "Research safeguards",
  },
  "/privacy": {
    description: "Privacy policy",
  },
  "/terms": {
    description: "Terms of use",
  },
  "/cookie-policy": {
    description: "Cookie policy",
  },
  "/refund-policy": {
    description: "Refund policy",
  },
  "/disclaimer": {
    description: "Research disclaimer",
  },
  "/tools/workspace?tab=settings": {
    description: "Workspace preferences",
  },
};
const legacySearchNames: Record<string, string[]> = {
  "/tools/golden-egg": ["Golden Egg"],
  "/tools/command-center": ["Command Center"],
};
export const TOOL_CATEGORIES = primaryNavTools.map((group) => group.label);
export const TOOL_CATALOG: ToolPage[] = primaryNavTools.flatMap((group) =>
  areaLinks[group.id]
    .filter((item) => item.href !== "/tools")
    .map((item) => {
      const data = metadata[item.href];
      return {
        key: data?.key ?? item.href,
        href: item.href,
        label:
          group.id === "intelligence" && item.href === "/intelligence"
            ? "Intelligence"
            : item.label,
        description: data?.description ?? "Research tools and reference",
        icon: data?.icon ?? "MSP",
        category: group.label,
        tier: data?.tier ?? "free",
        comingSoon: item.comingSoon,
        aliases: legacySearchNames[item.href],
      };
    }),
);
const legacyKeys: Record<string, string> = {
  "gainers-losers": "markets",
  news: "research",
  "crypto-time-confluence": "confluence-scanner",
  "time-scanner": "confluence-scanner",
  "options-confluence": "options-terminal",
  "options-flow": "options-terminal",
  options: "options-terminal",
  "ai-analyst": "scanner",
  "earnings-calendar": "earnings",
  "command-center": "command-hub",
};
export function getToolByKey(key: string): ToolPage | undefined {
  return TOOL_CATALOG.find(
    (tool) =>
      tool.key === (legacyKeys[key] ?? key) ||
      tool.href === key ||
      tool.href === `/tools/${key}`,
  );
}
export function resolveFavoriteTools(keys: string[]): ToolPage[] {
  return Array.from(
    new Map(
      keys
        .map(getToolByKey)
        .filter((tool): tool is ToolPage => !!tool)
        .map((tool) => [tool.href, tool]),
    ).values(),
  );
}
