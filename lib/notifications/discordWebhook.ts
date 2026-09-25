/**
 * Posting to a user's own Discord webhook (TR-26).
 *
 * Pure and dependency-free, so the web app, the alert checkers and the
 * notification worker can all share it. Only real Discord webhook URLs are
 * accepted: the server makes this request, so an arbitrary https URL here
 * would let a user point our servers at any host.
 */

const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']);
const WEBHOOK_PATH = /^\/api(?:\/v\d{1,2})?\/webhooks\/\d{5,25}\/[A-Za-z0-9._-]{20,200}\/?$/;
const ALLOWED_QUERY = new Set(['thread_id', 'wait']);
const DISCORD_CONTENT_LIMIT = 2000;

/** Normalised webhook URL, or null when the value isn't a Discord webhook URL. */
export function normalizeDiscordWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!DISCORD_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (!WEBHOOK_PATH.test(url.pathname)) return null;
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) return null;
  }
  const threadId = url.searchParams.get('thread_id');
  if (threadId !== null && !/^\d{5,25}$/.test(threadId)) return null;
  url.hash = '';
  return url.toString();
}

export function isDiscordWebhookUrl(value: unknown): boolean {
  return normalizeDiscordWebhookUrl(value) !== null;
}

export interface DiscordSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * POST a plain message to a Discord webhook. Never throws: callers treat Discord
 * as best-effort so it can't block email or push. Mentions are disabled so an
 * alert name can't ping @everyone, redirects are refused, and the call times out.
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<DiscordSendResult> {
  const url = normalizeDiscordWebhookUrl(webhookUrl);
  if (!url) return { ok: false, error: 'Not a Discord webhook URL' };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const text = content.length > DISCORD_CONTENT_LIMIT ? `${content.slice(0, DISCORD_CONTENT_LIMIT - 1)}…` : content;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: `Discord webhook error ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Discord delivery failed' };
  }
}
