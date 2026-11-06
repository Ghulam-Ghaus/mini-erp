import { describe, expect, it } from 'vitest';
import { hashPin, signJwt, verifyJwt, verifyPinHash } from './security.js';

describe('PIN hashing (bcrypt)', () => {
  it('hashes a PIN and verifies matching/non-matching PINs', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toBe('1234');
    expect(await verifyPinHash('1234', hash)).toBe(true);
    expect(await verifyPinHash('9999', hash)).toBe(false);
  });
});

describe('JWT signing and verification (HS256)', () => {
  const secret = 'test-secret-at-least-16-chars';

  it('signs and verifies a valid payload', () => {
    const token = signJwt({ sub: 1, orgId: 1, roleCode: 'ADMIN' }, secret, 60);
    const decoded = verifyJwt(token, secret);
    expect(decoded.sub).toBe(1);
    expect(decoded.orgId).toBe(1);
    expect(decoded.roleCode).toBe('ADMIN');
  });

  it('rejects a tampered token or wrong secret', () => {
    const token = signJwt({ sub: 1, orgId: 1, roleCode: 'ADMIN' }, secret, 60);
    expect(() => verifyJwt(token, 'wrong-secret-at-least-16-chars')).toThrow();
    expect(() => verifyJwt(`${token}x`, secret)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 1, orgId: 1, roleCode: 'ADMIN' }, secret, -10);
    expect(() => verifyJwt(token, secret)).toThrow(/expired/);
  });
});
