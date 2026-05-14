/**
 * Buffer publisher for the Growth Command Centre.
 *
 * Buffer is the recommended publisher because it already holds your X / IG
 * OAuth tokens and shows you a queue / calendar UI. Approved posts in MSP's
 * Growth Centre push to Buffer's "Queue" or "Drafts" depending on settings,
 * and you final-approve inside Buffer before they go live.
 *
 * ENV REQUIRED to enable:
 *   BUFFER_ENABLED            — "true" to enable Buffer as the publisher
 *   BUFFER_ACCESS_TOKEN       — personal access token from Buffer dev settings
 *   BUFFER_PROFILE_ID_X       — Buffer profile id for the linked X account
 *   BUFFER_PROFILE_ID_INSTAGRAM — Buffer profile id for the linked IG account
 *   BUFFER_DEFAULT_MODE       — optional: "queue" (default) | "draft" | "now"
 *
 * Endpoint: POST https://api.bufferapp.com/1/updates/create.json
 * Docs:     https://buffer.com/developers/api/updates (legacy v1 endpoint;
 *           still the canonical way to push an update programmatically for
 *           accounts with API access enabled).
 *
 * Modes:
 *   - "draft": post is created in Buffer but requires manual approval in
 *              Buffer's UI before scheduling. This is the safest default for
 *              a compliance-gated pipeline like MSP — final eyes inside
 *              Buffer's queue before anything leaves to X/IG.
 *   - "queue": post is added to the end of Buffer's queue using your schedule.
 *   - "now":   publishes immediately. Do not use without explicit user intent.
 *
 * To find your profile IDs:
 *   curl "https://api.bufferapp.com/1/profiles.json?access_token=YOUR_TOKEN"
 */

export type BufferPlatform = 'x' | 'instagram';
export type BufferMode = 'draft' | 'queue' | 'now';

export interface BufferPublishInput {
  platform: BufferPlatform;
  text: string;
  mediaUrl?: string;
  mode?: BufferMode;
  scheduledAt?: Date;
}

export interface BufferPublishResult {
  ok: boolean;
  enabled: boolean;
  updateId?: string;            // Buffer's id for the queued update
  bufferUrl?: string;            // Link to the post inside Buffer's UI
  externalUrl?: string;          // Once Buffer publishes, this is the X/IG permalink (not known at queue time)
  error?: string;
  rateLimited?: boolean;
}

const ENDPOINT = 'https://api.bufferapp.com/1/updates/create.json';

export function isBufferEnabled(): boolean {
  return process.env.BUFFER_ENABLED === 'true' && Boolean(process.env.BUFFER_ACCESS_TOKEN);
}

function profileIdFor(platform: BufferPlatform): string | undefined {
  if (platform === 'x') return process.env.BUFFER_PROFILE_ID_X;
  if (platform === 'instagram') return process.env.BUFFER_PROFILE_ID_INSTAGRAM;
  return undefined;
}

export async function publishToBuffer(input: BufferPublishInput): Promise<BufferPublishResult> {
  if (!isBufferEnabled()) {
    return {
      ok: false,
      enabled: false,
      error:
        'Buffer integration is disabled. Set BUFFER_ENABLED=true and BUFFER_ACCESS_TOKEN to enable.',
    };
  }

  const profileId = profileIdFor(input.platform);
  if (!profileId) {
    return {
      ok: false,
      enabled: true,
      error: `BUFFER_PROFILE_ID_${input.platform.toUpperCase()} is not set — cannot route ${input.platform} posts through Buffer.`,
    };
  }

  const mode: BufferMode = input.mode ?? (process.env.BUFFER_DEFAULT_MODE as BufferMode) ?? 'draft';

  const params = new URLSearchParams();
  params.append('access_token', process.env.BUFFER_ACCESS_TOKEN!);
  params.append('profile_ids[]', profileId);
  params.append('text', input.text);

  if (mode === 'now') {
    params.append('now', 'true');
  } else if (mode === 'draft') {
    // Buffer's "shared next" flag — kept in drafts column until manually scheduled.
    // The v1 API uses `shorten=false&top=false&now=false` and lets the lack of
    // scheduled_at default the update to the queue; for a true "draft" stop
    // before Buffer schedules, we instead create the update without queue
    // assignment by setting `now=false` and omitting scheduled_at.
    // Newer Buffer accounts can use the `is_draft=true` parameter.
    params.append('is_draft', 'true');
  } else if (input.scheduledAt) {
    params.append('scheduled_at', Math.floor(input.scheduledAt.getTime() / 1000).toString());
  }

  if (input.mediaUrl) {
    params.append('media[link]', input.mediaUrl);
    params.append('media[picture]', input.mediaUrl);
    params.append('media[thumbnail]', input.mediaUrl);
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (err) {
    return { ok: false, enabled: true, error: `network error reaching Buffer: ${(err as Error).message}` };
  }

  if (res.status === 429) {
    return { ok: false, enabled: true, rateLimited: true, error: 'rate limited by Buffer' };
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, enabled: true, error: `Buffer returned non-JSON (HTTP ${res.status})` };
  }

  if (!res.ok || payload?.success === false) {
    return {
      ok: false,
      enabled: true,
      error: `Buffer API error ${res.status}: ${payload?.message ?? payload?.error ?? 'unknown'}`,
    };
  }

  const update = Array.isArray(payload?.updates) ? payload.updates[0] : null;
  const updateId = update?.id ?? payload?.update?.id;
  if (!updateId) {
    return { ok: false, enabled: true, error: 'Buffer accepted the request but no update id was returned.' };
  }

  return {
    ok: true,
    enabled: true,
    updateId,
    bufferUrl: `https://publish.buffer.com/calendar/post/${updateId}`,
  };
}
