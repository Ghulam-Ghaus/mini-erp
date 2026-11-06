import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

const BCRYPT_ROUNDS = 10;

/** Hashes a user PIN using bcrypt. Never log the input PIN. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

/** Verifies a plain PIN against its stored bcrypt hash. */
export async function verifyPinHash(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export interface JwtPayload {
  readonly sub: number;
  readonly orgId: number;
  readonly roleCode: string;
  readonly iat: number;
  readonly exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Signs a compact HS256 JWT token using Node's built-in crypto. */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds = 60 * 60 * 12, // 12 hours
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerSegment = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadSegment = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerSegment}.${payloadSegment}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/** Verifies a compact HS256 JWT token and returns its payload, or throws if invalid/expired. */
export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const data = `${headerSegment}.${payloadSegment}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest();
  const actualSig = Buffer.from(signatureSegment, 'base64url');
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new Error('Invalid token signature');
  }
  const parsed = JSON.parse(
    Buffer.from(payloadSegment, 'base64url').toString('utf8'),
  ) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (typeof parsed.exp !== 'number' || parsed.exp < now) {
    throw new Error('Token expired');
  }
  return parsed;
}
