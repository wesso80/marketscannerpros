// lib/jwt.ts
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const secret = new TextEncoder().encode(JWT_SECRET);

export type TokenPayload = {
  userId: string;
  email: string;
  tier?: string;
};

export async function signToken(payload: TokenPayload, expiresIn: string = '30m'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
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
