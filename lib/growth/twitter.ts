/**
 * X (Twitter) v2 client for the Growth Command Centre.
 *
 * STATUS: STUB (feature-gated). Until X_API_ENABLED=true and credentials are
 * configured, publish requests return a structured "not-enabled" response
 * so the rest of the pipeline (approval, compliance, queue) is testable
 * end-to-end without keys.
 *
 * ENV REQUIRED to go live:
 *   X_API_ENABLED            — "true" to enable real publishing
 *   X_BEARER_TOKEN           — app-only bearer (read-only ops)
 *   X_OAUTH_CLIENT_ID        — OAuth 2.0 user-context client id
 *   X_OAUTH_CLIENT_SECRET    — OAuth 2.0 client secret
 *   X_OAUTH_ACCESS_TOKEN     — OAuth 2.0 user access token (per the MSP X account)
 *   X_OAUTH_REFRESH_TOKEN    — refresh token, rotated by us
 *
 * Endpoint: POST https://api.twitter.com/2/tweets
 * Docs:     https://docs.x.com/x-api/posts/creation-of-a-post
 */

export interface XPublishInput {
  text: string;                  // ≤ 280 chars
  replyToId?: string;            // for threads
}

export interface XPublishResult {
  ok: boolean;
  externalId?: string;           // tweet id
  externalUrl?: string;
  enabled: boolean;
  error?: string;
  rateLimited?: boolean;
  retryAfterSec?: number;
}

const ENDPOINT = 'https://api.twitter.com/2/tweets';

export function isXEnabled(): boolean {
  return process.env.X_API_ENABLED === 'true' && Boolean(process.env.X_OAUTH_ACCESS_TOKEN);
}

export async function publishToX(input: XPublishInput): Promise<XPublishResult> {
  if (!isXEnabled()) {
    return {
      ok: false,
      enabled: false,
      error: 'X integration is disabled. Set X_API_ENABLED=true and X_OAUTH_ACCESS_TOKEN to publish.',
    };
  }

  if (input.text.length > 280) {
    return { ok: false, enabled: true, error: `text is ${input.text.length} chars; X limit is 280.` };
  }

  const body: Record<string, unknown> = { text: input.text };
  if (input.replyToId) {
    body.reply = { in_reply_to_tweet_id: input.replyToId };
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.X_OAUTH_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, enabled: true, error: `network error: ${(err as Error).message}` };
  }

  if (res.status === 429) {
    const retry = parseInt(res.headers.get('x-rate-limit-reset') ?? '0', 10);
    const retryAfterSec = retry > 0 ? Math.max(0, retry - Math.floor(Date.now() / 1000)) : 60;
    return { ok: false, enabled: true, rateLimited: true, retryAfterSec, error: 'rate limited by X' };
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => '');
    }
    return { ok: false, enabled: true, error: `X API error ${res.status}: ${detail.slice(0, 400)}` };
  }

  const payload = (await res.json()) as { data?: { id?: string } };
  const id = payload.data?.id;
  if (!id) {
    return { ok: false, enabled: true, error: 'X API success but no tweet id in response.' };
  }

  return {
    ok: true,
    enabled: true,
    externalId: id,
    externalUrl: `https://x.com/i/web/status/${id}`,
  };
}
