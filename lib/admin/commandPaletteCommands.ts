/**
 * Admin Command Palette — pure command catalog & filter logic.
 *
 * Pure module: no React, no Next.js. Lives in lib/ so it can be unit tested
 * without a DOM. The palette UI imports this list and renders it.
 *
 * BOUNDARY: every command here is a research / analytics / journaling
 * destination. No order routing, no broker actions.
 */

export type CommandCategory =
  | "Research"
  | "Markets"
  | "Risk"
  | "System"
  | "Business"
  | "Action";

export interface AdminCommand {
  /** Stable id (used as React key + for tests). */
  id: string;
  /** Single-letter shortcut when the palette is closed. Optional. */
  shortcut?: string;
  /** Human-readable label shown in the palette. */
  label: string;
  /** Optional supporting text shown under the label. */
  description?: string;
  /** Category bucket for grouping. */
  category: CommandCategory;
  /** Destination route. The palette uses Next.js router.push(). */
  href: string;
  /** Searchable keywords (lowercased on filter). */
  keywords?: string[];
}

export const ADMIN_COMMANDS: AdminCommand[] = [
  // Research
  { id: "cmd:command-center", label: "Command Center", category: "Research", href: "/admin", keywords: ["home", "dashboard"] },
  { id: "cmd:commander", label: "Commander", category: "Research", href: "/admin/commander" },
  { id: "cmd:morning-brief", label: "Morning Brief", category: "Research", href: "/admin/morning-brief" },
  { id: "cmd:operator-terminal", label: "Operator Terminal", category: "Research", href: "/admin/operator-terminal" },
  { id: "cmd:symbol-search", shortcut: "S", label: "Symbol Research", description: "Open canonical symbol research terminal", category: "Research", href: "/admin/symbol/ADA", keywords: ["symbol", "research", "ticker"] },

  // Markets
  { id: "cmd:opportunity-board", shortcut: "O", label: "Opportunity Board", category: "Markets", href: "/admin/opportunity-board", keywords: ["scanner", "ranked"] },
  { id: "cmd:golden-egg", shortcut: "G", label: "Golden Egg", description: "Top conviction research call", category: "Markets", href: "/admin/opportunity-board?focus=golden-egg", keywords: ["top", "conviction"] },
  { id: "cmd:time-confluence", shortcut: "T", label: "Time Confluence", category: "Markets", href: "/admin/symbol/ADA?panel=time-confluence", keywords: ["session", "tof"] },
  { id: "cmd:dve", shortcut: "V", label: "DVE Detail", category: "Markets", href: "/admin/symbol/ADA?panel=dve", keywords: ["volume", "exhaustion"] },
  { id: "cmd:live-scanner", label: "Live Scanner", category: "Markets", href: "/admin/live-scanner" },
  { id: "cmd:scalper", label: "Scalper", category: "Markets", href: "/admin/scalper" },
  { id: "cmd:quant", label: "Quant Terminal", category: "Markets", href: "/admin/quant" },
  { id: "cmd:outcomes", label: "Signal Outcomes", category: "Markets", href: "/admin/outcomes" },
  { id: "cmd:journal-learning", shortcut: "J", label: "Journal Learning", description: "Pattern memory across saved research cases", category: "Markets", href: "/admin/journal-learning", keywords: ["pattern", "dna"] },
  { id: "cmd:backtest-lab", label: "Backtest Lab", category: "Markets", href: "/admin/backtest-lab" },

  // Risk & Alerts
  { id: "cmd:risk", label: "Risk Governor", category: "Risk", href: "/admin/risk" },
  { id: "cmd:alerts", shortcut: "A", label: "Alerts", category: "Risk", href: "/admin/alerts" },
  { id: "cmd:discord", label: "Discord Bridge", category: "Risk", href: "/admin/discord-bridge" },
  { id: "cmd:reporting", label: "Nasdaq Reporting", category: "Risk", href: "/admin/reporting" },

  // System
  { id: "cmd:data-health", shortcut: "D", label: "Data Health", description: "Provider feeds, webhooks, scanners", category: "System", href: "/admin/data-health", keywords: ["diagnostics", "system", "feed"] },
  { id: "cmd:model-diagnostics", label: "Model Diagnostics", description: "Calibration, hit rate, drift", category: "System", href: "/admin/model-diagnostics", keywords: ["model", "ai", "calibration"] },
  { id: "cmd:logs", label: "Logs", category: "System", href: "/admin/logs" },
  { id: "cmd:settings", label: "Settings", category: "System", href: "/admin/settings" },

  // Business
  { id: "cmd:usage-analytics", label: "Usage Analytics", category: "Business", href: "/admin/usage-analytics" },
  { id: "cmd:income", label: "Income", category: "Business", href: "/admin/income" },
  { id: "cmd:costs", label: "AI Costs", category: "Business", href: "/admin/costs" },
  { id: "cmd:subscriptions", label: "Subscriptions", category: "Business", href: "/admin/subscriptions" },
  { id: "cmd:ai-usage", label: "AI Usage", category: "Business", href: "/admin/ai-usage" },
  { id: "cmd:trials", label: "Trials", category: "Business", href: "/admin/trials" },
];

/**
 * Filter the command catalog by free-text query. Empty query returns the
 * full catalog. Match is case-insensitive across label, description, and
 * keywords. Order is preserved — callers may resort if needed.
 */
export function filterAdminCommands(query: string, source: AdminCommand[] = ADMIN_COMMANDS): AdminCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return source.slice();
  const tokens = trimmed.split(/\s+/g).filter(Boolean);
  return source.filter((cmd) => {
    const haystack = [
      cmd.label,
      cmd.description ?? "",
      cmd.category,
      ...(cmd.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

/**
 * Group commands by category, preserving the catalog order within each
 * group. Returns an ordered array of [category, commands] tuples so the
 * UI can render section headers deterministically.
 */
export function groupAdminCommands(commands: AdminCommand[]): Array<[CommandCategory, AdminCommand[]]> {
  const map = new Map<CommandCategory, AdminCommand[]>();
  for (const cmd of commands) {
    const list = map.get(cmd.category) ?? [];
    list.push(cmd);
    map.set(cmd.category, list);
  }
  return Array.from(map.entries());
}

/**
 * Resolve a single-letter shortcut (A..Z) to a command. Case-insensitive.
 * Returns null when no command claims that shortcut. The palette wires
 * this on global keydown so operators can jump anywhere with one key.
 */
export function resolveShortcut(key: string, source: AdminCommand[] = ADMIN_COMMANDS): AdminCommand | null {
  if (!key || key.length !== 1) return null;
  const upper = key.toUpperCase();
  for (const cmd of source) {
    if (cmd.shortcut && cmd.shortcut.toUpperCase() === upper) return cmd;
  }
  return null;
}
