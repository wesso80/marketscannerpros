/**
 * lib/discord-bridge.ts — MSP → Discord Command Center bridge.
 *
 * Posts rich embeds to per-channel Discord webhooks.
 * Each channel_key maps to a row in discord_bridge_channels with its own
 * webhook URL, cooldown, and enable/disable toggle.
 *
 * Usage:
 *   import { postToDiscord } from '@/lib/discord-bridge';
 *   await postToDiscord('msp-scanner', { ... });
 */

import { q } from './db';

/* ── Types ─────────────────────────────────────────────────────────────── */

export type ChannelKey =
  | 'msp-dashboard'
  | 'msp-scanner'
  | 'golden-egg'
  | 'trade-terminal'
  | 'market-explorer'
  | 'research'
  | 'workspace'
  | 'volatility-engine'
  | 'time-confluence'
  | 'market-pressure'
  | 'confluence-engine'
  | 'msp-alerts'
  | 'breakout-watch'
  | 'trap-detection'
  | 'ai-analyst'
  | 'trade-reviews';

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
  thumbnail?: { url: string };
  url?: string;
}

export interface DiscordPost {
  content?: string;          // Plain text above the embed
  embeds?: DiscordEmbed[];   // Rich embed(s)
  username?: string;         // Override webhook display name
  avatar_url?: string;       // Override webhook avatar
}

interface ChannelRow {
  id: number;
  channel_key: string;
  webhook_url: string | null;
  enabled: boolean;
  cooldown_minutes: number;
  last_posted_at: string | null;
}

/* ── Branding constants ────────────────────────────────────────────────── */

const MSP_GREEN  = 0x10B981;
const MSP_GOLD   = 0xF59E0B;
const MSP_RED    = 0xEF4444;
const MSP_BLUE   = 0x3B82F6;
const MSP_PURPLE = 0x8B5CF6;
const MSP_CYAN   = 0x06B6D4;

const AVATAR_URL = 'https://app.marketscannerpros.app/favicon-192x192.png';
const BOT_NAME   = 'MSP Command Center';
const APP_BASE   = 'https://app.marketscannerpros.app';

const CHANNEL_META: Record<string, { emoji: string; color: number; label: string }> = {
  'msp-dashboard':     { emoji: '🧠', color: MSP_GREEN,  label: 'Dashboard' },
  'msp-scanner':       { emoji: '🔎', color: MSP_BLUE,   label: 'Scanner' },
  'golden-egg':        { emoji: '🥇', color: MSP_GOLD,   label: 'Golden Egg' },
  'trade-terminal':    { emoji: '💻', color: MSP_CYAN,   label: 'Terminal' },
  'market-explorer':   { emoji: '🌍', color: MSP_BLUE,   label: 'Explorer' },
  'research':          { emoji: '📰', color: MSP_PURPLE, label: 'Research' },
  'workspace':         { emoji: '🧾', color: MSP_GREEN,  label: 'Workspace' },
  'volatility-engine': { emoji: '🌪️', color: MSP_RED,    label: 'DVE' },
  'time-confluence':   { emoji: '⏱️', color: MSP_CYAN,   label: 'Time Confluence' },
  'market-pressure':   { emoji: '🧲', color: MSP_PURPLE, label: 'MPE' },
  'confluence-engine':  { emoji: '🧬', color: MSP_GOLD,   label: 'Confluence' },
  'msp-alerts':        { emoji: '🚨', color: MSP_RED,    label: 'Alert' },
  'breakout-watch':    { emoji: '👀', color: MSP_GOLD,   label: 'Breakout Watch' },
  'trap-detection':    { emoji: '⚠️', color: MSP_RED,    label: 'Trap Detection' },
  'ai-analyst':        { emoji: '🧠', color: MSP_PURPLE, label: 'AI Analyst' },
  'trade-reviews':     { emoji: '📈', color: MSP_GREEN,  label: 'Trade Review' },
};

/* ── Schema bootstrap ──────────────────────────────────────────────────── */

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await q(`
    CREATE TABLE IF NOT EXISTS discord_bridge_channels (
      id SERIAL PRIMARY KEY,
      channel_key VARCHAR(60) NOT NULL UNIQUE,
      label VARCHAR(120) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'core',
      webhook_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT false,
      cooldown_minutes INTEGER NOT NULL DEFAULT 15,
      last_posted_at TIMESTAMPTZ,
      post_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady = true;
}

/* ── Core posting function ─────────────────────────────────────────────── */

/**
 * Post a message to a Discord channel via the bridge.
 * Returns true if posted, false if skipped (disabled/cooldown/no webhook).
 * Never throws — failures are logged silently.
 */
export async function postToDiscord(
  channelKey: ChannelKey,
  post: DiscordPost,
  options?: { forceSend?: boolean }
): Promise<boolean> {
  try {
    await ensureSchema();

    const rows = await q<ChannelRow>(
      `SELECT id, channel_key, webhook_url, enabled, cooldown_minutes, last_posted_at
       FROM discord_bridge_channels
       WHERE channel_key = $1
       LIMIT 1`,
      [channelKey]
    );

    const channel = rows[0];
    if (!channel?.webhook_url || !channel.enabled) return false;

    // Cooldown check
    if (!options?.forceSend && channel.last_posted_at) {
      const elapsed = Date.now() - new Date(channel.last_posted_at).getTime();
      if (elapsed < channel.cooldown_minutes * 60_000) return false;
    }

    // Apply MSP branding defaults
    const body: DiscordPost = {
      username: post.username || BOT_NAME,
      avatar_url: post.avatar_url || AVATAR_URL,
      ...post,
    };

    // Inject footer into first embed if present
    if (body.embeds?.[0] && !body.embeds[0].footer) {
      const meta = CHANNEL_META[channelKey];
      body.embeds[0].footer = {
        text: `MSP ${meta?.label || channelKey} • Educational analysis only`,
      };
      if (!body.embeds[0].timestamp) {
        body.embeds[0].timestamp = new Date().toISOString();
      }
    }

    const res = await fetch(channel.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[discord-bridge] ${channelKey} webhook ${res.status}`);
      return false;
    }

    // Update stats
    await q(
      `UPDATE discord_bridge_channels
       SET last_posted_at = NOW(), post_count = post_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [channel.id]
    ).catch(() => {});

    return true;
  } catch (err) {
    console.error(`[discord-bridge] ${channelKey} error:`, err);
    return false;
  }
}

/* ── Pre-built embed builders ──────────────────────────────────────────── */

/** Scanner top picks */
export function buildScannerEmbed(picks: Array<{
  symbol: string;
  score: number;
  side: string;
  rsi?: number;
  adx?: number;
  squeeze?: boolean;
}>): DiscordPost {
  const fields: DiscordEmbedField[] = picks.slice(0, 10).map((p, i) => ({
    name: `${i + 1}. ${p.symbol}`,
    value: [
      `**${p.side.toUpperCase()}** • Score: ${p.score}/100`,
      p.rsi != null ? `RSI ${Number(p.rsi).toFixed(1)}` : null,
      p.adx != null ? `ADX ${Number(p.adx).toFixed(1)}` : null,
      p.squeeze ? '🔥 Squeeze' : null,
    ].filter(Boolean).join(' | '),
    inline: true,
  }));

  return {
    embeds: [{
      title: '🔎 Scanner — Top Setups',
      description: `${picks.length} high-confluence setup${picks.length !== 1 ? 's' : ''} detected across all markets.`,
      color: MSP_BLUE,
      fields,
      url: `${APP_BASE}/tools/scanner`,
    }],
  };
}

/** Golden Egg verdict */
export function buildGoldenEggEmbed(egg: {
  symbol: string;
  verdict: 'TRADE' | 'WATCH' | 'NO TRADE';
  bias: string;
  confluenceScore: number;
  reasoning: string;
  entry?: number;
  stop?: number;
  target?: number;
}): DiscordPost {
  const verdictColors: Record<string, number> = {
    'TRADE': MSP_GREEN,
    'WATCH': MSP_GOLD,
    'NO TRADE': MSP_RED,
  };

  const verdictEmoji: Record<string, string> = {
    'TRADE': '🟢',
    'WATCH': '🟡',
    'NO TRADE': '🔴',
  };

  const fields: DiscordEmbedField[] = [
    { name: 'Verdict', value: `${verdictEmoji[egg.verdict] || '⬜'} **${egg.verdict}**`, inline: true },
    { name: 'Bias', value: egg.bias, inline: true },
    { name: 'Confluence', value: `${egg.confluenceScore}/100`, inline: true },
  ];

  if (egg.entry != null) fields.push({ name: 'Entry', value: `$${egg.entry}`, inline: true });
  if (egg.stop != null)  fields.push({ name: 'Stop', value: `$${egg.stop}`, inline: true });
  if (egg.target != null) fields.push({ name: 'Target', value: `$${egg.target}`, inline: true });

  return {
    embeds: [{
      title: `🥇 Golden Egg — ${egg.symbol}`,
      description: egg.reasoning.slice(0, 300),
      color: verdictColors[egg.verdict] || MSP_GOLD,
      fields,
      url: `${APP_BASE}/tools/golden-egg`,
    }],
  };
}

/** Volatility Engine state change */
export function buildVolatilityEmbed(state: {
  symbol: string;
  regime: string;
  squeeze: boolean;
  expansionPhase?: string;
  bbWidth?: number;
  atr?: number;
}): DiscordPost {
  const stateEmoji: Record<string, string> = {
    compression: '🔵',
    expansion: '🔴',
    exhaustion: '🟡',
    breakout: '🟢',
  };

  return {
    embeds: [{
      title: `🌪️ DVE — ${state.symbol}`,
      description: `Volatility regime: **${state.regime.toUpperCase()}** ${stateEmoji[state.regime] || '⬜'}`,
      color: state.squeeze ? MSP_RED : MSP_CYAN,
      fields: [
        { name: 'Regime', value: state.regime, inline: true },
        { name: 'Squeeze', value: state.squeeze ? '🔥 Active' : 'Inactive', inline: true },
        state.expansionPhase ? { name: 'Phase', value: state.expansionPhase, inline: true } : null,
        state.bbWidth != null ? { name: 'BB Width', value: state.bbWidth.toFixed(4), inline: true } : null,
        state.atr != null ? { name: 'ATR', value: state.atr.toFixed(2), inline: true } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/tools/terminal`,
    }],
  };
}

/** Market Pressure imbalance */
export function buildPressureEmbed(pressure: {
  symbol: string;
  buyPressure: number;
  sellPressure: number;
  netPressure: number;
  imbalance: string;
}): DiscordPost {
  const isAbsorption = pressure.imbalance === 'absorption';
  return {
    embeds: [{
      title: `🧲 MPE — ${pressure.symbol}`,
      description: `Pressure imbalance: **${pressure.imbalance.toUpperCase()}**`,
      color: pressure.netPressure > 0 ? MSP_GREEN : MSP_RED,
      fields: [
        { name: 'Buy Pressure', value: `${pressure.buyPressure.toFixed(1)}%`, inline: true },
        { name: 'Sell Pressure', value: `${pressure.sellPressure.toFixed(1)}%`, inline: true },
        { name: 'Net', value: `${pressure.netPressure > 0 ? '+' : ''}${pressure.netPressure.toFixed(1)}%`, inline: true },
        { name: 'Signal', value: isAbsorption ? '🧱 Absorption detected' : '⚡ Directional shift', inline: false },
      ],
      url: `${APP_BASE}/tools/terminal`,
    }],
  };
}

/** Time Confluence macro pivot */
export function buildTimeConfluenceEmbed(pivot: {
  assetClass: string;
  nextDate: string;
  daysAway: number;
  closingCandles: string[];
}): DiscordPost {
  return {
    embeds: [{
      title: `⏱️ Macro Pivot — ${pivot.assetClass.toUpperCase()}`,
      description: `Next major macro confluence: **${pivot.nextDate}** (${pivot.daysAway === 0 ? 'TODAY' : `${pivot.daysAway}d`})`,
      color: pivot.daysAway === 0 ? MSP_RED : MSP_CYAN,
      fields: [
        { name: 'Asset Class', value: pivot.assetClass, inline: true },
        { name: 'Days Away', value: pivot.daysAway === 0 ? '🔴 TODAY' : `${pivot.daysAway}d`, inline: true },
        { name: 'Candles Closing', value: pivot.closingCandles.join(', ') || 'None', inline: false },
      ],
      url: `${APP_BASE}/tools/terminal`,
    }],
  };
}

/** Confluence Engine score */
export function buildConfluenceEmbed(result: {
  symbol: string;
  score: number;
  components: { structure?: number; volatility?: number; time?: number; participation?: number };
}): DiscordPost {
  const tier = result.score >= 80 ? 'ELITE' : result.score >= 60 ? 'HIGH' : result.score >= 40 ? 'MODERATE' : 'LOW';
  const color = result.score >= 80 ? MSP_GREEN : result.score >= 60 ? MSP_GOLD : result.score >= 40 ? MSP_CYAN : MSP_RED;

  return {
    embeds: [{
      title: `🧬 Confluence — ${result.symbol}`,
      description: `Composite score: **${result.score}/100** (${tier})`,
      color,
      fields: [
        result.components.structure != null ? { name: 'Structure', value: `${result.components.structure}/100`, inline: true } : null,
        result.components.volatility != null ? { name: 'Volatility', value: `${result.components.volatility}/100`, inline: true } : null,
        result.components.time != null ? { name: 'Timing', value: `${result.components.time}/100`, inline: true } : null,
        result.components.participation != null ? { name: 'Participation', value: `${result.components.participation}/100`, inline: true } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/tools/terminal`,
    }],
  };
}

/** High-quality alert trigger */
export function buildAlertEmbed(alert: {
  symbol: string;
  condition: string;
  triggeredAt: string;
  confluenceScore?: number;
  volatilityState?: string;
}): DiscordPost {
  return {
    embeds: [{
      title: `🚨 Alert Triggered — ${alert.symbol}`,
      description: alert.condition,
      color: MSP_RED,
      fields: [
        { name: 'Triggered', value: new Date(alert.triggeredAt).toLocaleString('en-US', { timeZone: 'America/New_York' }), inline: true },
        alert.confluenceScore != null ? { name: 'Confluence', value: `${alert.confluenceScore}/100`, inline: true } : null,
        alert.volatilityState ? { name: 'Vol State', value: alert.volatilityState, inline: true } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/tools/alerts`,
    }],
  };
}

/** Breakout watch */
export function buildBreakoutEmbed(setup: {
  symbol: string;
  level: number;
  distance: string;
  direction: 'up' | 'down';
  timeframe?: string;
}): DiscordPost {
  return {
    embeds: [{
      title: `👀 Breakout Watch — ${setup.symbol}`,
      description: `Approaching key ${setup.direction === 'up' ? 'resistance' : 'support'} at **$${setup.level}** (${setup.distance})`,
      color: MSP_GOLD,
      fields: [
        { name: 'Direction', value: setup.direction === 'up' ? '🟢 Upside' : '🔴 Downside', inline: true },
        { name: 'Level', value: `$${setup.level}`, inline: true },
        { name: 'Distance', value: setup.distance, inline: true },
        setup.timeframe ? { name: 'Timeframe', value: setup.timeframe, inline: true } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/tools/scanner`,
    }],
  };
}

/** Trap detection */
export function buildTrapEmbed(trap: {
  symbol: string;
  type: 'bull_trap' | 'bear_trap' | 'fakeout' | 'exhaustion' | 'liquidity_grab';
  description: string;
  severity: 'high' | 'medium' | 'low';
}): DiscordPost {
  const labels: Record<string, string> = {
    bull_trap: '🐂 Bull Trap',
    bear_trap: '🐻 Bear Trap',
    fakeout: '🎭 Fakeout',
    exhaustion: '😤 Exhaustion',
    liquidity_grab: '💰 Liquidity Grab',
  };

  return {
    embeds: [{
      title: `⚠️ Trap — ${trap.symbol}`,
      description: trap.description.slice(0, 300),
      color: trap.severity === 'high' ? MSP_RED : trap.severity === 'medium' ? MSP_GOLD : MSP_CYAN,
      fields: [
        { name: 'Type', value: labels[trap.type] || trap.type, inline: true },
        { name: 'Severity', value: trap.severity.toUpperCase(), inline: true },
      ],
      url: `${APP_BASE}/tools/terminal`,
    }],
  };
}

/** Research / catalyst event */
export function buildResearchEmbed(event: {
  title: string;
  summary: string;
  impact: 'high' | 'medium' | 'low';
  symbols?: string[];
  source?: string;
}): DiscordPost {
  const impactEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

  return {
    embeds: [{
      title: `📰 ${event.title}`,
      description: event.summary.slice(0, 400),
      color: event.impact === 'high' ? MSP_RED : event.impact === 'medium' ? MSP_GOLD : MSP_GREEN,
      fields: [
        { name: 'Impact', value: `${impactEmoji[event.impact]} ${event.impact.toUpperCase()}`, inline: true },
        event.symbols?.length ? { name: 'Symbols', value: event.symbols.join(', '), inline: true } : null,
        event.source ? { name: 'Source', value: event.source, inline: true } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/tools/research`,
    }],
  };
}

/** Daily market regime summary (dashboard channel) */
export function buildDashboardEmbed(regime: {
  status: string;
  bias: string;
  riskLevel: string;
  topOpportunity?: string;
  activeAlerts: number;
  confluenceHigh: number;
}): DiscordPost {
  const riskColors: Record<string, number> = {
    low: MSP_GREEN,
    moderate: MSP_GOLD,
    high: MSP_RED,
    extreme: MSP_RED,
  };

  return {
    embeds: [{
      title: `🧠 Daily Market Regime`,
      description: `Market status: **${regime.status}** | Bias: **${regime.bias}**`,
      color: riskColors[regime.riskLevel] || MSP_BLUE,
      fields: [
        { name: 'Risk Level', value: regime.riskLevel.toUpperCase(), inline: true },
        { name: 'High Confluence', value: `${regime.confluenceHigh} setups`, inline: true },
        { name: 'Active Alerts', value: `${regime.activeAlerts}`, inline: true },
        regime.topOpportunity ? { name: 'Top Opportunity', value: regime.topOpportunity, inline: false } : null,
      ].filter(Boolean) as DiscordEmbedField[],
      url: `${APP_BASE}/dashboard`,
    }],
  };
}

/** AI Analyst breakdown */
export function buildAIAnalystEmbed(analysis: {
  symbol: string;
  question: string;
  summary: string;
}): DiscordPost {
  return {
    embeds: [{
      title: `🧠 AI Analysis — ${analysis.symbol}`,
      description: analysis.summary.slice(0, 500),
      color: MSP_PURPLE,
      fields: [
        { name: 'Query', value: analysis.question.slice(0, 200), inline: false },
      ],
      url: `${APP_BASE}/tools/ai-analyst`,
    }],
  };
}

/* ── Admin helpers ─────────────────────────────────────────────────────── */

export interface BridgeChannelConfig {
  id: number;
  channel_key: string;
  label: string;
  category: string;
  webhook_url: string | null;
  enabled: boolean;
  cooldown_minutes: number;
  last_posted_at: string | null;
  post_count: number;
}

/** List all bridge channel configs */
export async function listBridgeChannels(): Promise<BridgeChannelConfig[]> {
  await ensureSchema();
  return q<BridgeChannelConfig>(
    `SELECT id, channel_key, label, category, webhook_url, enabled, cooldown_minutes, last_posted_at, post_count
     FROM discord_bridge_channels
     ORDER BY category, channel_key`
  );
}

/** Update a channel's webhook config */
export async function updateBridgeChannel(
  channelKey: string,
  update: { webhook_url?: string | null; enabled?: boolean; cooldown_minutes?: number }
): Promise<void> {
  await ensureSchema();
  const sets: string[] = [];
  const params: (string | boolean | number)[] = [];
  let idx = 1;

  if (update.webhook_url !== undefined) {
    sets.push(`webhook_url = $${idx++}`);
    params.push(update.webhook_url || '');
  }
  if (update.enabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    params.push(update.enabled);
  }
  if (update.cooldown_minutes !== undefined) {
    sets.push(`cooldown_minutes = $${idx++}`);
    params.push(update.cooldown_minutes);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = NOW()');
  params.push(channelKey);

  await q(
    `UPDATE discord_bridge_channels SET ${sets.join(', ')} WHERE channel_key = $${idx}`,
    params
  );
}

/** Send a test message to a channel.
 *  If webhookUrl is provided, posts directly to that URL (no DB lookup).
 *  This lets users test before saving. */
export async function testBridgeChannel(
  channelKey: ChannelKey,
  webhookUrl?: string
): Promise<boolean> {
  const meta = CHANNEL_META[channelKey] || { emoji: '📡', color: MSP_GREEN, label: channelKey };

  const embed: DiscordPost = {
    username: BOT_NAME,
    avatar_url: AVATAR_URL,
    embeds: [{
      title: `${meta.emoji} ${meta.label} — Connection Test`,
      description: 'MSP Command Center bridge is connected and active.',
      color: meta.color,
      fields: [
        { name: 'Channel', value: channelKey, inline: true },
        { name: 'Status', value: '✅ Connected', inline: true },
      ],
      footer: { text: `MSP ${meta.label} • Educational analysis only` },
      timestamp: new Date().toISOString(),
    }],
  };

  // If a URL is provided directly, post to it without DB lookup
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Fallback: use saved DB config via postToDiscord
  return postToDiscord(channelKey, embed, { forceSend: true });
}
