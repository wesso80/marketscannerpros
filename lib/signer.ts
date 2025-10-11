import crypto from 'crypto';

const SECRET = process.env.APP_SIGNING_SECRET || 'dev-secret-change-me';

export function sign(workspaceId: string): string {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(workspaceId);
  return hmac.digest('base64url');
}

export function verify(workspaceId: string, signature: string): boolean {
  const expected = sign(workspaceId);
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
