/**
 * OAuth helpers for marketing channels (X first).
 * - Stores access + refresh tokens in arca_oauth_tokens (one row per provider).
 * - Auto-refreshes access tokens.
 * - PKCE flow state stored in arca_oauth_states (short-lived).
 */

import crypto from 'crypto';
import { q } from '@/lib/db';

export interface OAuthTokenRecord {
  provider: string;
  account_id: string | null;
  account_handle: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

let schemaEnsured = false;
export async function ensureOauthSchema(): Promise<void> {
  if (schemaEnsured) return;
  await q(`
    CREATE TABLE IF NOT EXISTS arca_oauth_tokens (
      provider TEXT PRIMARY KEY,
      account_id TEXT,
      account_handle TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      scope TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS arca_oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_arca_oauth_states_created
           ON arca_oauth_states (created_at);`);
  schemaEnsured = true;
}

// --- PKCE helpers -----------------------------------------------------------

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function makeCodeVerifier(): string {
  return b64url(crypto.randomBytes(32));
}
export function codeChallengeFor(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}
export function makeRandomState(): string {
  return b64url(crypto.randomBytes(24));
}

// --- State table ------------------------------------------------------------

export async function saveOauthState(args: {
  state: string;
  provider: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<void> {
  await ensureOauthSchema();
  await q(
    `INSERT INTO arca_oauth_states (state, provider, code_verifier, redirect_uri)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (state) DO NOTHING`,
    [args.state, args.provider, args.codeVerifier, args.redirectUri],
  );
  // Best-effort cleanup of stale states (>1 hour old)
  await q(`DELETE FROM arca_oauth_states WHERE created_at < NOW() - INTERVAL '1 hour'`);
}

export async function consumeOauthState(state: string): Promise<{
  provider: string;
  code_verifier: string;
  redirect_uri: string;
} | null> {
  await ensureOauthSchema();
  const rows = await q<{ provider: string; code_verifier: string; redirect_uri: string }>(
    `DELETE FROM arca_oauth_states WHERE state = $1
     RETURNING provider, code_verifier, redirect_uri`,
    [state],
  );
  return rows[0] || null;
}

// --- Token table ------------------------------------------------------------

export async function saveOauthToken(args: {
  provider: string;
  accountId?: string | null;
  accountHandle?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSec?: number | null;
  scope?: string | null;
  metadata?: any;
}): Promise<void> {
  await ensureOauthSchema();
  const expiresAt = args.expiresInSec
    ? new Date(Date.now() + args.expiresInSec * 1000).toISOString()
    : null;
  await q(
    `INSERT INTO arca_oauth_tokens
       (provider, account_id, account_handle, access_token, refresh_token, expires_at, scope, metadata, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       account_id     = COALESCE(EXCLUDED.account_id, arca_oauth_tokens.account_id),
       account_handle = COALESCE(EXCLUDED.account_handle, arca_oauth_tokens.account_handle),
       access_token   = EXCLUDED.access_token,
       refresh_token  = COALESCE(EXCLUDED.refresh_token, arca_oauth_tokens.refresh_token),
       expires_at     = EXCLUDED.expires_at,
       scope          = COALESCE(EXCLUDED.scope, arca_oauth_tokens.scope),
       metadata       = COALESCE(EXCLUDED.metadata, arca_oauth_tokens.metadata),
       updated_at     = NOW()`,
    [
      args.provider,
      args.accountId || null,
      args.accountHandle || null,
      args.accessToken,
      args.refreshToken || null,
      expiresAt,
      args.scope || null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  );
}

export async function getOauthToken(provider: string): Promise<OAuthTokenRecord | null> {
  await ensureOauthSchema();
  const rows = await q<OAuthTokenRecord>(
    `SELECT * FROM arca_oauth_tokens WHERE provider = $1`,
    [provider],
  );
  return rows[0] || null;
}

export async function deleteOauthToken(provider: string): Promise<void> {
  await ensureOauthSchema();
  await q(`DELETE FROM arca_oauth_tokens WHERE provider = $1`, [provider]);
}

// --- X (Twitter) specific ---------------------------------------------------

const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const X_ME_URL = 'https://api.twitter.com/2/users/me';
const X_TWEET_URL = 'https://api.twitter.com/2/tweets';
const X_SCOPES = 'tweet.read tweet.write users.read offline.access';

export function xConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.X_CLIENT_ID || '';
  const clientSecret = process.env.X_CLIENT_SECRET || '';
  const redirectUri = process.env.X_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('X OAuth env vars missing (X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI).');
  }
  return { clientId, clientSecret, redirectUri };
}

export function xAuthorizeUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = xConfig();
  const u = new URL(X_AUTHORIZE_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', X_SCOPES);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = xConfig();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function xExchangeCode(args: {
  code: string;
  codeVerifier: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const { clientId, redirectUri } = xConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: redirectUri,
    code_verifier: args.codeVerifier,
    client_id: clientId,
  });
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: basicAuthHeader(),
      accept: 'application/json',
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function xRefreshToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const { clientId } = xConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: basicAuthHeader(),
      accept: 'application/json',
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Returns a fresh access_token, refreshing & persisting if needed. */
export async function getValidXAccessToken(): Promise<string> {
  const tok = await getOauthToken('x');
  if (!tok) throw new Error('X is not connected. Open Marketing Queue → Connect X.');
  const expMs = tok.expires_at ? new Date(tok.expires_at).getTime() : 0;
  const skew = 60_000; // refresh if <60s remaining
  if (expMs && expMs - skew > Date.now()) return tok.access_token;
  if (!tok.refresh_token) throw new Error('X token expired and no refresh token available — reconnect.');
  const refreshed = await xRefreshToken(tok.refresh_token);
  await saveOauthToken({
    provider: 'x',
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tok.refresh_token,
    expiresInSec: refreshed.expires_in || 7200,
    scope: refreshed.scope || tok.scope,
  });
  return refreshed.access_token;
}

export async function xFetchMe(accessToken: string): Promise<{ id: string; username: string; name?: string }> {
  const res = await fetch(X_ME_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X /users/me failed (${res.status}): ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  return json?.data || { id: '', username: '' };
}

export async function xPostTweet(text: string): Promise<{ id: string; text: string }> {
  const access = await getValidXAccessToken();
  const res = await fetch(X_TWEET_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`X tweet failed (${res.status}): ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  return json?.data || { id: '', text };
}
