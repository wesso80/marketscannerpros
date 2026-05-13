/**
 * Instagram Graph API client (Business / Creator accounts) for the Growth
 * Command Centre.
 *
 * STATUS: STUB (feature-gated). Until IG_API_ENABLED=true and credentials are
 * configured, publish requests return a structured "not-enabled" response.
 *
 * ENV REQUIRED to go live:
 *   IG_API_ENABLED               — "true" to enable real publishing
 *   IG_BUSINESS_ACCOUNT_ID       — IG Business/Creator account id (numeric)
 *   IG_ACCESS_TOKEN              — long-lived Meta access token with
 *                                  instagram_basic, instagram_content_publish,
 *                                  pages_read_engagement scopes
 *   IG_GRAPH_VERSION             — optional, defaults to "v21.0"
 *
 * Endpoints:
 *   POST /{ig-user-id}/media        — create media container (image/reel/carousel-item)
 *   POST /{ig-user-id}/media_publish — publish the container by creation_id
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

const GRAPH_BASE = 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || 'v21.0';

export type IgMediaType = 'IMAGE' | 'REELS' | 'CAROUSEL';

export interface IgPublishInput {
  caption: string;
  mediaType: IgMediaType;
  imageUrl?: string;                  // for IMAGE
  videoUrl?: string;                  // for REELS
  carouselItemUrls?: string[];        // for CAROUSEL (2..10 image/video URLs)
  shareToFeed?: boolean;              // REELS only — share to main feed
}

export interface IgPublishResult {
  ok: boolean;
  externalId?: string;                // IG media id
  externalUrl?: string;               // permalink (best-effort)
  enabled: boolean;
  error?: string;
  permissionError?: boolean;          // Meta app review / scope issue
}

export function isInstagramEnabled(): boolean {
  return (
    process.env.IG_API_ENABLED === 'true' &&
    Boolean(process.env.IG_ACCESS_TOKEN) &&
    Boolean(process.env.IG_BUSINESS_ACCOUNT_ID)
  );
}

async function createMediaContainer(params: URLSearchParams): Promise<{ id?: string; error?: string; permissionError?: boolean }> {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${process.env.IG_BUSINESS_ACCOUNT_ID}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return parseMetaResponse(res);
}

async function publishContainer(creationId: string): Promise<{ id?: string; error?: string; permissionError?: boolean }> {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: process.env.IG_ACCESS_TOKEN!,
  });
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${process.env.IG_BUSINESS_ACCOUNT_ID}/media_publish`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return parseMetaResponse(res);
}

async function parseMetaResponse(res: Response) {
  let body: any;
  try {
    body = await res.json();
  } catch {
    return { error: `Meta API non-JSON response (status ${res.status})` };
  }
  if (!res.ok || body?.error) {
    const err = body?.error;
    const code = err?.code as number | undefined;
    const subcode = err?.error_subcode as number | undefined;
    // 10, 200, 803 etc. are common permission/scope errors.
    const permissionError = [10, 200, 803, 190].includes(code ?? -1) || subcode === 458;
    return {
      error: `Meta API ${res.status}: ${err?.message ?? 'unknown'} (code=${code}, subcode=${subcode})`,
      permissionError,
    };
  }
  return { id: body.id as string | undefined };
}

export async function publishToInstagram(input: IgPublishInput): Promise<IgPublishResult> {
  if (!isInstagramEnabled()) {
    return {
      ok: false,
      enabled: false,
      error:
        'Instagram integration is disabled. Set IG_API_ENABLED=true, IG_ACCESS_TOKEN, and IG_BUSINESS_ACCOUNT_ID to publish.',
    };
  }

  // ── Build media container(s) ──
  let creationId: string | undefined;

  if (input.mediaType === 'IMAGE') {
    if (!input.imageUrl) return { ok: false, enabled: true, error: 'imageUrl required for IMAGE post' };
    const params = new URLSearchParams({
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: process.env.IG_ACCESS_TOKEN!,
    });
    const r = await createMediaContainer(params);
    if (r.error) return { ok: false, enabled: true, error: r.error, permissionError: r.permissionError };
    creationId = r.id;
  } else if (input.mediaType === 'REELS') {
    if (!input.videoUrl) return { ok: false, enabled: true, error: 'videoUrl required for REELS post' };
    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: String(input.shareToFeed ?? true),
      access_token: process.env.IG_ACCESS_TOKEN!,
    });
    const r = await createMediaContainer(params);
    if (r.error) return { ok: false, enabled: true, error: r.error, permissionError: r.permissionError };
    creationId = r.id;
  } else if (input.mediaType === 'CAROUSEL') {
    const items = input.carouselItemUrls ?? [];
    if (items.length < 2 || items.length > 10) {
      return { ok: false, enabled: true, error: 'CAROUSEL requires 2–10 item URLs' };
    }
    const itemIds: string[] = [];
    for (const url of items) {
      const params = new URLSearchParams({
        image_url: url,
        is_carousel_item: 'true',
        access_token: process.env.IG_ACCESS_TOKEN!,
      });
      const r = await createMediaContainer(params);
      if (r.error || !r.id) {
        return { ok: false, enabled: true, error: r.error ?? 'failed to create carousel item', permissionError: r.permissionError };
      }
      itemIds.push(r.id);
    }
    const params = new URLSearchParams({
      media_type: 'CAROUSEL',
      caption: input.caption,
      children: itemIds.join(','),
      access_token: process.env.IG_ACCESS_TOKEN!,
    });
    const r = await createMediaContainer(params);
    if (r.error) return { ok: false, enabled: true, error: r.error, permissionError: r.permissionError };
    creationId = r.id;
  } else {
    return { ok: false, enabled: true, error: `unsupported mediaType: ${input.mediaType as string}` };
  }

  if (!creationId) {
    return { ok: false, enabled: true, error: 'Media container created but no creation_id returned' };
  }

  // ── Publish ──
  const pub = await publishContainer(creationId);
  if (pub.error || !pub.id) {
    return { ok: false, enabled: true, error: pub.error ?? 'publish failed', permissionError: pub.permissionError };
  }

  return {
    ok: true,
    enabled: true,
    externalId: pub.id,
    externalUrl: `https://www.instagram.com/p/${pub.id}/`, // best-effort; real shortcode requires extra fetch
  };
}
