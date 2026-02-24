// lib/jwt.ts
import { SignJWT, jwtVerify } from 'jose';

export type TokenPayload = {
  userId: string;
  email: string;
  tier?: string;
};

/** Lazy-initialised secret – throws only when JWT operations are actually called */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(raw);
}

export async function signToken(payload: TokenPayload, expiresIn: string = '30m'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyBearer(authHeader: string): Promise<TokenPayload | null> {
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) return null;
  return verifyToken(token);
}
